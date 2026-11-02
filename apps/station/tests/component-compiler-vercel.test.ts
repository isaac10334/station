import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compileWithVercel,
  readVercelBuildConfig,
  vercelAuthenticationFailure,
  vercelBuildCredentials,
} from "../server/component-compiler-vercel";

const config = { teamId: "team_fixture", projectId: "prj_fixture", snapshotId: "snap_fixture", toolchain: "pinned fixture", stage: "ready" };
const source = { id: "greeting", revision: 1, files: { "Cargo.toml": "fixture" } };
const oidc = (exp: unknown) => `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
type Dependencies = NonNullable<Parameters<typeof compileWithVercel>[3]>;

async function temporary(run: (paths: { artifactDir: string; sandboxConfig: string; translator: string }) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "station-vercel-compiler-"));
  try {
    const sandboxConfig = join(directory, "config.json");
    await writeFile(sandboxConfig, JSON.stringify(config));
    await run({ artifactDir: join(directory, "artifacts"), sandboxConfig, translator: "unused" });
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test("compiler configuration fails before provisioning; unprimed snapshots cannot build", async () => temporary(async paths => {
  let creates = 0;
  const dependencies: Dependencies = { env: {}, createSandbox: async () => { creates++; throw new Error("must not create"); } };
  await writeFile(paths.sandboxConfig, "invalid json");
  await expect(compileWithVercel(source, paths, undefined, dependencies)).rejects.toThrow("configuration is invalid");
  await writeFile(paths.sandboxConfig, JSON.stringify({ ...config, stage: "toolchain" }));
  await expect(compileWithVercel(source, paths, undefined, dependencies)).rejects.toThrow("not been primed");
  expect((await readVercelBuildConfig(paths.sandboxConfig, true)).stage).toBe("toolchain");
  expect(creates).toBe(0);
}));

test("legacy ready configs remain usable; explicit tokens outrank stale OIDC and missing auth is actionable", async () => temporary(async paths => {
  const { stage: _, ...legacy } = config;
  await writeFile(paths.sandboxConfig, JSON.stringify(legacy));
  expect(await readVercelBuildConfig(paths.sandboxConfig)).toEqual(legacy);
  expect(vercelBuildCredentials(config, { VERCEL_AUTH_TOKEN: "opaque-token", VERCEL_OIDC_TOKEN: oidc(1) })).toEqual({ token: "opaque-token", teamId: config.teamId, projectId: config.projectId });
  expect(() => vercelBuildCredentials(config, {})).toThrow("vercel env pull .env.local --yes");
  expect(vercelBuildCredentials(config, { VERCEL: "1" })).toEqual({});
}));

test("expired OIDC reaches SDK refresh; failed refresh is sanitized and explains recovery", async () => temporary(async paths => {
  let creates = 0;
  await expect(compileWithVercel(source, paths, undefined, {
    env: { VERCEL_OIDC_TOKEN: oidc(1) },
    createSandbox: async () => { creates++; throw new Error("LocalOidcContextError with sensitive provider payload"); },
  })).rejects.toThrow("OIDC token expired and SDK refresh failed");
  expect(creates).toBe(1);
  const message = vercelAuthenticationFailure({ VERCEL_OIDC_TOKEN: "malformed-sensitive-token" }).message;
  expect(message).toContain("vercel env pull");
  expect(message).not.toContain("malformed-sensitive-token");
  expect(vercelAuthenticationFailure({ VERCEL_AUTH_TOKEN: "valid-api-token", VERCEL_OIDC_TOKEN: oidc(1) }).message).not.toContain("SDK refresh failed");
}));

test("missing snapshots report provisioning rather than compiler diagnostics", async () => temporary(async paths => {
  await expect(compileWithVercel(source, paths, undefined, {
    env: { VERCEL_AUTH_TOKEN: "fixture" },
    createSandbox: async () => { throw new Error("Snapshot not found"); },
  })).rejects.toThrow("snapshot is unavailable or expired");
}));

function sandboxFixture(options: { exitCode?: number; cleanupError?: boolean; onRun?: () => void } = {}) {
  let deletes = 0;
  const sandbox = {
    mkDir: async () => {},
    writeFiles: async () => {},
    runCommand: async () => {
      options.onRun?.();
      return { exitCode: options.exitCode ?? 0, stderr: async () => "error[E0308]: mismatched types" };
    },
    readFileToBuffer: async () => Buffer.from([0, 97, 115, 109, 13, 0, 1, 0]),
    delete: async () => { deletes++; if (options.cleanupError) throw new Error("cleanup failed"); },
  };
  const createSandbox: Dependencies["createSandbox"] = async () => sandbox as any;
  return { createSandbox, get deletes() { return deletes; } };
}

test("Vercel compile keeps deny-all and pinned source; returns untrusted bytes for common verification", async () => temporary(async paths => {
  const fixture = sandboxFixture();
  let received: any;
  const result = await compileWithVercel(source, paths, undefined, {
    env: { VERCEL_AUTH_TOKEN: "fixture" },
    createSandbox: async options => { received = options; return fixture.createSandbox!(options); },
  });
  expect(received.networkPolicy).toBe("deny-all");
  expect(received.source).toEqual({ type: "snapshot", snapshotId: config.snapshotId });
  expect(received.persistent).toBe(false);
  expect(result.environmentId).toBe(config.snapshotId);
  expect(result.toolchain).toBe(config.toolchain);
  expect(result.bytes.length).toBe(8);
  expect(fixture.deletes).toBe(1);
}));

test("cleanup failure never masks Rust compilation diagnostics", async () => temporary(async paths => {
  const fixture = sandboxFixture({ exitCode: 101, cleanupError: true });
  await expect(compileWithVercel(source, paths, undefined, { env: { VERCEL_AUTH_TOKEN: "fixture" }, createSandbox: fixture.createSandbox })).rejects.toThrow("error[E0308]");
  expect(fixture.deletes).toBe(1);
}));

test("cancellation removes the owned sandbox once and suppresses late compiler results", async () => temporary(async paths => {
  const controller = new AbortController();
  const fixture = sandboxFixture({ onRun: () => controller.abort(new Error("cancelled fixture")) });
  await expect(compileWithVercel(source, paths, controller.signal, { env: { VERCEL_AUTH_TOKEN: "fixture" }, createSandbox: fixture.createSandbox })).rejects.toThrow("cancelled fixture");
  expect(fixture.deletes).toBe(1);
}));

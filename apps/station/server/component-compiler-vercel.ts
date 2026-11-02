import { Sandbox } from "@vercel/sandbox";
import { BuildFailure, type BuildSource } from "../src/core/build-contract";
import type { ComponentBuildPaths } from "./component-build";
const MAX_ARTIFACT_BYTES = 5_000_000;
const REFRESH_AUTH = "Run bunx vercel env pull .env.local --yes from the Station checkout, then restart the server. Installed desktop credentials belong to its own profile .env.";

/** Operator-owned compiler configuration. A raw toolchain snapshot is not build-ready. */
export interface VercelBuildConfig {
  teamId: string;
  projectId: string;
  snapshotId: string;
  toolchain: string;
  stage?: "toolchain" | "ready";
}

/** Validate before provisioning compute. Legacy, already-primed configurations remain supported. */
export async function readVercelBuildConfig(path: string, allowUnprimed = false): Promise<VercelBuildConfig> {
  const configFile = Bun.file(path);
  if (!(await configFile.exists()))
    throw new BuildFailure("Sandbox toolchain is not provisioned. Run bun run setup:sandbox.", 503);
  let config: VercelBuildConfig;
  try {
    const value: unknown = await configFile.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const data = value as Record<string, unknown>;
    if (!["teamId", "projectId", "snapshotId", "toolchain"].every(key => typeof data[key] === "string" && (data[key] as string).trim().length > 0) ||
      (data.stage !== undefined && data.stage !== "toolchain" && data.stage !== "ready")) throw new Error();
    config = data as unknown as VercelBuildConfig;
  } catch {
    throw new BuildFailure("Sandbox toolchain configuration is invalid. Run bun run setup:sandbox.", 503);
  }
  if (config.stage === "toolchain" && !allowUnprimed)
    throw new BuildFailure("Sandbox dependencies have not been primed. Run bun run setup:sandbox.", 503);
  return config;
}

/** Explicit API tokens take precedence. OIDC validation and refresh remain SDK-owned. */
export function vercelBuildCredentials(config: Pick<VercelBuildConfig, "teamId" | "projectId">, env: Record<string, string | undefined> = process.env) {
  const token = env.VERCEL_AUTH_TOKEN;
  if (token) return { token, teamId: config.teamId, projectId: config.projectId };
  if (!env.VERCEL_OIDC_TOKEN && env.VERCEL !== "1") throw new BuildFailure(`Vercel Sandbox authentication is missing. ${REFRESH_AUTH}`, 503);
  return {};
}

/** Call only after SDK authentication/refresh failed. Decoding expiry is diagnostic,
 * not signature verification, and must never prevent a valid SDK token refresh. */
export function vercelAuthenticationFailure(env: Record<string, string | undefined> = process.env, now = Date.now()): BuildFailure {
  let expired = false;
  if (!env.VERCEL_AUTH_TOKEN) {
    try {
      const { exp } = JSON.parse(Buffer.from(env.VERCEL_OIDC_TOKEN?.split(".")[1] ?? "", "base64url").toString());
      expired = typeof exp === "number" && Number.isFinite(exp) && exp * 1000 <= now;
    } catch { /* Never include token contents or parser errors in diagnostics. */ }
  }
  return new BuildFailure(`${expired ? "Vercel Sandbox OIDC token expired and SDK refresh failed. Local tokens last 12 hours." : "Vercel Sandbox authentication is unavailable or expired."} ${REFRESH_AUTH}`, 503);
}

type BuildSandbox = Pick<Sandbox, "mkDir" | "writeFiles" | "runCommand" | "readFileToBuffer" | "delete">;
interface VercelCompilerDependencies {
  createSandbox?(options: Parameters<typeof Sandbox.create>[0]): Promise<BuildSandbox>;
  env?: Record<string, string | undefined>;
}

/** Vercel compiler adapter. Only the common verifier may inspect/publish results.
 * Cancellation owns sandbox deletion; cleanup errors must not hide compile errors. */
export async function compileWithVercel(source: BuildSource, paths: ComponentBuildPaths, signal?: AbortSignal, dependencies: VercelCompilerDependencies = {}) {
  signal?.throwIfAborted();
  const config = await readVercelBuildConfig(paths.sandboxConfig);
  const { snapshotId, toolchain } = config;
  const credentials = vercelBuildCredentials(config, dependencies.env);
  signal?.throwIfAborted();
  const sandbox = await (dependencies.createSandbox ?? (options => Sandbox.create(options)))({
    ...credentials,
    source: { type: "snapshot", snapshotId },
    signal,
    persistent: false,
    timeout: 10 * 60_000,
    networkPolicy: "deny-all",
    tags: { purpose: "station-build", asset: source.id },
  }).catch((error) => {
    if (
      error instanceof Error && /Oidc|credentials|authentication|unauthorized|forbidden/i.test(`${error.name} ${error.message}`)
    )
      throw vercelAuthenticationFailure(dependencies.env);
    if (error instanceof Error && /snapshot/i.test(error.message) && /expired|not found|does not exist|deleted/i.test(error.message))
      throw new BuildFailure("Sandbox toolchain snapshot is unavailable or expired. Run bun run setup:sandbox to provision and prime a replacement.", 503);
    throw error;
  });
  let deletion: Promise<unknown> | undefined;
  const remove = () => deletion ??= sandbox.delete();
  const abort = () => { void remove().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  let failed = false;
  try {
    signal?.throwIfAborted();
    await sandbox.mkDir("/vercel/unit");
    await sandbox.mkDir("/vercel/unit/src");
    await sandbox.mkDir("/vercel/unit/wit");
    await sandbox.mkDir("/vercel/unit/wit/deps");
    await sandbox.mkDir("/vercel/unit/wit/deps/wasi-clocks");
    await sandbox.writeFiles(
      Object.entries(source.files).map(([path, content]) => ({
        path: `/vercel/unit/${path}`,
        content: new TextEncoder().encode(content),
      })),
    );
    const result = await sandbox.runCommand({
      cmd: "/vercel/.cargo/bin/cargo",
      args: [
        "+nightly-2026-09-08",
        "build",
        "--release",
        "--offline",
        "--locked",
        "--target",
        "wasm32-wasip2",
        "--manifest-path",
        "/vercel/unit/Cargo.toml",
      ],
      cwd: "/vercel/unit",
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) {
      const diagnostics = (await result.stderr()).slice(-12_000);
      throw new BuildFailure(`Component build failed:\n${diagnostics}`, 422);
    }
    const artifactPath = `target/wasm32-wasip2/release/${source.id.replaceAll("-", "_")}.wasm`;
    const output = await sandbox.readFileToBuffer({
      path: artifactPath,
      cwd: "/vercel/unit",
    });
    signal?.throwIfAborted();
    if (
      !output ||
      output.byteLength === 0 ||
      output.byteLength > MAX_ARTIFACT_BYTES
    )
      throw new BuildFailure(
        "Build did not produce a valid sized Component artifact.",
        422,
      );
    const bytes = new Uint8Array(output);
    return { bytes, toolchain, environmentId: snapshotId };
  } catch (error) {
    failed = true;
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    try { await remove(); } catch (error) { if (!failed) throw error; }
  }
}

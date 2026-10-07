import { Sandbox } from "@vercel/sandbox";
import { mkdir, writeFile } from "node:fs/promises";
import { Translator } from "@polyengine/runtime/shim";
import { inspectComponentPlan } from "./src/component-plan";
import { BuildFailure, sha256, sourceSha256, witSha256, type BuildSource, type BuiltArtifact } from "./src/build-contract";

const artifactDir = new URL("./.artifacts/", import.meta.url);
const MAX_ARTIFACT_BYTES = 5_000_000;
let translatorPromise: Promise<Translator> | undefined;
function translator(): Promise<Translator> {
  return translatorPromise ??= Bun.file(new URL("./node_modules/@polyengine/translator/esm/translator_shim.wasm", import.meta.url))
    .arrayBuffer().then((bytes) => Translator.create(new Uint8Array(bytes)))
    .catch((error) => { translatorPromise = undefined; throw error; });
}

export async function buildComponent(source: BuildSource): Promise<{ metadata: BuiltArtifact; bytes: Uint8Array }> {
  const configFile = Bun.file(new URL("./vercel-sandbox.json", import.meta.url));
  if (!(await configFile.exists())) throw new BuildFailure("Sandbox toolchain is not provisioned. Run bun run setup:sandbox.", 503);
  const { teamId, projectId, snapshotId, toolchain } = await configFile.json() as Record<string, string>;
  const token = process.env.VERCEL_AUTH_TOKEN;
  if (!token && !process.env.VERCEL_OIDC_TOKEN)
    throw new BuildFailure("Vercel Sandbox authentication is missing. Run vercel link and vercel env pull.", 503);
  const sourceHash = await sourceSha256(source.files);
  const sandbox = await Sandbox.create({
    ...(token ? { token, teamId, projectId } : {}), source: { type: "snapshot", snapshotId },
    persistent: false, timeout: 10 * 60_000, networkPolicy: "deny-all",
    tags: { purpose: "unit-workspace-build", unit: source.id },
  });
  try {
    await sandbox.mkDir("/vercel/unit");
    await sandbox.mkDir("/vercel/unit/src");
    await sandbox.mkDir("/vercel/unit/wit");
    await sandbox.mkDir("/vercel/unit/wit/deps");
    await sandbox.mkDir("/vercel/unit/wit/deps/wasi-clocks");
    await sandbox.writeFiles(Object.entries(source.files).map(([path, content]) => ({ path: `/vercel/unit/${path}`, content: Buffer.from(content) })));
    const result = await sandbox.runCommand({
      cmd: "/vercel/.cargo/bin/cargo",
      args: ["+nightly-2026-09-08", "build", "--release", "--offline", "--locked", "--target", "wasm32-wasip2", "--manifest-path", "/vercel/unit/Cargo.toml"],
      cwd: "/vercel/unit",
    });
    if (result.exitCode !== 0) {
      const diagnostics = (await result.stderr()).slice(-12_000);
      throw new BuildFailure(`Component build failed:\n${diagnostics}`, 422);
    }
    const artifactPath = `target/wasm32-wasip2/release/${source.id.replaceAll("-", "_")}.wasm`;
    const output = await sandbox.readFileToBuffer({ path: artifactPath, cwd: "/vercel/unit" });
    if (!output || output.byteLength === 0 || output.byteLength > MAX_ARTIFACT_BYTES)
      throw new BuildFailure("Build did not produce a valid sized Component artifact.", 422);
    const bytes = new Uint8Array(output);
    if (bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109 || bytes[4] !== 13)
      throw new BuildFailure("Build output is not a WebAssembly Component.", 422);
    let inspected: ReturnType<typeof inspectComponentPlan>;
    let translatorSha256: string;
    try {
      const engine = await translator();
      translatorSha256 = engine.buildHash!;
      inspected = inspectComponentPlan(engine.translate(bytes).plan);
    } catch (error) {
      throw new BuildFailure(`Build output failed P3 validation: ${error instanceof Error ? error.message : String(error)}`, 422);
    }
    const hash = await sha256(bytes);
    const metadata: BuiltArtifact = {
      schemaVersion: 2, buildId: crypto.randomUUID(), id: source.id, revision: source.revision,
      sourceSha256: sourceHash, sha256: hash, bytes: bytes.byteLength,
      builtBy: "vercel-sandbox", profile: "component-model-0.3",
      worldDigest: inspected.worldDigest, imports: inspected.imports,
      toolchain, snapshotId, witSha256: await witSha256(source.files), translatorSha256,
    };
    await mkdir(artifactDir, { recursive: true });
    await writeFile(new URL(`./.artifacts/${hash}.wasm`, import.meta.url), bytes);
    await writeFile(new URL(`./.artifacts/${hash}-${metadata.buildId}.json`, import.meta.url), JSON.stringify(metadata, null, 2) + "\n", { flag: "wx" });
    return { metadata, bytes };
  } finally {
    await sandbox.delete();
  }
}

export async function readArtifact(hash: string): Promise<Uint8Array | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const file = Bun.file(new URL(`./.artifacts/${hash}.wasm`, import.meta.url));
  if (!(await file.exists())) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return await sha256(bytes) === hash ? bytes : null;
}

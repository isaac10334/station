import { selectComponentCompiler, type ComponentCompiler } from "./component-compilers";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { Translator } from "@polyengine/runtime/shim";
import { inspectComponentPlan } from "../src/providers/component-plan";
import {
  BuildFailure,
  sha256,
  sourceSha256,
  witSha256,
  validateSource,
  type BuildSource,
  type BuiltArtifact,
} from "../src/core/build-contract";

/** Runtime resources stay read-only; built assets belong to persistent user data. */
export interface ComponentBuildPaths {
  artifactDir: string;
  sandboxConfig: string;
  translator: string;
}
const defaultArtifactDir = join(import.meta.dir, "../../../.artifacts");
const defaultPaths = (): ComponentBuildPaths => ({
  artifactDir: defaultArtifactDir,
  sandboxConfig: join(import.meta.dir, "../vercel-sandbox.json"),
  translator: join(dirname(require.resolve("@polyengine/translator/package.json")), "esm/translator_shim.wasm"),
});
const MAX_ARTIFACT_BYTES = 5_000_000;
let translatorPromise: Promise<Translator> | undefined;
function translator(path: string): Promise<Translator> {
  return (translatorPromise ??= Bun.file(path)
    .arrayBuffer()
    .then((bytes) => Translator.create(new Uint8Array(bytes)))
    .catch((error) => {
      translatorPromise = undefined;
      throw error;
    }));
}

export async function buildComponent(
  source: BuildSource,
  paths = defaultPaths(),
  signal?: AbortSignal,
  compiler: ComponentCompiler = selectComponentCompiler(),
): Promise<{ metadata: BuiltArtifact; bytes: Uint8Array }> {
  signal?.throwIfAborted();
  source = validateSource(source);
  const compiled = await compiler.compile(source, paths, signal);
  signal?.throwIfAborted(); const bytes = compiled.bytes, toolchain = compiled.toolchain;
  if (!bytes.length || bytes.length > MAX_ARTIFACT_BYTES) throw new BuildFailure("Compiler output exceeds the artifact limit", 422);
  const sourceHash = await sourceSha256(source.files);
    if (
      bytes[0] !== 0 ||
      bytes[1] !== 97 ||
      bytes[2] !== 115 ||
      bytes[3] !== 109 ||
      bytes[4] !== 13
    )
      throw new BuildFailure(
        "Build output is not a WebAssembly Component.",
        422,
      );
    let inspected: ReturnType<typeof inspectComponentPlan>;
    let translatorSha256: string;
    try {
      const engine = await translator(paths.translator);
      translatorSha256 = engine.buildHash!;
      inspected = inspectComponentPlan(engine.translate(bytes).plan);
    } catch (error) {
      throw new BuildFailure(
        `Build output failed P3 validation: ${error instanceof Error ? error.message : String(error)}`,
        422,
      );
    }
    const hash = await sha256(bytes);
    signal?.throwIfAborted();
    const metadata: BuiltArtifact = {
      schemaVersion: 2,
      buildId: crypto.randomUUID(),
      id: source.id,
      revision: source.revision,
      sourceSha256: sourceHash,
      sha256: hash,
      bytes: bytes.byteLength,
      builtBy: compiler.id,
      profile: "component-model-0.3",
      worldDigest: inspected.worldDigest,
      imports: inspected.imports,
      toolchain,
      snapshotId: compiled.environmentId,
      witSha256: await witSha256(source.files),
      translatorSha256,
    };
    await mkdir(paths.artifactDir, { recursive: true });
    await writeFile(join(paths.artifactDir, `${hash}.wasm`), bytes);
    await writeFile(
      join(paths.artifactDir, `${hash}-${metadata.buildId}.json`),
      JSON.stringify(metadata, null, 2) + "\n",
      { flag: "wx" },
    );
    return { metadata, bytes };
}

export async function readArtifact(
  hash: string,
  artifactDir = defaultArtifactDir,
): Promise<Uint8Array | null> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const file = Bun.file(join(artifactDir, `${hash}.wasm`));
  if (!(await file.exists())) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return (await sha256(bytes)) === hash ? bytes : null;
}

/** Build with Bun --target node. Runs real P3 bytes in isolated Node/V8 workers. */
import { Worker } from "node:worker_threads";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Translator } from "@polyengine/runtime/shim";
import { sha256 } from "../src/core/build-contract";
import { lifecycleAcceptance } from "./scripting-proof/acceptance";
import { inspectProof } from "./scripting-proof/inspection";
import { manifestSchema, TRANSLATOR_HASH } from "./scripting-proof/contracts";

const [directory, workerPath] = process.argv.slice(2);
if (!directory || !workerPath) throw new Error("Pass the Loop experiment directory and Node worker bundle path");
const root = resolve(directory);
const generated = join(root, "target/rquickjs-lifecycle");
const bytes = new Uint8Array(await readFile(join(generated, "target/wasm32-wasip2/release/probe.wasm")));
const require = createRequire(resolve("apps/station/package.json"));
const shim = new Uint8Array(await readFile(join(dirname(require.resolve("@polyengine/translator/package.json")), "esm/translator_shim.wasm")));
if (await sha256(shim) !== TRANSLATOR_HASH) throw new Error("Pinned translator bytes are required");
async function generatedSources(path: string): Promise<string[]> {
  const entries = await readdir(join(root, path), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    if (entry.isSymbolicLink()) throw new Error("Generated sources must not contain symlinks");
    return entry.isDirectory() ? generatedSources(`${path}/${entry.name}`) : [`${path}/${entry.name}`];
  }))).flat();
}
const sourceRecords = await Promise.all([
  "lifecycle.wit", "rquickjs-lifecycle.js", "rquickjs-probe.Cargo.lock", "prepare-rquickjs-probe.ps1",
  "target/rquickjs-lifecycle/Cargo.toml", "target/rquickjs-lifecycle/Cargo.lock", "target/rquickjs-lifecycle/.cargo/config.toml",
  ...await generatedSources("target/rquickjs-lifecycle/src"), ...await generatedSources("target/rquickjs-lifecycle/wit"),
].sort().map(async path => `${path} ${await sha256(new Uint8Array(await readFile(join(root, path))))}`));
const sourceHash = await sha256(new TextEncoder().encode(sourceRecords.join("\n")));
const identity = JSON.parse(await readFile(join(generated, "build-identity.json"), "utf8"));
if (identity.sourceSha256 !== sourceHash || identity.sha256 !== await sha256(bytes) || identity.bytes !== bytes.length) throw new Error("Stale scripting engine: rebuild after source/dependency changes");
const translator = await Translator.create(shim);
const translation = translator.translate(bytes);
const inspection = await inspectProof(bytes, { ...translation, componentBytes: bytes });
const manifest = manifestSchema.parse({
  ...identity, importsSha256: inspection.importsSha256,
});
await writeFile(join(generated, "proof-manifest.json"), JSON.stringify(manifest, null, 2));
const report = await lifecycleAcceptance(() => {
  const worker = new Worker(resolve(workerPath));
  return { send: value => worker.postMessage(value), listen: listener => worker.on("message", listener), onError: listener => { worker.on("error", listener); }, terminate: () => { void worker.terminate(); } };
}, bytes, shim, manifest);
console.log(JSON.stringify({ ...report, manifest, executionHost: process.versions }, null, 2));
process.exitCode = report.passed ? 0 : 1;

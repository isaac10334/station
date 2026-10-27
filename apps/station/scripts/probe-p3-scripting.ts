/** Reproduce the P3 gate without changing production Component profiles.
 * Run with the verified componentize-qjs 0.4.5 executable and Loop experiment path.
 * A failed compiler/translator stage exits nonzero; it never selects a fallback.
 */
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { Translator } from "@polyengine/runtime/shim";
import { instantiate, requiredImports } from "@polyengine/runtime/embedder";
import ts from "typescript";
import { sha256 } from "../src/core/build-contract";

const [compiler, directory] = process.argv.slice(2);
if (!compiler || !directory) throw new Error("Usage: bun probe-p3-scripting.ts <componentize-qjs.exe> <experiment-directory>");
const root = resolve(directory);
const require = createRequire(resolve("apps/station/package.json"));
await mkdir(join(root, "target"), { recursive: true });
const compilerSha256 = await sha256(new Uint8Array(await readFile(resolve(compiler))));
if (compilerSha256 !== "7b4e240a2cd110306144c3a69badb9b05bf08a6e7b3eb841367c8f1dab8f508a")
  throw new Error("Expected the verified v0.4.5 Windows x64 release executable");
const report: Record<string, unknown> = {
  compiler: "componentize-qjs@0.4.5", compilerCommit: "e563c6d6ae50b087980414015663ca9c948c09bb", compilerSha256,
  runtime: "@polyengine/runtime@0.6.7", executionHost: process.versions, stages: [],
};
const stages = report.stages as Record<string, unknown>[];
async function compile(stem: string, stubWasi: boolean) {
  const start = performance.now();
  const output = join(root, "target", `${stem}-${stubWasi ? "stubbed" : "wasi"}.wasm`);
  const child = spawnSync(resolve(compiler), ["--wit", `${stem}.wit`, "--js", `${stem}.js`, ...(stubWasi ? ["--stub-wasi"] : []), "--output", output], { cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024 });
  const exitCode = child.status ?? -1;
  stages.push({ stage: `compile:${stem}:${stubWasi ? "stubbed" : "wasi"}`, exitCode, elapsedMs: performance.now() - start, output: (child.stdout + child.stderr + (child.error?.message ?? "")).slice(0, 8192) });
  return exitCode === 0 ? new Uint8Array(await readFile(output)) : undefined;
}

let failed = false;
const bytes = await compile("evaluate-only", true);
if (bytes) {
  try {
    const shim = new Uint8Array(await readFile(join(dirname(require.resolve("@polyengine/translator/package.json")), "esm/translator_shim.wasm")));
    const start = performance.now();
    const translator = await Translator.create(shim);
    const translation = translator.translate(bytes);
    const imports = requiredImports(translation.plan).map(item => `${item.interfaceId}.${item.jsName}`);
    if (imports.length) throw new Error(`The no-import control acquired unexpected imports: ${imports.join(", ")}`);
    const translatedMs = performance.now() - start;
    const create = () => instantiate({ plan: translation.plan, adapters: translation.adapters, componentBytes: bytes }, {});
    const instance = await create();
    const transpileStarted = performance.now();
    const source = ts.transpileModule("async function run(input: { amount: number }): Promise<number> { return await Promise.resolve(input.amount * 2); }", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText + "\nreturn run(input);";
    const output = await instance.exports.evaluate(source, '{"amount":21}');
    if (output !== "42") throw new Error(`Unexpected evaluation result: ${output}`);
    const editToRunMs = performance.now() - transpileStarted;
    const warmStarted = performance.now();
    for (let i = 0; i < 10; i++) if (await instance.exports.evaluate("return input + 1;", String(i)) !== String(i + 1)) throw new Error("Warm result mismatch");
    const warmTenMs = performance.now() - warmStarted;
    const counter = "globalThis.counter = (globalThis.counter || 0) + 1; return globalThis.counter;";
    const retained = [await instance.exports.evaluate(counter, "null"), await instance.exports.evaluate(counter, "null")];
    const fresh = await (await create()).exports.evaluate(counter, "null");
    if (retained.join() !== "1,2" || fresh !== "1") throw new Error("Instance isolation mismatch");
    stages.push({ stage: "polyengine:evaluate-only", passed: true, componentSha256: await sha256(bytes), bytes: bytes.byteLength, translatorSha256: await sha256(shim), translatedMs, editToRunMs, warmTenMs, output, retained, fresh });
  } catch (error) { failed = true; stages.push({ stage: "polyengine:evaluate-only", passed: false, error: String(error) }); }
} else failed = true;

// These exercise the actual required custom async imports, not just async exports.
for (const stubbed of [false, true]) if (!await compile("probe", stubbed)) failed = true;
report.initialProbePassed = !failed;
report.fullAcceptanceComplete = false;
report.remainingAcceptance = ["async host services", "surface events and disposal", "bounded execution and cancellation", "DOM/headless UI parity"];
console.log(JSON.stringify(report, null, 2));
process.exitCode = failed ? 1 : 0;

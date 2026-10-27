/** Build-time only: inspect a pinned reusable engine, then package fixed resources. */
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { Translator } from "@polyengine/runtime/shim";
import { inspectScriptingEngine,inspectPortableUiEngine } from "../src/providers/scripting/inspection";
import { manifestSchema, TRANSLATOR_HASH } from "../src/features/programs/contracts/engine";
import { sha256 } from "../src/core/build-contract";
import { resolvedPackageRoot } from "../../../tooling/package-resolution";
import { homedir } from "node:os";
import { ensurePinnedExecutable } from "./pinned-executable";
const source = process.argv[2] ? resolve(process.argv[2]) : resolvedPackageRoot("@loop-kit/scripting", import.meta.dir);
// Bun's isolated store paths exceed Windows linker limits. Build only these
// resolved, content-addressed inputs in a short disposable tool cache instead.
const uiSource = resolvedPackageRoot("@loop-kit/ui", source);
const inputs = ["engine/evaluator.js", "engine/world.wit", "engine/Cargo.lock", "wit/services.wit", "build-engine.ps1"];
const inputBytes = await Promise.all(inputs.map(async path => new Uint8Array(await readFile(join(source,path)))));
const uiBytes = new Uint8Array(await readFile(join(uiSource,"wit/surfaces.wit")));
const identityHash = await sha256(new TextEncoder().encode(JSON.stringify(await Promise.all([...inputBytes,uiBytes].map(bytes=>sha256(bytes))))));
const staging = join(tmpdir(),`stn-engine-${identityHash.slice(0,16)}`);
const buildSource = join(staging,"scripting");
for (let index=0;index<inputs.length;index++) {
  const destination=join(buildSource,inputs[index]!);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,inputBytes[index]!);
}
await mkdir(join(staging,"ui/wit"),{recursive:true});await writeFile(join(staging,"ui/wit/surfaces.wit"),uiBytes);
const output = resolve(import.meta.dir, "../.runtime/scripting");
if (process.platform !== "win32" || process.arch !== "x64") throw new Error("The pinned scripting engine build currently requires Windows x64 and PowerShell. See docs/programmable-workspace-foundation.md.");
const compiler = await ensurePinnedExecutable({
  name: "wasm-rquickjs.exe",
  archiveName: "wasm-rquickjs-cli-v0.4.13-x86_64-pc-windows-msvc.zip",
  url: "https://github.com/golemcloud/wasm-rquickjs/releases/download/v0.4.13/wasm-rquickjs-cli-v0.4.13-x86_64-pc-windows-msvc.zip",
  archiveSha256: "582e356e2820c48f3dbc81e59eb395ddc552a48792f373ad8fa9e660c1aba7f5",
  executableSha256: "bc9d5aa48905e55760f18cb92ed988a34534ff0ce8824a71d6650464f8a68c63",
}, {
  directory: join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData/Local"), "StationDevTools/wasm-rquickjs/0.4.13"),
  override: process.env.STATION_SCRIPTING_COMPILER || undefined,
});
const child = Bun.spawnSync(["pwsh", "-NoProfile", "-File", join(buildSource, "build-engine.ps1"), "-Compiler", compiler], { stdout: "pipe", stderr: "pipe" });
if (child.exitCode !== 0) throw new Error(new TextDecoder().decode(child.stderr));
const root = join(buildSource,"target/engine");
const identity = JSON.parse(await readFile(join(root,"build-identity.json"),"utf8"));
const bytes = new Uint8Array(await readFile(join(root,"target/wasm32-wasip2/release/engine.wasm")));
if (await sha256(bytes) !== identity.sha256) throw new Error("Engine identity mismatch");
const require = createRequire(import.meta.url);
const shim = new Uint8Array(await readFile(join(dirname(require.resolve("@polyengine/translator/package.json")),"esm/translator_shim.wasm")));
if (await sha256(shim) !== TRANSLATOR_HASH) throw new Error("Translator mismatch");
const translator = await Translator.create(shim), translation = translator.translate(bytes);
const inspected = await inspectScriptingEngine(bytes,{...translation,componentBytes:bytes});
await inspectPortableUiEngine(bytes,{...translation,componentBytes:bytes});
const manifest = manifestSchema.parse({...identity,importsSha256:inspected.importsSha256});
await mkdir(output,{recursive:true});
await writeFile(join(output,"manifest.json"),JSON.stringify(manifest,null,2));
await writeFile(join(output,'portable-ui.json'),JSON.stringify({...manifest,profile:'loop-portable-ui-0.1'},null,2));
await copyFile(join(root,"target/wasm32-wasip2/release/engine.wasm"),join(output,"engine.wasm"));
console.log(JSON.stringify({profile:manifest.profile,sha256:manifest.sha256,memories:inspected.memories}));

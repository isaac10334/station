import variant from "@jitl/quickjs-singlefile-browser-release-sync";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import { scriptInputSchema, scriptOutputSchema, type ScriptInput } from "../contracts/script-runtime";
let modulePromise: ReturnType<typeof newQuickJSWASMModuleFromVariant> | undefined;
/** One compiled WASM engine, fresh VM per call. Even JSON serialization runs under
 * the interrupt/memory budget; no guest value or callback crosses into the host. */
export async function evaluateQuickJS(request: ScriptInput, signal?: AbortSignal) {
  const p = scriptInputSchema.parse(request);
  const input = JSON.stringify(p.input); if (input.length > 65536) throw new Error("Script input exceeds 64 KB");
  signal?.throwIfAborted();
  const module = await (modulePromise ??= newQuickJSWASMModuleFromVariant(variant).catch(e => { modulePromise = undefined; throw e; }));
  signal?.throwIfAborted(); const start = Date.now(), deadline = start + 200;
  const runtime = module.newRuntime(); runtime.setMemoryLimit(16 * 1024 * 1024); runtime.setMaxStackSize(256 * 1024); runtime.setInterruptHandler(() => !!signal?.aborted || Date.now() > deadline);
  const vm = runtime.newContext();
  try {
    const code = `"use strict"; const input = JSON.parse(${JSON.stringify(input)}); const row = input; const __logs = []; const console = Object.freeze({log:(...args)=>{if(__logs.length<20)__logs.push(args.map(v=>String(v).slice(0,1024)).join(" ").slice(0,2048));}}); const __value = (()=>{${p.expression ? `return (${p.code});` : p.code}\n})(); if (__value && typeof __value.then === "function") throw new Error("Return a synchronous JSON value"); const __json = JSON.stringify({value:__value === undefined ? null : __value,logs:__logs}); if(__json.length>65536)throw new Error("Script output exceeds 64 KB"); __json;`;
    const result = vm.evalCode(code, "station-script.js");
    if (result.error) { const message = vm.dump(result.error); result.error.dispose(); throw new Error(typeof message?.message === "string" ? message.message : "Script evaluation failed"); }
    try { const value = JSON.parse(vm.getString(result.value)); signal?.throwIfAborted(); return scriptOutputSchema.parse({ ...value, elapsedMs: Date.now() - start, engine: "quickjs-wasm" }); } finally { result.value.dispose(); }
  } finally { vm.dispose(); runtime.dispose(); }
}

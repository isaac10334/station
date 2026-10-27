/** Browser main-thread acceptance; CPU deadlines and host resources live outside guests. */
import { lifecycleAcceptance } from "./scripting-proof/acceptance";
import { manifestSchema } from "./scripting-proof/contracts";
try {
  const [bytes, shim] = await Promise.all(["/probe.wasm", "/translator.wasm"].map(async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Fixture unavailable: ${path}`);
    return new Uint8Array(await response.arrayBuffer());
  }));
  const manifest = manifestSchema.parse(await (await fetch("/manifest.json")).json());
  const result = await lifecycleAcceptance(() => {
    const worker = new Worker("/lifecycle-worker.js", { type: "module" });
    return {
      send: value => worker.postMessage(value), listen: listener => worker.addEventListener("message", event => listener(event.data)),
      onError: listener => worker.addEventListener("error", event => listener(new Error(event.message))), terminate: () => worker.terminate(),
    };
  }, bytes!, shim!, manifest);
  document.querySelector("#status")!.textContent = result.passed ? `PASS: ${result.stages.length} lifecycle checks` : `FAIL: ${result.error}`;
  document.querySelector("#result")!.textContent = JSON.stringify({ ...result, manifest, browser: navigator.userAgent }, null, 2);
  document.title = result.passed ? "PASS P3 lifecycle" : "FAIL P3 lifecycle";
} catch (error) { document.querySelector("#status")!.textContent = String(error); }

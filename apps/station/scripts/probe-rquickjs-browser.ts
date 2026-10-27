/** Isolated browser-worker entry; serve alongside /probe.wasm and /translator.wasm. */
import { probeRquickjsRuntime } from "./rquickjs-runtime-probe";
const [bytes, shim] = await Promise.all(["/probe.wasm", "/translator.wasm"].map(async path => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Fixture unavailable: ${path}`);
  return new Uint8Array(await response.arrayBuffer());
}));
postMessage(await probeRquickjsRuntime(bytes!, shim!, navigator.userAgent));

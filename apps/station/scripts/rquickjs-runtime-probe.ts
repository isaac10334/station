/** Isolated alternative-compiler compatibility probe; never changes production profiles.
 * Bundle for Node, then pass a generated P3 Component path. Translation and invocation
 * use Station's pinned Polyengine. Unknown imports fail closed before execution.
 */
import { Translator } from "@polyengine/runtime/shim";
import { instantiate, requiredImports } from "@polyengine/runtime/embedder";
import { wasi } from "@polyengine/wasi";
import ts from "typescript";
import { sha256 } from "../src/core/build-contract";

/** Run trusted experimental fixtures in either Node or a browser worker.
 * Denial shims grant no network access. This is not the production verifier.
 */
export async function probeRquickjsRuntime(bytes: Uint8Array, shim: Uint8Array, executionHost: unknown) {
  const report: Record<string, unknown> = { compiler: "wasm-rquickjs@0.4.13", compilerCommit: "f8da7c102cb2a81c7f0b2365be24150c387f3f8b", runtime: "@polyengine/runtime@0.6.7", executionHost, fullAcceptanceComplete: false };
  const baseline = wasi();
  try {
    report.componentSha256 = await sha256(bytes);
    report.componentBytes = bytes.byteLength;
    report.translatorSha256 = await sha256(shim);
    const translatedAt = performance.now();
    const translator = await Translator.create(shim);
    const translation = translator.translate(bytes);
    report.translationMs = performance.now() - translatedAt;
    const leaves = requiredImports(translation.plan);
    report.imports = leaves.map(({ interfaceId, jsName, jsClass, kind, type }) => ({ interfaceId, jsName, jsClass, kind, async: type?.async }));
    const calls: unknown[] = [];
    const documents: string[] = [];
    let disposed = 0;
    class Surface {
      render(document: string) { documents.push(document); }
      async nextEvent() { await new Promise(resolve => setTimeout(resolve, 10)); return '{"type":"click"}'; }
      [Symbol.dispose]() { disposed++; }
    }
    const imports: Record<string, any> = {
      ...baseline,
      "wasi:cli/exit@0.2": { ...(baseline["wasi:cli/exit@0.2"] as Record<string, unknown>), exitWithCode() { throw new Error("Guest requested process exit"); } },
      "loopkit:script-probe/services@0.1.0": { async invoke(binding: string, input: string) {
        if (binding !== "double") throw new Error("Binding denied");
        calls.push({ binding, input });
        await new Promise(resolve => setTimeout(resolve, 10));
        return JSON.stringify(JSON.parse(input) * 2);
      } },
      "loopkit:script-probe/surfaces@0.1.0": { Surface, open: () => new Surface() },
    };
    // The generated P3 spine links HTTP/socket builtins even with only `p3` enabled.
    // Experimental denial-only link shims: no network implementation is installed.
    const deniedInterfaces = new Set(["wasi:sockets/types@0.3.0", "wasi:sockets/ip-name-lookup@0.3.0", "wasi:http/types@0.3.0", "wasi:http/client@0.3.0"]);
    for (const leaf of leaves.filter(leaf => deniedInterfaces.has(leaf.interfaceId))) {
      const provider = imports[leaf.interfaceId] ??= {};
      const deny = () => { throw new Error(`Network denied: ${leaf.interfaceId}.${leaf.jsName}`); };
      if (leaf.kind === "resource") provider[leaf.jsName] = class { constructor() { deny(); } };
    }
    for (const leaf of leaves.filter(leaf => deniedInterfaces.has(leaf.interfaceId) && leaf.kind === "func")) {
      const provider = imports[leaf.interfaceId];
      const deny = () => { throw new Error(`Network denied: ${leaf.interfaceId}.${leaf.jsName}`); };
      if (leaf.member.form === "constructor") continue;
      if (leaf.jsClass) (leaf.member.form === "method" ? provider[leaf.jsClass].prototype : provider[leaf.jsClass])[leaf.jsName] = deny;
      else provider[leaf.jsName] = deny;
    }
    report.deniedNetworkInterfaces = [...deniedInterfaces];
    const create = () => instantiate({ plan: translation.plan, adapters: translation.adapters, componentBytes: bytes }, imports);
    report.phase = "instantiate";
    const instance = await create();
    report.instantiated = true;
    report.phase = "control";
    report.control = await instance.exports.evaluate("return input.amount * 2;", '{"amount":21}');
    const source = ts.transpileModule("const value: number = await bindings.invoke('double', input.amount); return value;", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    const evaluateAt = performance.now();
    report.phase = "async-service";
    const output = await instance.exports.evaluate(source, '{"amount":21}');
    report.asyncService = { output, calls, elapsedMs: performance.now() - evaluateAt };
    if (output !== "42") throw new Error("Async service result mismatch");
    const warmAt = performance.now();
    for (let value = 0; value < 10; value++) {
      if (await instance.exports.evaluate("return input + 1;", String(value)) !== String(value + 1)) throw new Error("Changed-source evaluation mismatch");
    }
    report.warmTenMs = performance.now() - warmAt;
    const counter = "globalThis.counter = (globalThis.counter || 0) + 1; return globalThis.counter;";
    const retained = [await instance.exports.evaluate(counter, "null"), await instance.exports.evaluate(counter, "null")];
    const fresh = await (await create()).exports.evaluate(counter, "null");
    report.isolation = { retained, fresh };
    if (retained.join() !== "1,2" || fresh !== "1") throw new Error("Isolation mismatch");
    report.phase = "surface";
    report.surface = await instance.exports.evaluate("const surface = bindings.openSurface(); surface.render('hello'); const event = await surface.nextEvent(); surface[Symbol.dispose](); return event;", "null");
    report.surfaceObservations = { documents, disposed };
    if (report.surface !== JSON.stringify('{"type":"click"}')) throw new Error("Surface event mismatch");
    if (documents.join() !== "hello" || disposed !== 1) throw new Error("Surface render/dispose mismatch");
    report.phase = "session";
    await instance.exports.start("let total = input; return { update(value) { total += value; return total; }, dispose() { globalThis.sessionDisposed = true; } };", "5");
    const session = [await instance.exports.dispatch("2"), await instance.exports.dispatch("3")];
    await instance.exports.stop();
    report.session = { values: session, disposed: await instance.exports.evaluate("return globalThis.sessionDisposed;", "null") };
    if (session.join() !== "7,10") throw new Error("Session mismatch");
    report.phase = "binding-denial";
    try {
      await (await create()).exports.evaluate("return await bindings.invoke('unwired', 1);", "null");
      throw new Error("Unwired binding was accepted");
    } catch (error) {
      if (!String(error).includes("Binding denied")) throw error;
      report.unwiredBindingDenied = true;
    }
    report.phase = "complete";
    report.initialProbePassed = true;
  } catch (error) {
    report.initialProbePassed = false;
    report.error = error instanceof Error ? error.stack : String(error);
  }
  report.stdout = baseline.captured.stdoutText();
  report.stderr = baseline.captured.stderrText();
  return report;
}

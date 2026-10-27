/** Behavioral acceptance against real evaluator bytes, shared by Node/browser. */
import type { ProofManifest, ProofWorker } from "./contracts";
import { ProofSession } from "./client";
import ts from "typescript";

export async function lifecycleAcceptance(createWorker: () => ProofWorker, bytes: Uint8Array, shim: Uint8Array, manifest: ProofManifest) {
  const stages: { name: string; elapsedMs: number; details: unknown }[] = [];
  const active = new Set<ProofSession>();
  const open = async (customBytes = bytes, customManifest = manifest) => {
    const session = new ProofSession(createWorker());
    active.add(session);
    const started = performance.now();
    const init = await session.request({ op: "init", bytes: customBytes.slice(), shim: shim.slice(), manifest: customManifest }, 10_000);
    return { session, init: { ...JSON.parse(init), startupMs: performance.now() - started } };
  };
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const waitFor = async (test: () => boolean) => {
    const start = performance.now();
    while (!test()) { if (performance.now() - start > 1500) throw new Error("Expected host state was not reached"); await new Promise(resolve => setTimeout(resolve, 1)); }
  };
  const rejects = async (promise: Promise<unknown>, match: string) => {
    try { await promise; } catch (error) { assert(String(error).includes(match), `Expected ${match}, received ${error}`); return; }
    throw new Error(`Expected rejection: ${match}`);
  };
  const stage = async (name: string, action: () => Promise<unknown>) => {
    const start = performance.now();
    const details = await action();
    stages.push({ name, elapsedMs: performance.now() - start, details });
  };
  const evaluate = (session: ProofSession, source: string, input = "null", timeoutMs = 2000) => session.request({ op: "evaluate", source, input }, timeoutMs);
  try {
    await stage("verified-engine-and-typescript", async () => {
      const { session, init } = await open();
      const editAt = performance.now();
      const source = ts.transpileModule("const amount: number = input.amount; return await bindings.invoke('double', amount);", { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
      assert(await evaluate(session, source, '{"amount":21}') === "42", "Async service mismatch");
      const editToRunMs = performance.now() - editAt;
      const start = performance.now();
      for (let i = 0; i < 10; i++) assert(await evaluate(session, "return input + 1;", String(i)) === String(i + 1), "Repeated evaluation mismatch");
      const warmTenMs = performance.now() - start;
      session.stop();
      return { ...init, editToRunMs, warmTenMs };
    });
    await stage("tampered-bytes-denied", async () => {
      const changed = bytes.slice(); changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;
      await rejects(open(changed), "Engine bytes mismatch");
    });
    await stage("tampered-profile-denied", async () => {
      await rejects(open(bytes, { ...manifest, importsSha256: "0".repeat(64) }), "Engine imports mismatch");
    });
    await stage("subscription-events-and-cancel", async () => {
      const { session } = await open();
      const result = evaluate(session, "const sub = await bindings.subscribe('counter'); const value = await sub.next(); sub.cancel(); sub[Symbol.dispose](); return value;");
      await waitFor(() => session.host.stats.pending === 1);
      session.host.emit("counter", "first");
      assert(await result === '"first"', "Subscription event mismatch");
      assert(session.host.stats.resources === 0 && session.host.stats.disposed === 1, "Subscription was not disposed once");
      session.stop();
      return session.stats;
    });
    await stage("stop-cancels-pending-subscription", async () => {
      const { session } = await open();
      const pending = evaluate(session, "const sub = await bindings.subscribe('counter'); return await sub.next();");
      const rejected = rejects(pending, "Session stopped");
      await waitFor(() => session.host.stats.pending === 1);
      const stopAt = performance.now();
      session.stop();
      await rejected;
      assert(!session.host.stats.pending && !session.host.stats.resources, "Host retained a stopped subscription");
      await rejects(evaluate(session, "return 1;"), "Session stopped");
      return { ...session.stats, cleanupMs: performance.now() - stopAt };
    });
    await stage("revocation-invalidates-retained-subscription", async () => {
      const { session } = await open();
      await session.request({ op: "start", source: "const sub = await bindings.subscribe('counter'); return { update() { return sub.next(); }, dispose() { sub.cancel(); } };", input: "null" });
      session.host.revoke("counter");
      await rejects(session.request({ op: "dispatch", input: "null" }), "Resource is disposed");
      return session.stats;
    });
    await stage("service-stop-ends-pending-events", async () => {
      const { session } = await open();
      const result = evaluate(session, "const sub = await bindings.subscribe('counter'); return (await sub.next()) ?? 'closed';");
      await waitFor(() => session.host.stats.pending === 1);
      session.host.revoke("counter");
      assert(await result === '"closed"', "Revoked subscription did not end");
      assert(!session.host.stats.pending && !session.host.stats.resources, "Revoked subscription leaked");
      session.stop();
      return session.stats;
    });
    await stage("revocation-denies-in-flight-call", async () => {
      const { session } = await open();
      const result = evaluate(session, "return await bindings.invoke('double', 21);");
      const rejected = rejects(result, "Binding denied");
      await waitFor(() => session.host.stats.timers === 1);
      session.host.revoke("double");
      await rejected;
      return session.stats;
    });
    await stage("late-service-result-and-workspace-close", async () => {
      const { session } = await open();
      const pending = evaluate(session, "return await bindings.invoke('double', 21);");
      const rejected = rejects(pending, "Workspace closed");
      await waitFor(() => session.host.stats.timers === 1);
      session.stop("Workspace closed");
      await rejected;
      assert(!session.host.stats.timers && !session.host.stats.pending, "Late host work survived closure");
      return session.stats;
    });
    await stage("surface-events-and-retained-authority", async () => {
      const { session } = await open();
      await session.request({ op: "start", source: "const surface = await bindings.openSurface(); return { async update(value) { surface.render(value); return await surface.nextEvent(); }, dispose() { surface[Symbol.dispose](); } };", input: "null" });
      const result = session.request({ op: "dispatch", input: '"hello"' });
      await waitFor(() => session.host.stats.pending === 1);
      session.host.emit("surface", '{"type":"click"}');
      assert(await result === JSON.stringify('{"type":"click"}'), "Surface event mismatch");
      assert(session.host.documents.join() === "hello", "Render did not reach the host");
      session.host.revoke("surface");
      await rejects(session.request({ op: "dispatch", input: '"forbidden"' }), "Resource is disposed");
      assert(session.host.documents.join() === "hello", "Revoked render changed the document");
      return session.stats;
    });
    for (const binding of ["source.read", "metadata.write", "unwired"]) await stage(`deny-${binding}`, async () => {
      const { session } = await open();
      await rejects(evaluate(session, `return await bindings.invoke(${JSON.stringify(binding)}, 1);`), "Binding denied");
      return session.stats;
    });
    await stage("no-network", async () => {
      const { session } = await open();
      await rejects(evaluate(session, "return await fetch('https://example.invalid/');"), "Network denied");
    });
    await stage("bounded-output", async () => {
      const { session } = await open();
      await rejects(evaluate(session, "return 'x'.repeat(8192);"), "output limit");
    });
    await stage("bounded-logs", async () => {
      const { session } = await open();
      await rejects(evaluate(session, "for(let i = 0; i < 100; i++) console.log('x'.repeat(256)); return 1;"), "Log output limit");
      return session.stats;
    });
    await stage("bounded-resources", async () => {
      const { session } = await open();
      await rejects(evaluate(session, "const resources = []; for(let i = 0; i < 9; i++) resources.push(await bindings.openSurface()); return resources.length;"), "Resource limit");
      assert(!session.host.stats.resources, "Failed script leaked surface resources");
      return session.stats;
    });
    await stage("bounded-heap", async () => {
      const { session } = await open();
      const result = await evaluate(session, "try { const data = new Uint8Array(32 * 1024 * 1024); return data.length; } catch { return 'allocation denied'; }");
      assert(result === '"allocation denied"', `Heap limit did not reject allocation: ${result}`);
      session.stop();
    });
    await stage("runaway-termination", async () => {
      const { session } = await open();
      await rejects(evaluate(session, "for (;;) {}", "null", 150), "Execution deadline exceeded");
      assert(session.stats.stopped && !session.stats.pending, "Runaway worker survived termination");
      return session.stats;
    });
    await stage("fresh-isolation-and-session-state", async () => {
      const { session: first } = await open();
      const counter = "globalThis.count = (globalThis.count || 0) + 1; return globalThis.count;";
      assert(await evaluate(first, counter) === "1" && await evaluate(first, counter) === "2", "Session globals missing");
      const { session: second } = await open();
      assert(await evaluate(second, counter) === "1", "Independent session shared globals");
      first.stop("Replaced"); second.stop();
      return { first: first.stats, second: second.stats };
    });
    return { passed: true, stages, fullAcceptanceComplete: false };
  } catch (error) {
    return { passed: false, stages, error: String(error), fullAcceptanceComplete: false };
  } finally { for (const session of active) session.stop(); }
}

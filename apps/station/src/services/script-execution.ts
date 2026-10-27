import { scriptInputSchema, scriptOutputSchema, type ScriptInput, type ScriptOutput } from "../contracts/script-runtime";
/** Shared serialized worker with fresh QuickJS VMs, 16 queued calls maximum,
 * hard watchdog/cancellation, and idle termination. Never one engine per widget. */
export function createScriptExecution() {
  let worker: Worker | undefined, url: string | undefined, idle: ReturnType<typeof setTimeout> | undefined, closed = false, count = 0, next = 0, tail = Promise.resolve();
  const stop = () => { clearTimeout(idle); worker?.terminate(); worker = undefined; if (url) URL.revokeObjectURL(url); url = undefined; };
  let activeCancel: (() => void) | undefined;
  const evaluate = (request: ScriptInput, signal?: AbortSignal): Promise<ScriptOutput> => {
    if (closed || count >= 16) return Promise.reject(new Error(closed ? "Script provider disposed" : "Script queue is full"));
    const parsed = scriptInputSchema.parse(request); count++;
    const call = tail.then(async () => {
      signal?.throwIfAborted(); if (closed) throw new Error("Script provider disposed");
      if (typeof document === "undefined") return (await import("./quickjs-engine")).evaluateQuickJS(parsed, signal);
      clearTimeout(idle);
      if (!worker) { const tools = await import("../generated/script-tools"); signal?.throwIfAborted(); if (closed) throw new Error("Script provider disposed"); url = URL.createObjectURL(new Blob([tools.scriptWorker], { type: "text/javascript" })); worker = new Worker(url, { type: "module" }); }
      return new Promise<ScriptOutput>((resolve, reject) => {
        const id = ++next, current = worker!;
        let settled = false;
        const finish = (error?: Error, value?: ScriptOutput) => { if (settled) return; settled = true; activeCancel = undefined; clearTimeout(timer); signal?.removeEventListener("abort", abort); current.onmessage = null; current.onerror = null; if (!closed) idle = setTimeout(stop, 5000); error ? reject(error) : resolve(value!); };
        const abort = () => { stop(); finish(new Error("Script cancelled")); };
        const timer = setTimeout(() => { stop(); finish(new Error("Script worker exceeded its time budget")); }, 4000);
        signal?.addEventListener("abort", abort, { once: true });
        activeCancel = abort;
        current.onerror = () => { stop(); finish(new Error("Script worker failed")); };
        current.onmessage = event => { if (event.data.id !== id) return; if (event.data.error) finish(new Error(event.data.error)); else { try { finish(undefined, scriptOutputSchema.parse(event.data.result)); } catch { stop(); finish(new Error("Invalid script worker result")); } } };
        current.postMessage({ id, request: parsed });
      });
    });
    tail = call.then(() => {}, () => {}); return call.finally(() => { count--; });
  };
  return { evaluate, dispose() { closed = true; activeCancel?.(); stop(); }, inspect: () => ({ queued: count, worker: !!worker, limit: 16, memoryMiB: 16, cpuMs: 200 }) };
}

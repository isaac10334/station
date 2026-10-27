/** Trusted UI command adapter; every action still enters the schema/policy registry.
 * Each asynchronous invocation owns one subscription and cancellation listener.
 * @example
 * const commands = createCommandClient(control);
 * await commands.run("programs.start", { instanceId }, signal);
 */
export interface CommandPort {
  version(): { epoch: string; revision: number };
  execute(request: { method: string; params?: unknown; version?: { epoch: string; revision: number }; requestId?: string }): { result: any };
  subscribe(listener: () => void): () => void;
}
export function createCommandClient(port: CommandPort) {
  function wait<T>(operationId: string, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      let release = () => {}, settled = false;
      const finish = (error?: unknown, value?: T) => {
        if (settled) return;
        settled = true;
        release(); signal?.removeEventListener("abort", abort);
        if (error) reject(error); else resolve(value as T);
      };
      const abort = () => {
        try { port.execute({ method: "operations.cancel", params: { operationId }, version: port.version() }); } catch { /* Cancellation remains local if authority was revoked. */ }
        finish(signal?.reason ?? new Error("Operation cancelled"));
      };
      const check = () => {
        if (settled) return;
        try {
          const op = port.execute({ method: "operations.inspect", params: { operationId } }).result;
          if (op.status === "succeeded") finish(undefined, op.result);
          else if (op.status !== "running") finish(new Error(op.error?.message ?? `Operation ${op.status}`));
        } catch (error) { finish(error); }
      };
      release = port.subscribe(check);
      // A synchronous subscription may publish before returning its disposer.
      if (settled) { release(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort(); else check();
    });
  }
  return {
    execute: (method: string, params: unknown) => port.execute({ method, params, version: port.version() }),
    wait,
    async run<T>(method: string, params: unknown, signal?: AbortSignal): Promise<T> {
      signal?.throwIfAborted();
      const { result } = port.execute({ method, params, version: port.version(), requestId: crypto.randomUUID() });
      return result?.operationId ? wait<T>(result.operationId, signal) : result as T;
    },
  };
}

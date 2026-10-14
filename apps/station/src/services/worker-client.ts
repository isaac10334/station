/** Private request/response worker. Timeouts terminate compilation, not merely its promise. */
export class WorkerClient {
  private worker: Worker;
  private sequence = 0;
  private disposed = false;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(source: string) {
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    this.worker = new Worker(url, { type: "module" });
    URL.revokeObjectURL(url);
    this.worker.onmessage = (event) => {
      const call = this.pending.get(event.data.id);
      if (!call) return;
      clearTimeout(call.timer);
      this.pending.delete(event.data.id);
      event.data.error
        ? call.reject(new Error(event.data.error))
        : call.resolve(event.data.value);
    };
    this.worker.onerror = (event) => this.dispose(new Error(event.message));
  }
  request<T>(message: object): Promise<T> {
    if (this.disposed)
      return Promise.reject(new Error("Worker session closed"));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(
        () => this.dispose(new Error("Worker timed out")),
        30_000,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ ...message, id });
    });
  }
  dispose(error = new Error("Worker session closed")) {
    this.disposed = true;
    this.worker.terminate();
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    this.pending.clear();
  }
}

/** Host-side fixture membrane; no application store, credentials, or real I/O. */
import { hostCallSchema, type HostCall, bounded } from "./contracts";
type Resource = { kind: "subscription" | "surface"; binding: string; closed: boolean; pending?: (value: string | null) => void };

/** Resources and pending host work outlive a worker only until synchronous close(). */
export class ProofHost {
  private grants = new Set(["double", "counter", "surface"]);
  private revision = 1;
  private nextId = 0;
  private resources = new Map<number, Resource>();
  private controller = new AbortController();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  readonly documents: string[] = [];
  readonly observations = { calls: 0, created: 0, disposed: 0, delivered: 0, denied: 0 };
  get stats() { return { ...this.observations, resources: this.resources.size, timers: this.timers.size, pending: [...this.resources.values()].filter(r => r.pending).length, stopped: this.controller.signal.aborted }; }
  private check(binding: string) {
    if (this.controller.signal.aborted || !this.grants.has(binding)) { this.observations.denied++; throw new Error(`Binding denied: ${binding}`); }
  }
  private resource(id: number, kind?: Resource["kind"]) {
    const resource = this.resources.get(id);
    if (!resource || resource.closed || (kind && resource.kind !== kind)) throw new Error("Resource is disposed");
    this.check(resource.binding);
    return resource;
  }
  async call(value: HostCall): Promise<string | number | null> {
    const call = hostCallSchema.parse(value);
    if (++this.observations.calls > 512) throw new Error("Host call limit exceeded");
    switch (call.op) {
      case "invoke": {
        this.check(call.binding);
        if (call.binding !== "double") throw new Error("Operation is not bound");
        const revision = this.revision;
        const input: unknown = JSON.parse(call.input);
        if (typeof input !== "number" || !Number.isFinite(input)) throw new Error("Invalid service input");
        await this.delay(15);
        this.check(call.binding);
        if (revision !== this.revision) throw new Error("Stale service result");
        const result = input * 2;
        if (!Number.isFinite(result)) throw new Error("Invalid service output");
        return bounded(JSON.stringify(result));
      }
      case "subscribe":
      case "open": {
        const binding = call.op === "open" ? "surface" : call.binding;
        this.check(binding);
        if (call.op === "subscribe" && binding !== "counter") throw new Error("Subscription is not bound");
        if (this.resources.size >= 8) throw new Error("Resource limit exceeded");
        const id = ++this.nextId;
        this.resources.set(id, { kind: call.op === "open" ? "surface" : "subscription", binding, closed: false });
        this.observations.created++;
        return id;
      }
      case "render": {
        this.resource(call.resource, "surface");
        if (this.documents.length >= 32) throw new Error("Surface update limit exceeded");
        this.documents.push(call.document);
        return null;
      }
      case "next":
      case "next-event": {
        const resource = this.resource(call.resource, call.op === "next" ? "subscription" : "surface");
        if (resource.pending) throw new Error("Only one pending event read is allowed");
        return new Promise(resolve => { resource.pending = resolve; });
      }
      case "cancel":
      case "dispose": this.dispose(call.resource); return null;
    }
  }
  /** Deliver only to resources whose current binding still authorizes this event. */
  emit(binding: string, value: string) {
    bounded(value);
    this.check(binding);
    for (const resource of this.resources.values()) {
      if (resource.binding !== binding || !resource.pending) continue;
      const pending = resource.pending;
      resource.pending = undefined;
      this.observations.delivered++;
      pending(value);
    }
  }
  revoke(binding: string) {
    this.grants.delete(binding);
    this.revision++;
    for (const [id, resource] of this.resources) if (resource.binding === binding) this.dispose(id);
  }
  dispose(id: number) {
    const resource = this.resources.get(id);
    if (!resource) return;
    resource.closed = true;
    this.resources.delete(id);
    resource.pending?.(null);
    resource.pending = undefined;
    this.observations.disposed++;
  }
  close() {
    if (this.controller.signal.aborted) return;
    this.controller.abort();
    for (const id of this.resources.keys()) this.dispose(id);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const abort = () => { this.timers.delete(timer); clearTimeout(timer); reject(new Error("Service cancelled")); };
      const timer = setTimeout(() => { this.timers.delete(timer); this.controller.signal.removeEventListener("abort", abort); resolve(); }, ms);
      this.timers.add(timer);
      this.controller.signal.addEventListener("abort", abort, { once: true });
    });
  }
}

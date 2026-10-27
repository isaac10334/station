/** Owns the worker and external host effects. Stop never waits for guest cooperation. */
import { envelopeSchema, hostReplySchema, hostRequestSchema, replySchema,logSchema, type EngineRequest, type EngineWorker } from "../../features/programs/contracts/engine";
import type { HostCall } from "../../features/programs/contracts/engine";
import type { ProgramHost } from "../../features/programs/application/ports";
export type { ProgramHost } from "../../features/programs/application/ports";

export class EngineSession {
  private sequence = 0;
  private closed = false;
  private entries:string[]=[];
  get logs():readonly string[]{return [...this.entries];}
  private calls = new Map<number, { resolve(value: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  constructor(private worker: EngineWorker, readonly host: ProgramHost,private onLog=()=>{}) {
    worker.listen(value => { void this.receive(value).catch(error => this.stop(String(error))); });
    worker.onError(error => this.stop(error.message));
  }
  request(request: EngineRequest, timeoutMs = 2000): Promise<string> {
    if (this.closed) return Promise.reject(new Error("Session stopped"));
    if (this.calls.size) return Promise.reject(new Error("Guest request already in progress"));
    const envelope = envelopeSchema.parse({ id: ++this.sequence, request });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.stop("Execution deadline exceeded"), timeoutMs);
      this.calls.set(envelope.id, { resolve, reject, timer });
      this.worker.send(envelope);
    });
  }
  stop(reason = "Session stopped") {
    if (this.closed) return;
    this.closed = true;
    this.host.close();
    this.worker.terminate();
    for (const call of this.calls.values()) { clearTimeout(call.timer); call.reject(new Error(reason)); }
    this.calls.clear();
  }
  get stats() { return { stopped: this.closed, pending: this.calls.size }; }
  private async receive(value: unknown) {
    if (this.closed) return;
    const log=logSchema.safeParse(value);if(log.success){if(this.entries.join('').length+log.data.text.length>16384)throw new Error('Log budget exceeded');this.entries.push(log.data.text);this.onLog();return;}
    const hostRequest = hostRequestSchema.safeParse(value);
    if (hostRequest.success) {
      const { id, call } = hostRequest.data;
      let reply;
      try { reply = { kind: "host-reply", id, ok: true, value: await this.host.call(call) }; }
      catch (error) { reply = { kind: "host-reply", id, ok: false, error: String(error).slice(0, 1024) }; }
      if (!this.closed) this.worker.send(hostReplySchema.parse(reply));
      return;
    }
    const reply = replySchema.parse(value);
    const call = this.calls.get(reply.id);
    if (!call) return;
    this.calls.delete(reply.id);
    clearTimeout(call.timer);
    if (reply.ok) call.resolve(reply.value ?? "null");
    else { call.reject(new Error(reply.error)); this.stop("Guest failed"); }
  }
}

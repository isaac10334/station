/** Fixed worker runtime: user source is evaluated only inside verified QuickJS Wasm. */
import { Translator } from "@polyengine/runtime/shim";
import { instantiate, requiredImports, RUNTIME_VERSION, type EmbedderInstance } from "@polyengine/runtime/embedder";
import { wasi } from "@polyengine/wasi";
import { OutputStream } from "@polyengine/wasi/io";
import { sha256 } from "../../src/core/build-contract";
import { bounded, envelopeSchema, hostReplySchema, MAX_OUTPUT, SERVICES, SURFACES, TRANSLATOR_HASH, type HostCall, type ProofPort } from "./contracts";
import { inspectProof } from "./inspection";

export function installProofWorker(port: ProofPort) {
  let instance: EmbedderInstance | undefined;
  let initialized = false, busy = false, sequence = 0, outputBytes = 0;
  const logs: string[] = [];
  const pending = new Map<number, { resolve(value: string | number | null): void; reject(error: Error): void }>();
  const notices = new Set<Promise<unknown>>();
  let effectFailure: unknown;
  const rpc = (call: HostCall): Promise<string | number | null> => new Promise((resolve, reject) => {
    if (pending.size >= 16) return reject(new Error("Pending host call limit exceeded"));
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    port.send({ kind: "host", id, call });
  });
  // Disposals/render are sync WIT methods. FIFO notices preserve ordering before
  // any following RPC, while the host rechecks authority before applying effects.
  const notice = (call: HostCall) => {
    const task = rpc(call);
    notices.add(task);
    void task.catch(error => { effectFailure = error; }).finally(() => notices.delete(task));
  };
  class Subscription {
    private closed = false;
    constructor(readonly id: number) {}
    async next() { if (this.closed) throw new Error("Subscription disposed"); return (await rpc({ op: "next", resource: this.id })) ?? undefined; }
    cancel() { if (!this.closed) { this.closed = true; notice({ op: "cancel", resource: this.id }); } }
    [Symbol.dispose]() { this.cancel(); }
  }
  class Surface {
    private closed = false;
    constructor(readonly id: number) {}
    render(document: string) { if (this.closed) throw new Error("Surface disposed"); notice({ op: "render", resource: this.id, document: bounded(document) }); }
    async nextEvent() { if (this.closed) throw new Error("Surface disposed"); return (await rpc({ op: "next-event", resource: this.id })) ?? undefined; }
    [Symbol.dispose]() { if (!this.closed) { this.closed = true; notice({ op: "dispose", resource: this.id }); } }
  }
  const stdout = new OutputStream(chunk => { outputBytes += chunk.length; if (outputBytes > MAX_OUTPUT) throw new Error("Log output limit exceeded"); logs.push(new TextDecoder().decode(chunk)); });
  async function initialize(bytes: Uint8Array, shim: Uint8Array, manifest: import("./contracts").ProofManifest) {
    if (initialized) throw new Error("Worker already initialized");
    initialized = true;
    if (RUNTIME_VERSION !== "0.6.7") throw new Error("Pinned Polyengine runtime is required");
    if (bytes.byteLength !== manifest.bytes || await sha256(bytes) !== manifest.sha256) throw new Error("Engine bytes mismatch");
    if (await sha256(shim) !== TRANSLATOR_HASH) throw new Error("Translator bytes mismatch");
    const started = performance.now();
    const translator = await Translator.create(shim);
    const translatorReady = performance.now();
    const translation = translator.translate(bytes);
    const translated = performance.now();
    const inspection = await inspectProof(bytes, { ...translation, componentBytes: bytes });
    if (inspection.importsSha256 !== manifest.importsSha256) throw new Error("Engine imports mismatch");
    const imports: Record<string, any> = {
      ...wasi(),
      "wasi:cli/stdout@0.2": { getStdout: () => stdout },
      "wasi:cli/stderr@0.2": { getStderr: () => stdout },
      "wasi:cli/exit@0.2": { exit() { throw new Error("Guest exit denied"); }, exitWithCode() { throw new Error("Guest exit denied"); } },
      [SERVICES]: { Subscription,
        invoke: (binding: string, input: string) => rpc({ op: "invoke", binding, input: bounded(input) }),
        subscribe: async (binding: string) => new Subscription(Number(await rpc({ op: "subscribe", binding }))),
      },
      [SURFACES]: { Surface, open: async () => new Surface(Number(await rpc({ op: "open" }))) },
    };
    const denied = new Set(["wasi:sockets/types@0.3.0", "wasi:sockets/ip-name-lookup@0.3.0", "wasi:http/types@0.3.0", "wasi:http/client@0.3.0"]);
    const leaves = requiredImports(translation.plan);
    const deny = () => { throw new Error("Network denied"); };
    for (const leaf of leaves.filter(leaf => denied.has(leaf.interfaceId) && leaf.kind === "resource")) (imports[leaf.interfaceId] ??= {})[leaf.jsName] = class { constructor() { deny(); } };
    for (const leaf of leaves.filter(leaf => denied.has(leaf.interfaceId) && leaf.kind === "func")) {
      const provider = imports[leaf.interfaceId] ??= {};
      if (leaf.member.form === "constructor") continue;
      if (leaf.jsClass) (leaf.member.form === "method" ? provider[leaf.jsClass].prototype : provider[leaf.jsClass])[leaf.jsName] = deny;
      else provider[leaf.jsName] = deny;
    }
    instance = await instantiate({ ...translation, componentBytes: bytes }, imports);
    return JSON.stringify({ memories: inspection.memories, imports: leaves.length, timings: { translatorMs: translatorReady - started, translateMs: translated - translatorReady, inspectAndInstantiateMs: performance.now() - translated } });
  }
  port.listen(value => {
    const hostReply = hostReplySchema.safeParse(value);
    if (hostReply.success) {
      const { id, ok, value, error } = hostReply.data;
      const call = pending.get(id);
      if (!call) return;
      pending.delete(id);
      ok ? call.resolve(value ?? null) : call.reject(new Error(error));
      return;
    }
    void (async () => {
      const { id, request } = envelopeSchema.parse(value);
      let entered = false;
      try {
        if (busy) throw new Error("Concurrent guest entry is not allowed");
        busy = true;
        entered = true;
        let output;
        if (request.op === "init") output = await initialize(request.bytes, request.shim, request.manifest);
        else {
          if (!instance) throw new Error("Worker is not ready");
          output = request.op === "dispatch" ? await instance.exports.dispatch(request.input) : await instance.exports[request.op](request.source, request.input);
        }
        // Flush synchronous effect notices, including failures, before accepting
        // an export result. Effects do not succeed merely by entering the queue.
        await Promise.all([...notices]);
        if (effectFailure) throw effectFailure;
        port.send({ kind: "reply", id, ok: true, value: bounded(String(output)) });
      } catch (error) {
        port.send({ kind: "reply", id, ok: false, error: `${String(error)} ${logs.join("")}`.slice(0, 1024) });
      } finally { if (entered) busy = false; }
    })().catch(error => port.send({ kind: "reply", id: 1, ok: false, error: String(error).slice(0, 1024) }));
  });
}

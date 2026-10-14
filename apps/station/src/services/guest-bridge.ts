import { z } from "zod";
import type { Json } from "@station/sdk";
const requestSchema = z
  .object({
    id: z.number().int().positive(),
    op: z.string().max(40),
    args: z.unknown(),
  })
  .strict();
/** Host-created bindings; guest arguments never select a workspace, owner, or resource. */
export interface GuestBindings {
  signal?: AbortSignal;
  grants: readonly string[];
  acquire(
    id: string,
    version: string,
  ): Promise<{
    methods: Record<string, (...args: any[]) => unknown>;
    subscribe?(listener: (value: Json) => void): () => void;
    release(): Promise<void>;
  }>;
  state(key: string, value?: Json): Json;
  subscribe(listener: (key: string, value: Json) => void): () => void;
  slotOpen(slot: string, definition: string): string;
  slotClose(instance: string): void;
}
/** A per-frame RPC membrane with method allowlists and cancellation checks around awaits. */
export function serveGuest(port: MessagePort, bindings?: GuestBindings) {
  let closed = false,
    pending = 0,
    sequence = 0;
  const handles = new Map<
    string,
    Awaited<ReturnType<GuestBindings["acquire"]>>
  >();
  const watches = new Map<string, () => void>();
  const check = () => {
    if (closed) throw new Error("Session closed");
  };
  const unsubscribe = bindings?.subscribe((key, value) => {
    if (!closed) port.postMessage({ type: "state", key, value });
  });
  port.onmessage = async (event) => {
    let id: number | undefined,
      counted = false;
    try {
      check();
      if (event.data?.op === "disconnect") {
        connection.close();
        return;
      }
      if (JSON.stringify(event.data).length > 64 * 1024)
        throw new Error("Message exceeds 64 KiB");
      const request = requestSchema.parse(event.data);
      id = request.id;
      if (pending >= 32) throw new Error("Too many requests");
      pending++;
      counted = true;
      if (!bindings) throw new Error("This preview has no host grants");
      const args = request.args as any;
      let value: unknown;
      if (request.op === "acquire") {
        if (handles.size >= 32)
          throw new Error("Capability handle limit reached");
        const capability = z
          .object({ id: z.string(), version: z.literal("1.0.0") })
          .strict()
          .parse(args);
        if (!bindings.grants.includes(capability.id))
          throw new Error(`Grant required: ${capability.id}`);
        const service = await bindings.acquire(
          capability.id,
          capability.version,
        );
        if (closed) {
          await service.release();
          throw new Error("Session closed");
        }
        value = `handle:${++sequence}`;
        handles.set(value as string, service);
      } else if (request.op === "call") {
        const call = z
          .object({
            handle: z.string(),
            method: z.string(),
            args: z.array(z.unknown()).max(8),
          })
          .strict()
          .parse(args);
        const service = handles.get(call.handle);
        const method = service?.methods[call.method];
        if (!method || !Object.hasOwn(service!.methods, call.method))
          throw new Error("Method unavailable");
        value = await method(...call.args);
      } else if (request.op === "subscribe") {
        const handle = z
          .object({ handle: z.string() })
          .strict()
          .parse(args).handle;
        const service = handles.get(handle);
        if (!service?.subscribe) throw new Error("Subscription unavailable");
        watches.get(handle)?.();
        watches.set(
          handle,
          service.subscribe((value) => {
            if (!closed)
              port.postMessage({ type: "capability", handle, value });
          }),
        );
      } else if (request.op === "unsubscribe") {
        const handle = z
          .object({ handle: z.string() })
          .strict()
          .parse(args).handle;
        watches.get(handle)?.();
        watches.delete(handle);
      } else if (request.op === "release") {
        const handle = z
          .object({ handle: z.string() })
          .strict()
          .parse(args).handle;
        const service = handles.get(handle);
        watches.get(handle)?.();
        watches.delete(handle);
        handles.delete(handle);
        await service?.release();
      } else if (request.op === "state.get")
        value = bindings.state(
          z.object({ key: z.string() }).strict().parse(args).key,
        );
      else if (request.op === "state.set") {
        const state = z
          .object({ key: z.string(), value: z.json() })
          .strict()
          .parse(args);
        bindings.state(state.key, state.value);
      } else if (request.op === "slot.open") {
        const slot = z
          .object({ slot: z.string(), definition: z.string() })
          .strict()
          .parse(args);
        value = bindings.slotOpen(slot.slot, slot.definition);
      } else if (request.op === "slot.close")
        bindings.slotClose(
          z.object({ instance: z.string() }).strict().parse(args).instance,
        );
      else throw new Error("Operation unavailable");
      check();
      port.postMessage({ id, value });
    } catch (error) {
      if (!closed && id !== undefined)
        port.postMessage({
          id,
          error: error instanceof Error ? error.message : "Invalid request",
        });
    } finally {
      if (counted) pending--;
    }
  };
  port.start();
  const connection = {
    theme(value: unknown) {
      if (!closed) port.postMessage({ type: "theme", value });
    },
    close() {
      if (closed) return;
      closed = true;
      port.postMessage({ type: "closed" });
      port.close();
      unsubscribe?.();
      for (const unsubscribe of watches.values()) unsubscribe();
      watches.clear();
      for (const handle of handles.values()) void handle.release();
      handles.clear();
    },
  };
  bindings?.signal?.addEventListener("abort", () => connection.close(), {
    once: true,
  });
  if (bindings?.signal?.aborted) connection.close();
  return connection;
}

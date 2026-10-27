import { z } from "zod";
import { nativeAccelerator, shortcutKeysSchema } from "../src/core/shortcuts";
import { isTrustedDesktopRequest } from "./trusted-request";

export const nativeShortcutRequest = z.object({
  sessionId: z.string().uuid(), suspended: z.boolean(),
  generation: z.number().int().positive(),
  bindings: z.array(z.object({ id: z.string().regex(/^[\w-]{1,80}$/), keys: shortcutKeysSchema }).strict()).max(100),
}).strict().refine(p => new Set(p.bindings.map(b => b.id)).size === p.bindings.length, "Duplicate shortcut IDs");
export type NativeShortcutStatus = { id: string; status: "registered" | "unavailable" | "suspended"; message?: string };
export interface ShortcutDriver { register(accelerator: string, callback: () => void): boolean; unregister(accelerator: string): boolean }

/** Root-owned native registrations, not a capability. Leases expire when the
 * renderer stops renewing; replacement/reload/quit unregister exact owned keys.
 * Only an opaque binding ID crosses back to the root; it resolves current policy. */
export function createNativeShortcuts(driver: ShortcutDriver, invoke: (id: string) => void, now = Date.now, platform: "mac" | "other" = process.platform === "darwin" ? "mac" : "other") {
  const owned = new Map<string, { accelerator: string; sessionId: string }>();
  let session = "", expires = 0, generation = 0;
  function clear() { for (const item of owned.values()) driver.unregister(item.accelerator); owned.clear(); session = ""; expires = 0; generation = 0; }
  return {
    clear,
    expire() { if (expires && now() >= expires) clear(); },
    configure(input: z.infer<typeof nativeShortcutRequest>): NativeShortcutStatus[] {
      const p = nativeShortcutRequest.parse(input);
      if (p.generation < generation || p.generation === generation && session && session !== p.sessionId) throw new Error("Stale shortcut session");
      if (session !== p.sessionId) clear();
      generation = p.generation;
      // WebView2 may coalesce background renderer timers to one minute. Keep
      // crash cleanup bounded without dropping healthy hidden-window bindings.
      session = p.sessionId; expires = now() + 180_000;
      const desired = p.bindings.map(b => { try { return { ...b, accelerator: nativeAccelerator(b.keys, platform) }; } catch { return { ...b, accelerator: "" }; } });
      for (const [id, item] of owned) if (p.suspended || !desired.some(b => b.id === id && b.accelerator === item.accelerator)) { driver.unregister(item.accelerator); owned.delete(id); }
      return desired.map(b => {
        if (p.suspended) return { id: b.id, status: "suspended" as const };
        if (!b.accelerator) return { id: b.id, status: "unavailable" as const, message: "Global shortcuts require a supported key and modifier" };
        if (owned.has(b.id)) return { id: b.id, status: "registered" as const };
        const binding = { accelerator: b.accelerator, sessionId: session };
        const registered = driver.register(b.accelerator, () => {
          if (now() >= expires) { clear(); return; }
          if (session === p.sessionId && owned.get(b.id) === binding) invoke(b.id);
        });
        if (registered) owned.set(b.id, binding);
        return { id: b.id, status: registered ? "registered" as const : "unavailable" as const, ...(registered ? {} : { message: "The OS could not register this shortcut. It may be reserved or in use by another app." }) };
      });
    },
  };
}
/** Same trusted-root membrane as native browser/update controls; no arbitrary
 * actions, evaluation, OS commands or owner credentials are accepted in payloads. */
export function createShortcutHttp(token: string, origin: string, shortcuts: ReturnType<typeof createNativeShortcuts>) {
  return async (request: Request) => {
    if (!isTrustedDesktopRequest(request, token, origin)) return new Response("Forbidden", { status: 403 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const text = await request.text(); if (text.length > 20_000) return new Response("Request too large", { status: 413 });
    try { return Response.json({ bindings: shortcuts.configure(nativeShortcutRequest.parse(JSON.parse(text))) }); }
    catch { return new Response("Invalid shortcut configuration", { status: 400 }); }
  };
}

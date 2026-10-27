import { createScopedBinding } from "../../runtime/application/binding";
import type { ProviderPreference } from "../../runtime/contracts/binding";
import { loopClock } from "@station/capabilities";
import type { WorkspaceCapabilityRuntime } from "../../../contracts/widget-runtime";
/** Acquires through Loop Kit, without selecting a concrete provider. One scope
 * owns acquisition, interval and cancellation. start/dispose follow retained
 * presentation lifetime, never geometry or render count.
 */
export function createClockController(runtime: Pick<WorkspaceCapabilityRuntime, "openScope" | "diagnostics">, workspaceId: string, preference: ProviderPreference = { kind: "default" }) {
  let state = { now: new Date(), error: "" }, generation = 0;
  let scope: ReturnType<WorkspaceCapabilityRuntime["openScope"]> | undefined;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  function dispose() { ++generation; unsubscribe?.(); unsubscribe = undefined; const owned = scope; scope = undefined; if (owned) void owned.revoke().catch(() => {}); }
  return {
    get: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      dispose(); const token = generation;
      scope = runtime.openScope(workspaceId, "Widget · Local time");
      const owned = scope;
      publish({ error: "" });
      void createScopedBinding(owned, loopClock, preference, runtime.diagnostics).acquire().then(handle => {
        if (token !== generation || handle.signal.aborted) return;
        publish({ now: new Date(handle.value.now()) });
        unsubscribe = handle.value.every(1000, time => { if (token === generation && !handle.signal.aborted) publish({ now: new Date(time) }); });
        handle.signal.addEventListener("abort", () => { if (token === generation) { dispose(); publish({ error: "Clock provider unavailable" }); } }, { once: true, signal: owned.signal });
      }).catch(error => { if (token === generation) { dispose(); publish({ error: String(error) }); } });
      return dispose;
    },
    dispose,
  };
}

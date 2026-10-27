import { rootDesktopCredential } from "./root-credential";

import type { GlobalShortcutState, DesktopShortcutsPort, ShortcutRegistration } from "../contracts/shortcuts";
let snapshot: GlobalShortcutState = { phase: "web", bindings: [] };
const listeners = new Set<() => void>();
let generation = 0;
const launcherSession = crypto.randomUUID();
let launcherOpen = false;
let presentationQueue = Promise.resolve();
async function presentLauncher(open: boolean, expand = false) {
  if (!document.querySelector('meta[name="station-native-root"]')) return;
  const operation = presentationQueue.catch(() => {}).then(async () => {
    const token = await rootDesktopCredential();
    if (!token) throw new Error("Native root is not ready. Reload Station.");
    const response = await fetch("/api/desktop/launcher", { method: "POST", signal: AbortSignal.timeout(5000), headers: { "content-type": "application/json", "x-station-desktop": token }, body: JSON.stringify({ action: open ? "open" : expand ? "expand" : "close", sessionId: launcherSession }) });
    if (!response.ok) throw new Error("Could not change the capture window. Reopen Station from its tray.");
    launcherOpen = open;
  });
  presentationQueue = operation;
  return operation;
}
function publish(next: GlobalShortcutState) { if (JSON.stringify(next) === JSON.stringify(snapshot)) return; snapshot = next; for (const listener of listeners) listener(); }
export const desktopShortcutState = { getSnapshot: () => snapshot, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };

/** One root adapter per active desk. Runtime statuses are transient. Persisted
 * bindings contain no credentials, native handles, callbacks or registration claims. */
export function connectDesktopShortcuts(entries: readonly ShortcutRegistration[], invoke: (id: string) => void) {
  const sessionId = crypto.randomUUID();
  const currentGeneration = ++generation;
  let stopped = false, running = false, dirty = false;
  const abort = new AbortController();
  const native = !!document.querySelector('meta[name="station-native-root"]');
  if (!native) { publish({ phase: "web", bindings: [] }); return () => {}; }
  publish({ phase: "connecting", bindings: [] });
  async function sync() {
    if (stopped) return;
    if (running) { dirty = true; return; }
    running = true;
    try {
      const token = await rootDesktopCredential(); if (stopped) return;
      if (!token) throw new Error("Native root is not ready. Reload Station.");
      const response = await fetch("/api/desktop/shortcuts", { method: "POST", signal: abort.signal,
        headers: { "content-type": "application/json", "x-station-desktop": token },
        body: JSON.stringify({ sessionId, generation: currentGeneration, suspended: !!document.querySelector("[data-shortcuts-manager]"), bindings: entries.filter(e => e.scope === "global" && e.keys).map(e => ({ id: e.id, keys: e.keys })) }),
      });
      if (!response.ok) throw new Error(`Native shortcuts unavailable (${response.status})`);
      const result = await response.json(); if (!stopped) publish({ phase: "ready", bindings: result.bindings });
      await presentationQueue.catch(() => {});
      if (!stopped && launcherOpen) await presentLauncher(true);
    } catch (reason) { if (!stopped) publish({ phase: "error", bindings: [], message: reason instanceof Error ? reason.message : String(reason) }); }
    finally { running = false; if (dirty && !stopped) { dirty = false; void sync(); } }
  }
  const onInvoke = (event: Event) => { const id = (event as CustomEvent).detail; if (!stopped && typeof id === "string" && entries.some(e => e.scope === "global" && e.id === id)) invoke(id); };
  window.addEventListener("station:native-shortcut", onInvoke);
  const onDismiss = () => { launcherOpen = false; };
  window.addEventListener("station:launcher-dismiss", onDismiss);
  // A mounted manager releases global keys so the OS cannot swallow recording.
  let suspended = !!document.querySelector("[data-shortcuts-manager]");
  const observer = new MutationObserver(() => { const next = !!document.querySelector("[data-shortcuts-manager]"); if (next !== suspended) { suspended = next; void sync(); } });
  observer.observe(document.body, { subtree: true, childList: true });
  void sync(); const timer = setInterval(() => void sync(), 10_000);
  return () => { stopped = true; abort.abort(); clearInterval(timer); observer.disconnect(); window.removeEventListener("station:native-shortcut", onInvoke); window.removeEventListener("station:launcher-dismiss", onDismiss); };
}
export const desktopShortcuts: DesktopShortcutsPort = { ...desktopShortcutState, connect: connectDesktopShortcuts, present: presentLauncher };

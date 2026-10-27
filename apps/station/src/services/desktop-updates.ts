import {
  unsupportedUpdates,
  type DesktopUpdateState,
} from "../contracts/desktop-updates";
import { rootDesktopCredential } from "./root-credential";

/** Private app service. No SDK export, provider registration or guest message handler. */
function createUpdateClient() {
  let state = unsupportedUpdates;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const token = () =>
    document.querySelector<HTMLMetaElement>('meta[name="station-desktop"]')
      ?.content;
  const publish = (next: DesktopUpdateState) => {
    if (JSON.stringify(state) === JSON.stringify(next)) return;
    state = Object.freeze(next);
    for (const listener of listeners) listener();
  };
  async function request(operation?: "check" | "apply") {
    const secret = await rootDesktopCredential();
    if (!secret || window.top !== window) return;
    const response = await fetch(
      `/api/desktop/updates${operation ? `/${operation}` : ""}`,
      {
        method: operation ? "POST" : "GET",
        headers: { "X-Station-Desktop": secret },
        signal: controller
          ? AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Desktop updates unavailable (${response.status}). Retry shortly.`,
      );
    if (!operation) publish(await response.json());
  }
  async function poll() {
    if (!listeners.size) return;
    try { if (!await rootDesktopCredential()) return; }
    catch (error) { publish({ ...state, phase: "error", message: error instanceof Error ? error.message : "Native bootstrap unavailable" }); return; }
    controller = new AbortController();
    try {
      await request();
    } catch (error) {
      if (!controller.signal.aborted)
        publish({
          ...state,
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
        });
    } finally {
      controller = undefined;
      if (listeners.size) timer = setTimeout(() => void poll(), 1000);
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) void poll();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          clearTimeout(timer);
          controller?.abort();
        }
      };
    },
    async operation(operation: "check" | "apply") {
      try {
        await request(operation);
        await request();
      } catch (error) {
        publish({
          ...state,
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
export const desktopUpdates = createUpdateClient();

import {
  unsupportedUpdates,
  type DesktopUpdateState,
} from "../src/contracts/desktop-updates";

interface UpdateInfo {
  updateAvailable: boolean;
  updateReady: boolean;
  error: string;
  hash?: string;
}
/** Adapter deliberately excludes paths, process execution and arbitrary native calls. */
export interface DesktopUpdater {
  getLocalInfo(): Promise<{ channel: string; version: string }>;
  checkForUpdate(): Promise<UpdateInfo>;
  downloadUpdate(): Promise<void>;
  updateInfo(): UpdateInfo;
  applyUpdate(): Promise<void>;
  onStatusChange(
    callback:
      | ((entry: {
          status: string;
          message: string;
          details?: { progress?: number };
        }) => void)
      | null,
  ): void;
}

/** Cached immutable snapshots; one operation covers check, download, confirmation and apply.
 * Quit approval precedes helper arming in the pinned updater. Only launching-new-version commits cleanup.
 */
export function createDesktopUpdates(
  updater: DesktopUpdater,
  options: {
    /** Baked install policy: disabled installs cannot check even from native menus. */
    enabled?: boolean;
    confirm(): Promise<boolean>;
    ready(): void;
    handoff(): void;
  },
) {
  let state = unsupportedUpdates;
  let busy = false,
    disposed = false;
  let notifiedVersion = "";
  const listeners = new Set<() => void>();
  const set = (patch: Partial<DesktopUpdateState>) => {
    if (disposed) return;
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        console.error("Desktop update observer:", error);
      }
    }
  };
  const fail = (error: unknown) =>
    set({
      phase: "error",
      progress: null,
      message: error instanceof Error ? error.message : String(error),
    });
  updater.onStatusChange((entry) => {
    if (disposed) return;
    if (entry.status === "launching-new-version" && state.phase === "applying")
      options.handoff();
    if (entry.status === "error" && !busy) fail(entry.message);
    if (state.phase === "downloading")
      set({
        message: entry.message,
        progress:
          entry.status === "download-progress" &&
          Number.isFinite(entry.details?.progress)
            ? Math.max(0, Math.min(100, Math.round(entry.details!.progress!)))
            : null,
      });
  });
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async initialize() {
      try {
        const local = await updater.getLocalInfo();
        set({
          ...unsupportedUpdates,
          version: local.version,
          ...(options.enabled === false ? { message: "Updates are disabled for this installation. Reinstall a local build to update." } : {}),
          ...(local.channel === "canary" && options.enabled !== false
            ? {
                phase: "idle" as const,
                message: "Updates download automatically. Restart when ready.",
              }
            : {}),
        });
      } catch (error) {
        fail(error);
      }
    },
    async check() {
      if (
        disposed ||
        options.enabled === false ||
        busy ||
        state.phase === "unsupported" ||
        state.phase === "ready"
      )
        return;
      busy = true;
      set({
        phase: "checking",
        progress: null,
        message: "Checking for updates…",
      });
      try {
        const info = await updater.checkForUpdate();
        if (disposed) return;
        if (info.error) throw new Error(info.error);
        set({ lastCheck: Date.now() });
        if (!info.updateAvailable) {
          set({ phase: "up-to-date", message: "Station is up to date." });
          return;
        }
        if (!info.updateReady) {
          set({ phase: "downloading", message: "Downloading update…" });
          await updater.downloadUpdate();
        }
        if (disposed) return;
        const ready = updater.updateInfo();
        if (ready.error || !ready.updateReady)
          throw new Error(
            ready.error ||
              "Update download did not complete. Check for updates to retry.",
          );
        set({
          phase: "ready",
          progress: null,
          message: "Update downloaded. Restart when ready.",
        });
        const notificationKey = ready.hash || "prepared-update";
        if (notifiedVersion !== notificationKey) {
          notifiedVersion = notificationKey;
          options.ready();
        }
      } catch (error) {
        fail(error);
      } finally {
        busy = false;
      }
    },
    async apply() {
      if (
        disposed ||
        options.enabled === false ||
        busy ||
        state.phase !== "ready" ||
        !updater.updateInfo().updateReady
      )
        return;
      busy = true;
      try {
        if (!(await options.confirm()) || disposed) return;
        set({ phase: "applying", message: "Restarting to install update…" });
        await updater.applyUpdate();
        if (!disposed) {
          const error = updater.updateInfo().error;
          if (error) throw new Error(error);
          set({
            phase: "ready",
            message: "Restart was cancelled. You can retry.",
          });
        }
      } catch (error) {
        fail(error);
      } finally {
        busy = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      updater.onStatusChange(null);
      listeners.clear();
    },
  };
}

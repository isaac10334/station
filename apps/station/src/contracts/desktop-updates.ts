/** Private trusted-app contract. Never registered with the guest SDK or Loop Kit. */
export interface DesktopUpdateState {
  readonly phase:
    | "unsupported"
    | "idle"
    | "up-to-date"
    | "checking"
    | "downloading"
    | "ready"
    | "applying"
    | "error";
  readonly version: string;
  readonly lastCheck: number | null;
  readonly progress: number | null;
  readonly message: string;
}

export const unsupportedUpdates: DesktopUpdateState = Object.freeze({
  phase: "unsupported",
  version: "",
  lastCheck: null,
  progress: null,
  message: "Updates are available in an installed Station canary.",
});

/** One label vocabulary for native menus, tray and Settings. */
export function updateLabel(state: DesktopUpdateState): string {
  switch (state.phase) {
    case "checking":
      return "Checking for updates…";
    case "downloading":
      return state.progress === null
        ? "Downloading update…"
        : `Downloading update… ${state.progress}%`;
    case "ready":
      return "Update ready";
    case "applying":
      return "Restarting…";
    case "error":
      return "Update failed — retry";
    case "up-to-date":
      return "Station is up to date";
    case "unsupported":
      return "Updates unavailable";
    default:
      return "Check for updates";
  }
}

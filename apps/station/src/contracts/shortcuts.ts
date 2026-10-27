export type ShortcutRegistration = { id: string; keys: string | null; scope: "workspace" | "desk" | "global" };
export type GlobalShortcutState = { phase: "web" | "connecting" | "ready" | "error"; bindings: readonly { id: string; status: string; message?: string }[]; message?: string };
/** Native registration is injected trusted infrastructure. UI observes statuses
 * and requests bounded binding IDs; no native handles or evaluator escape hatch. */
export interface DesktopShortcutsPort {
  getSnapshot(): GlobalShortcutState;
  subscribe(listener: () => void): () => void;
  connect(entries: readonly ShortcutRegistration[], invoke: (id: string) => void): () => void;
  /** Trusted native shortcut presentation only. Closing restores the same window. */
  present?(open: boolean, expand?: boolean): Promise<void>;
}

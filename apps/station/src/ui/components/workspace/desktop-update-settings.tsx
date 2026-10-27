import { useSyncExternalStore } from "react";
import { desktopUpdates } from "../../../services/desktop-updates";
import { updateLabel } from "../../../contracts/desktop-updates";
import { Button } from "../ui/button";
import { SettingsSection } from "./settings-section";

/** App-owned settings consume only the private desktop snapshot and two operations. */
export function DesktopUpdateSettings() {
  const state = useSyncExternalStore(
    desktopUpdates.subscribe,
    desktopUpdates.getSnapshot,
  );
  const busy = ["checking", "downloading", "applying"].includes(state.phase);
  return (
    <SettingsSection
      title="Station updates"
      description="Installed canaries check at startup and every five minutes. Downloads happen automatically."
    >
      <div className="flex flex-col gap-3">
        <p role="status" aria-live="polite" className="text-sm text-fg">
          {updateLabel(state)}
        </p>
        <p className="text-xs leading-5 text-fg-2">{state.message}</p>
        {state.phase === "downloading" && (
          <progress
            aria-label="Update download"
            max={100}
            value={state.progress ?? undefined}
            className="w-full"
          />
        )}
        <p className="text-xs text-fg-2">
          {state.version && `Version ${state.version} · `}
          {state.lastCheck
            ? `Last checked ${new Date(state.lastCheck).toLocaleString()}`
            : "No successful check yet"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={
              busy || state.phase === "unsupported" || state.phase === "ready"
            }
            onClick={() => void desktopUpdates.operation("check")}
          >
            {state.phase === "error" ? "Retry" : "Check for updates"}
          </Button>
          {state.phase === "ready" && (
            <Button
              size="sm"
              onClick={() => void desktopUpdates.operation("apply")}
            >
              Restart to update
            </Button>
          )}
        </div>
        <p className="text-xs leading-5 text-fg-2">
          Closing the desktop window hides it to the tray. Chats, runs and
          downloads continue while hidden. Switching desks still stops that
          desk’s runtimes. Quit or restart ends active work; saved workspaces
          and grants are kept.
        </p>
      </div>
    </SettingsSection>
  );
}

import { useState, useSyncExternalStore } from "react";
import { deps } from "../../../composition";
import type { Panel } from "../../../core/docking";
import { ProgramAuthor } from "./program-author";
import { PortableSurface } from "./portable-surface";
import { controlOperation } from "../../lib/control-operation";
import { useDockController } from "../../docking/react";
import { panelSurface } from "../../../core/docking";
import { IconAction } from "../ui/icon-action";
import { Play } from "lucide-react";
import { Button } from "../ui/button";
/** A real widget instance retains its Component and surface when moved by the dock host. */
export function ProgramWidget({ panel }: { panel: Panel }) {
  useSyncExternalStore(deps.programs.subscribe, deps.programs.version);
  const [error, setError] = useState(""),
    [editing, setEditing] = useState(false);
  const frame = deps.programs.frame(panel.id);
  const { layout } = useDockController();
  if (!frame && panelSurface(layout, panel.id) === "toolbar")
    return (
      <IconAction
        label={error || "Start " + (panel.displayName ?? "portable widget")}
        onClick={() =>
          void controlOperation("programs.start", {
            instanceId: panel.id,
          }).catch((reason) => setError(String(reason)))
        }
      >
        <Play size={16} />
      </IconAction>
    );
  return (
    <div className="h-full min-h-0 min-w-0 overflow-auto">
      {frame && (
        <div className="flex justify-end border-b border-line px-2 py-1">
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Show widget" : "Edit widget"}
          </Button>
        </div>
      )}
      {frame && !editing ? (
        <>
          <PortableSurface
            frame={frame}
            onEvent={(event) => {
              void controlOperation("programs.event", {
                instanceId: panel.id,
                event,
              }).catch((error) => setError(String(error)));
            }}
          />
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </>
      ) : (
        <ProgramAuthor
          id={panel.id}
          initial={panel.programDraft}
          definitionId={
            panel.kind === "contribution" ? panel.definitionId : undefined
          }
        />
      )}
    </div>
  );
}

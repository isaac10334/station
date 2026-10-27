import { panelSlot } from "../../../core/docking";
import { useDockController } from "../../docking/react";
import { Button } from "../ui/button";
import { ActionTooltip } from "../ui/action-tooltip";
import { X, Trash2 } from "lucide-react";

/** The reducer performs combined removal atomically, with one layout undo entry. */
export function WidgetRemovalActions({
  panelId,
  keepChildren = false,
}: {
  panelId: string;
  keepChildren?: boolean;
}) {
  const { layout, command } = useDockController();
  const slot = panelSlot(layout, panelId);
  const eligible = slot?.node.tabs.length === 1;
  return (
    <div className="flex flex-col gap-0.5 border-t border-line-2 pt-2">
      <Button
        size="sm"
        variant="ghost"
        className="w-full justify-start text-fg-3 hover:text-danger"
        onClick={() => command({ type: "close", panelId })}
      >
        <X size={14} />
        Remove instance{keepChildren ? " · keep children" : ""}
      </Button>
      <ActionTooltip
        label={
          eligible
            ? "Remove this instance and its slot; authored assets remain"
            : "Available only for a docked slot with one instance"
        }
      >
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start text-fg-3 hover:text-danger"
          disabled={!eligible}
          onClick={() => command({ type: "closeAndRemoveSlot", panelId })}
        >
          <Trash2 size={14} />
          Remove instance and slot
        </Button>
      </ActionTooltip>
    </div>
  );
}

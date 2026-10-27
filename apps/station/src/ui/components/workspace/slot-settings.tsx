import { findNode, visitNode, type Surface } from "../../../core/docking";
import { useDockController } from "../../docking/react";
import { Button } from "../ui/button";
import { useState } from "react";

/** Slot layout controls target the existing graph, independently of the widget occupying it. */
export function SlotSettings({
  nodeId,
  onInspectWidget,
}: {
  nodeId: string;
  onInspectWidget: (id: string) => void;
}) {
  const { layout, command, panelTitle, openCatalog } = useDockController();
  const [error, setError] = useState("");
  const node = findNode(layout, nodeId);
  if (!node)
    return <p className="text-xs text-fg-3">This slot has been removed.</p>;
  let ownerId: string | undefined,
    surface: Surface = "main";
  for (const [id, root] of Object.entries(layout.containers))
    visitNode(root, (n) => {
      if (n.id === nodeId) ownerId = id;
    });
  for (const [id, root] of Object.entries(layout.surfaces))
    visitNode(root, (n) => {
      if (n.id === nodeId) surface = id as Surface;
    });
  const split = (axis: "horizontal" | "vertical") => {
    const result = command({ type: "splitSlot", nodeId, axis });
    setError(result.ok ? "" : result.reason);
  };
  return (
    <section className="space-y-3" aria-label="Slot settings">
      <strong className="text-sm">
        {node.kind === "stack" ? "Slot settings" : "Layout settings"}
      </strong>
      <p className="text-xs text-fg-3">
        Layout and contents belong to this slot. Each widget has its own
        appearance and behavior.
      </p>
      {(ownerId ?? layout.rootId) && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onInspectWidget((ownerId ?? layout.rootId)!)}
        >
          Parent: {panelTitle(layout.panels[(ownerId ?? layout.rootId)!])}
        </Button>
      )}
      {node.kind === "stack" && (
        <>
          <p className="text-xs text-fg-3">Empty slots stay available until you remove them.</p>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={String(surface) === "toolbar"}
              onClick={() => split("horizontal")}
            >
              Split columns
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={String(surface) === "toolbar"}
              onClick={() => split("vertical")}
            >
              Split rows
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                openCatalog({ surface, ownerId, nodeId, intent: "tab" })
              }
            >
              Add widget
            </Button>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-fg-3">
              {node.tabs.length ? "Widgets in this slot" : "Empty slot"}
            </p>
            {node.tabs.map((id) => (
              <Button
                className="w-full justify-start"
                key={id}
                size="sm"
                variant="ghost"
                onClick={() => onInspectWidget(id)}
              >
                {panelTitle(layout.panels[id])}
              </Button>
            ))}
          </div>
          {!node.tabs.length && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const result = command({ type: "removeSlot", nodeId });
                setError(result.ok ? "" : result.reason);
              }}
            >
              Remove empty slot
            </Button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

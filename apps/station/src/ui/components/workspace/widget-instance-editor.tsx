import { DockInspector } from "../../docking/inspector";
import { useDockController } from "../../docking/react";
import { WidgetPreview } from "./widget-preview";
import { Button } from "../ui/button";

/** Instance editing uses the live graph and shared controls. The preview stays
 * inert; showing the live widget retains its existing service/session owner. */
export function WidgetInstanceEditor({ panelId }: { panelId: string }) {
  const {
    selectedWidget,
    layout,
    panelTitle,
    focusPanel,
    onOpenDefinition,
    command,
    selectWidget,
    setSelectingWidget,
  } = useDockController();
  const selected = selectedWidget && layout.panels[selectedWidget];
  return (
    <div className="station-instance-editor">
      <section
        className="station-instance-preview"
        aria-label="Instance preview"
      >
        <h2 className="text-sm font-medium">
          {selected ? panelTitle(selected) : "Select a widget"}
        </h2>
        {selected && selected.kind === "widget" && (
          <WidgetPreview
            seed={{
              widget: selected.widget,
              defaults: {
                displayName: selected.displayName,
                hideDisplayName: selected.hideDisplayName,
                background: selected.background,
              },
            }}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!layout.floating[panelId])
                command({ type: "float", panelId });
              setSelectingWidget(true);
            }}
          >
            Pick on desk
          </Button>
          {layout.rootId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => selectWidget(layout.rootId!)}
            >
              Select desk root
            </Button>
          )}
          {selected &&
            selected.id !== panelId &&
            selected.id !== layout.rootId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => focusPanel(selected.id)}
              >
                Show live widget
              </Button>
            )}
          {selected && selected.kind === "widget" && onOpenDefinition && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onOpenDefinition(
                  selected.definitionId ?? `builtin:${selected.widget}`,
                )
              }
            >
              Edit definition
            </Button>
          )}
        </div>
        <p className="text-xs text-fg-3">
          Instance settings apply to this desk. Definition edits set defaults
          for future instances.
        </p>
      </section>
      <DockInspector panelId={panelId} />
    </div>
  );
}

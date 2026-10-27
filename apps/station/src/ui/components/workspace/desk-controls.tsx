import { useState } from "react";
import { useWidgetToolbarControls } from "./widget-frame";
import { useDeskScene } from "./desk-scene";
import { DeskOverview } from "./desk-overview";
import type { Workspace } from "../../../core/workspace-state";
import { deps } from "../../../composition";
import { useDockController } from "../../docking/react";
import { IconAction } from "../ui/icon-action";
import { ActionTooltip } from "../ui/action-tooltip";
import { Columns, Settings, Search } from "../../lib/icons";
import { WorkspaceSharing } from "./workspace-sharing";
import { Dialog } from "../ui/dialog";
import { DeskSettingsDialog } from "./desk-settings-dialog";

/** Desk controls are normal retained widget content; DockHost owns placement and overlay dragging. */
export function DeskControls({
  workspace,
  onSearch,
}: {
  workspace: Workspace;
  onSearch: (query?: string) => void;
}) {
  const { command } = useDockController();
  const widgetControls = useWidgetToolbarControls();
  const desk = deps.store.desk();
  const [open, setOpen] = useState(false);
  const { open: overview, snapshot, show: showOverview } = useDeskScene();
  const openAsset = (id: string) => {
    command({ type: "openAsset", assetId: id });
    setOpen(false);
  };
  const create = (kind: "theme" | "package") =>
    openAsset(
      deps.store.createDataAsset(
        kind,
        kind === "theme" ? "My theme" : "My package",
      ),
    );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="station-desk-controls" aria-label="Desk toolbar">
        {widgetControls}
        <ActionTooltip label="Switch desk"><button type="button" aria-label="Switch desk" className="flex h-8 min-w-0 items-center gap-2 rounded-lg px-2 text-sm text-fg-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus" onClick={event => showOverview(true, event.detail !== 0)}><Columns /><span className="max-w-32 truncate">{desk.name}</span></button></ActionTooltip>
        <ActionTooltip label="Configure desk">
              <button
                type="button"
                aria-label="Configure desk"
                className="station-icon-action inline-grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-fg-3"
                onClick={event => showOverview(true, event.detail !== 0)}
              >
            <Settings />
          </button>
        </ActionTooltip>
        <IconAction
          label="Search workspace"
          className="size-8 border-transparent bg-transparent"
          onClick={() => onSearch()}
        >
          <Search />
        </IconAction>
        <WorkspaceSharing />

      </div>
      <DeskOverview snapshot={snapshot} onCreate={() => { showOverview(false); deps.store.createDesk(`Desk ${workspace.desks.length + 1}`); }} workspace={workspace} open={overview} onOpenChange={showOverview} onSelect={id => { showOverview(false); deps.store.selectDesk(id); }} onConfigure={() => { showOverview(false, false); setOpen(true); }} onRootChange={selection => { const result = command(selection); if (!result.ok) throw new Error(result.reason); showOverview(false); }} onOpenRoot={() => { const root = workspace.dock.panels[workspace.dock.rootId!]; if (root?.kind === "widget") { showOverview(false, false); openAsset(root.definitionId ?? `builtin:${root.widget}`); } }} />
      {open && (
        <DeskSettingsDialog
          workspace={workspace}
          onClose={() => setOpen(false)}
          onCreate={create}
          onOpenAsset={openAsset}
          onSearch={() => {
            setOpen(false);
            onSearch("> ");
          }}
        />
      )}
    </Dialog>
  );
}

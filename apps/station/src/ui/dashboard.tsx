import { InlineEdit } from "./components/ui/inline-edit";
import { WidgetInstanceEditor } from "./components/workspace/widget-instance-editor";
import { DockInspector } from "./docking/inspector";
import { ScrollArea } from "./components/ui/scroll-area";
import { DockSurface, useDockController } from "./docking/react";
import { isLayoutPanel, type Panel } from "../core/docking";
import { WidgetView, type WidgetActions } from "./widget-views";
import type { Workspace } from "../core/workspace-state";
import { WebWidgetInstance } from "./web-widget-instance";
import { WidgetFrame, type WidgetFrameProps } from "./components/workspace/widget-frame";
import { LayoutWidget } from "./components/workspace/layout-widget";
import { useRef, useState } from "react";
import { DashboardControls } from "./components/workspace/dashboard-controls";

/** A home surface contains the widget grid; placement lives in the dock document. */
export function Dashboard({ workspace, onRename }: { workspace: Workspace; onRename: (name: string) => void }) {
  const { editingWidgets, setEditingWidgets, command, openCatalog } = useDockController();
  const width = workspace.dock.dashboardWidth ?? 100;
  const [preview, setPreview] = useState<number | null>(null);
  const drag = useRef<{ x: number; width: number; available: number; next: number } | null>(null);
  const clamp = (value: number) => Math.round(Math.max(40, Math.min(100, value)));
  const commit = (percent: number) => command({ type: "resizeDashboard", percent: clamp(percent) });
  return (
    <div className="dashboard relative">
      <div className="dashboard-heading">
        <div className="min-w-0">
          <h1><InlineEdit label="workspace name" value={workspace.name} validate={value => !value.trim() ? "Enter a workspace name" : value.length > 120 ? "Use at most 120 characters" : undefined} onCommit={value => onRename(value)} /></h1>
          {workspace.description && workspace.description !== "Local asset workspace" && <p>{workspace.description}</p>}
        </div>
        <DashboardControls width={width} editing={editingWidgets} onWidth={commit} onEditing={setEditingWidgets} onAdd={() => openCatalog({ surface: "dashboard", intent: "append" })} />
      </div>
      {editingWidgets && <p role="status" className="mb-5 text-xs leading-relaxed text-fg-3">Drag a heading to move a widget. Use its × to remove it. Drag the right edge to adjust content width, or press Escape to finish.</p>}
      <div className="relative mx-auto" style={{ width: `${preview ?? width}%`, minWidth: "min(100%, 28rem)" }}>
      <DockSurface surface="dashboard" />
      {editingWidgets && <div role="separator" tabIndex={0} aria-label="Resize dashboard width" aria-orientation="vertical" aria-valuemin={40} aria-valuemax={100} aria-valuenow={preview ?? width}
        className="absolute -right-2 top-0 bottom-0 min-h-16 w-3 cursor-col-resize touch-none rounded border-r border-line-2 focus-visible:outline focus-visible:outline-focus-ring"
        onPointerDown={e => { if (e.button !== 0) return; const available = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect().width; drag.current = { x: e.clientX, width, available, next: width }; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus(); e.preventDefault(); }}
        onPointerMove={e => { const d = drag.current; if (!d) return; d.next = clamp(d.width + (e.clientX - d.x) * 200 / d.available); setPreview(d.next); }}
        onPointerUp={() => { if (drag.current) commit(drag.current.next); drag.current = null; setPreview(null); }}
        onPointerCancel={() => { drag.current = null; setPreview(null); }}
        onLostPointerCapture={() => { drag.current = null; setPreview(null); }}
        onDoubleClick={() => commit(100)} onKeyDown={e => { if (e.key === "Escape") { drag.current = null; setPreview(null); } const next = e.key === "ArrowLeft" ? width - 2 : e.key === "ArrowRight" ? width + 2 : e.key === "Home" ? 40 : e.key === "End" ? 100 : null; if (next !== null) { e.preventDefault(); commit(next); } }} />}
      </div>
    </div>
  );
}

/** Authored content keeps its sandbox and host-owned recovery controls. */
export function DockWebWidget({ panel, workspace, onOpen, frame }: {
  panel: Extract<Panel, { kind: "web-widget" }>;
  workspace: Workspace;
  onOpen: (id: string) => void;
  frame?: Pick<WidgetFrameProps, "header" | "back">;
}) {
  const asset = workspace.assets.find(item => item.id === panel.assetId);
  if (!asset || asset.kind !== "web-content") return null;
  return <WidgetFrame {...frame} panel={panel} title={panel.displayName || asset.name} onOpenSource={() => onOpen(asset.id)}><WebWidgetInstance asset={asset} /></WidgetFrame>;
}

/** Layout is an ordinary widget composing the shared dock owner surface. */
export function DockWidget({ panel, workspace, actions, frame }: {
  panel: Extract<Panel, { kind: "widget" }>;
  workspace: Workspace;
  actions: WidgetActions;
  /** Host React composition only; overrides never enter saved instance state. */
  frame?: Pick<WidgetFrameProps, "header" | "back">;
}) {
  const { panelTitle } = useDockController();
  const title = panelTitle(panel);
  const content = <WidgetView id={panel.widget} instanceId={panel.id} workspace={workspace} actions={actions} />;
  return <WidgetFrame {...frame} integratedToolbar={panel.widget === "data-view" || panel.widget === "desk-controls"} panel={panel} title={title}>
    {isLayoutPanel(panel) ? <LayoutWidget ownerId={panel.id} className="station-widget-content station-layout-content" />
      : panel.widget === "widget-editor" ? <WidgetInstanceEditor panelId={panel.id} />
      : panel.widget === "docking-inspector" ? <div className="station-widget-content flex min-h-0 overflow-hidden"><DockInspector panelId={panel.id} /></div>
        : panel.widget === "desk-controls" || panel.widget === "data-view" || panel.widget === "note" || panel.widget === "ide" || panel.widget === "desk-settings" || panel.widget === "ai-chat" || panel.widget === "browser-tab" ? <div className="station-widget-content flex min-h-0 overflow-hidden">{content}</div>
      : <ScrollArea className="station-widget-content" contentClassName="station-widget-scroll-content" fade={false} aria-label={`${title} content`}>
        {content}
      </ScrollArea>}
  </WidgetFrame>;
}

import type { DockLayout, Node } from "../../../core/docking";
import type { Workspace } from "../../../core/workspace-state";
import { BUILTIN_WIDGET_DEFINITIONS } from "../../../core/widget-definitions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { ShellDefinitionField, type RootShellSelection } from "./shell-definition-field";
import { Plus, ArrowUpRight, Settings, X } from "../../lib/icons";
import { WidgetPreview } from "./widget-preview";

/** Inert projection of the saved graph. Overview never mounts another instance,
 * controller or service; switching uses the existing desk lifecycle. */
export function DeskLayoutPreview({ layout, compact = false, assets = {} }: { layout: DockLayout; compact?: boolean; assets?: Record<string, string> }) {
  const title = (panel: DockLayout["panels"][string]) => panel.displayName ?? (panel.kind === "widget" ? BUILTIN_WIDGET_DEFINITIONS[panel.widget].title : panel.kind === "editor-part" ? ({files:"Files",code:"Source",preview:"Preview",problems:"Problems"})[panel.part] : panel.kind === "asset" || panel.kind === "web-widget" ? assets[panel.assetId] ?? "Asset editor" : panel.kind === "navigation" ? "Navigation" : panel.kind === "browser" ? "Asset browser" : panel.kind === "home" ? "Overview" : "Output");
  const root = layout.panels[layout.rootId!];
  const desktop = root?.kind === "widget" && root.widget === "desktop-shell";
  const project = (node: Node | null, depth = 0): React.ReactNode => {
    if (!node || depth > 5) return <div className="desk-preview-empty" />;
    if (node.kind === "split") return <div className="desk-preview-split" style={{ flexDirection: node.axis === "horizontal" ? "row" : "column" }}><div style={{ flex: node.ratio }}>{project(node.first, depth + 1)}</div><div style={{ flex: 1 - node.ratio }}>{project(node.second, depth + 1)}</div></div>;
    if (node.kind === "grid") return <div className="desk-preview-grid">{node.cells.map(cell => <div key={cell.id}>{project(cell.node, depth + 1)}</div>)}</div>;
    const panel = layout.panels[node.active] ?? layout.panels[node.tabs[0]];
    if (!panel) return <div className="desk-preview-empty">{!compact && "Empty slot"}</div>;
    if (layout.containers[panel.id]) return <div className="desk-preview-owner">{!compact && <span>{title(panel)}</span>}{project(layout.containers[panel.id], depth + 1)}</div>;
    if (compact) return <div className="desk-preview-tile" data-kind={panel.kind}><i /><i /><i /></div>;
    return panel.kind === "widget" ? <WidgetPreview small seed={{ widget: panel.widget, defaults: { displayName: panel.displayName, surface: panel.surface, background: panel.background } }} /> : <div className="desk-preview-empty">{title(panel)}</div>;
  };
  return <div className="desk-layout-preview" data-compact={compact || undefined} data-desktop={desktop || undefined} aria-hidden="true" inert>
    {!desktop && <><div className="desk-preview-sidebar">{project(layout.surfaces.sidebar)}</div>
    <div className="desk-preview-main">{project(layout.surfaces.main)}{layout.surfaces.dashboard && project(layout.surfaces.dashboard)}</div>
    <div className="desk-preview-bottom">{project(layout.surfaces.bottom)}</div></>}
    {Object.entries(layout.floating).filter(([,position]) => !position.hidden && position.presentation !== "peek").map(([id,position]) => <div key={id} className="desk-preview-window" style={{ left: `${Math.min(68, position.x / 14.4)}%`, top: `${Math.min(64, position.y / 9)}%`, width: `${Math.max(24, Math.min(70, (position.width ?? 420) / 14.4))}%`, height: `${Math.max(32, Math.min(75, (position.height ?? 360) / 9))}%` }}>{project({ kind: "stack", id: `preview:${id}`, tabs: [id], active: id })}</div>)}
  </div>;
}

export function DeskOverview({ workspace, open, snapshot, onCreate, onOpenChange, onSelect, onConfigure, onRootChange, onOpenRoot }: {
  workspace: Workspace; open: boolean; snapshot: boolean; onCreate: () => void;
  onOpenChange: (open: boolean) => void; onSelect: (id: string) => void; onConfigure: () => void;
  onRootChange: (selection: RootShellSelection) => void | Promise<void>; onOpenRoot: () => void;
}) {
  const desk = workspace.desks.find(item => item.id === workspace.activeDeskId)!;
  const root = workspace.dock.panels[workspace.dock.rootId!];
  const assets = Object.fromEntries(workspace.assets.map(asset => [asset.id, asset.name]));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent showCloseButton={false} size="lg" className="desk-expose" viewportClassName="desk-expose-viewport" backdropClassName="desk-expose-backdrop">
    <header className="desk-expose-heading"><div><DialogTitle>{workspace.name}</DialogTitle><p className="text-xs text-fg-3">Your desks, in one place</p></div><Button variant="ghost" size="sm" aria-label="Return to desk" onClick={() => onOpenChange(false)}><X size={16} /><span>Done</span></Button></header>
    <button type="button" className="desk-expose-current" aria-label={`Enter ${desk.name}`} onClick={() => onOpenChange(false)}>
      <span className="desk-expose-current-label">{desk.name}<ArrowUpRight size={14} /></span>
      {!snapshot && <div className="desk-expose-fallback"><DeskLayoutPreview assets={assets} layout={workspace.dock} /></div>}
    </button>
    <div className="desk-expose-bottom">
      <nav className="desk-expose-carousel" aria-label="Choose desk">{workspace.desks.map(item => <button key={item.id} type="button" className="desk-expose-choice" aria-label={`Open desk ${item.name}`} aria-current={item.id === desk.id ? "page" : undefined} onClick={() => item.id === desk.id ? onOpenChange(false) : onSelect(item.id)}><DeskLayoutPreview compact assets={assets} layout={item.id === desk.id ? workspace.dock : item.dock} /><span>{item.name}</span></button>)}<button type="button" className="desk-expose-new" onClick={onCreate}><Plus size={20} /><span>New desk</span></button></nav>
      <footer className="desk-expose-tools"><div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-fg-3"><span>Root layout</span><ShellDefinitionField workspace={workspace} label="Overview root widget" definitionId={root?.kind === "widget" ? root.definitionId ?? `builtin:${root.widget}` : "builtin:app-shell"} onChange={onRootChange} onOpen={onOpenRoot} /></div><div className="flex items-center gap-1"><Button size="sm" variant="ghost" onClick={onOpenRoot}>Edit definition<ArrowUpRight size={13} /></Button><Button size="sm" variant="ghost" onClick={onConfigure}><Settings size={14} />Desk settings</Button></div></footer>
    </div>
  </DialogContent></Dialog>;
}

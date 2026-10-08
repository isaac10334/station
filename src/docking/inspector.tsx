import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { IconAction } from "@/components/ui/icon-action";
import { EyeIcon } from "@/components/icons/eye";
import { panelSurface, type Node } from "./core";
import { useDockController } from "./react";
import { revealPresentation } from "./presentations";

/** Ordinary widget content inspecting the shared tree, including Layout-owned children. */
export function DockInspector() {
  const { layout, command, panelTitle, debugDropZones, debugLayout, wiggle, setDebugDropZones, setDebugLayout, setWiggle } = useDockController();
  const describe = (node: Node): ReactNode => <details key={node.id} open className="station-tree-branch">
    <summary><span>{node.kind === "split" ? `${node.axis === "horizontal" ? "Columns" : "Rows"} · ${Math.round(node.ratio * 100)}%` : node.kind === "grid" ? "Rows" : `Slot · ${node.tabs.length} widget${node.tabs.length === 1 ? "" : "s"}`}</span><small title={node.id}>{node.id.split(":")[0]}</small></summary>
    <div className="station-tree-children">
      {node.kind === "stack" && node.tabs.map((id) => { const panel = layout.panels[id]; return <div key={id} className="station-tree-instance"><button title={id} onClick={async () => { command({ type: "activate", panelId: id }); const surface = panelSurface(layout, id); if (surface && surface !== "dashboard") command({ type: "visibility", surface, hidden: false }); await revealPresentation(id); }}>{panelTitle(panel)}{node.active === id && <span aria-label="active"> ·</span>}</button>{layout.containers[id] && describe(layout.containers[id])}</div>; })}
      {node.kind === "split" && <>{describe(node.first)}{describe(node.second)}</>}
      {node.kind === "grid" && node.cells.map((cell) => describe(cell.node))}
    </div>
  </details>;
  return <div className="station-inspector">
    <div className="station-inspector-settings"><Switch label="Drop-zone diagnostics" checked={debugDropZones} onCheckedChange={setDebugDropZones} /><Switch label="Layout IDs" checked={debugLayout} onCheckedChange={setDebugLayout} /><Switch label="Wiggle while moving" checked={wiggle} onCheckedChange={setWiggle} /></div>
    <nav aria-label="Layout tree" className="station-layout-tree">{(["main", "dashboard", "sidebar", "bottom"] as const).map((surface) => <section key={surface}>
      <div className="station-tree-surface"><strong>{surface}</strong>{surface !== "dashboard" && <IconAction label={`${layout.hidden[surface] ? "Show" : "Hide"} ${surface}`} onClick={() => command({ type: "visibility", surface, hidden: !layout.hidden[surface] })}><EyeIcon size={17} className={layout.hidden[surface] ? "station-eye-hidden" : ""} /></IconAction>}</div>
      {layout.surfaces[surface] ? describe(layout.surfaces[surface]!) : <p className="station-tree-empty">Empty</p>}
    </section>)}
    {Object.keys(layout.floating).length > 0 && <section><div className="station-tree-surface"><strong>Floating</strong></div>{Object.keys(layout.floating).map((id) => <div key={id} className="station-tree-instance">{panelTitle(layout.panels[id])}{layout.containers[id] && describe(layout.containers[id])}</div>)}</section>}</nav>
  </div>;
}

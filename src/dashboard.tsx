/**
 * The dashboard renders widget instances from the controlled dock document.
 * Catalog drops create instances; each widget's back configures only its own slot.
 *
 * @example
 * <Dashboard workspace={workspace} />
 */
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ExternalLink, FlipHorizontal2, LayoutGrid, PanelBottom, PanelLeft, RotateCcw, X } from "lucide-react";
import { DockSurface, useDockController } from "./docking/react";
import { panelSurface, type Panel } from "./docking/core";
import { WIDGET_CATALOG, WidgetView, type WidgetActions } from "./widget-views";
import type { Workspace } from "./model";
import { webContentDocument } from "./web-content-view";
import type { WidgetTone, WidgetSize, StackMode } from "./panel-layout";

/** A home surface contains the widget grid; placement lives in the dock document. */
export function Dashboard({ workspace }: { workspace: Workspace }) {
  return <div className="dashboard">
    <div className="dashboard-heading"><div><h1>{workspace.name}</h1><p>{workspace.description || "A local space for building units."}</p></div></div>
    <DockSurface surface="dashboard" />
  </div>;
}

/** Dashboard placement of authored web content; the iframe retains the same sandbox as its editor preview. */
export function DockWebWidget({ panel, workspace, onOpen }: { panel: Extract<Panel, { kind: "web-widget" }>; workspace: Workspace; onOpen: (id: string) => void }) {
  const { command } = useDockController();
  const [flipped, setFlipped] = useState(false);
  const reducedMotion = useReducedMotion();
  const unit = workspace.units.find((item) => item.id === panel.unitId);
  if (!unit || unit.kind !== "web-content") return null;
  return <section className="dash-widget dash-widget-standard web-unit-widget" aria-label={`${unit.name} web widget`}>
    <motion.div className="widget-flip" animate={{ rotateY: flipped && !reducedMotion ? 180 : 0 }} transition={{ duration: reducedMotion ? 0 : .46, ease: [0.2, 0.8, 0.2, 1] }}>
    <div className="widget-face widget-front" aria-hidden={flipped} inert={flipped}>
      <div className="dash-widget-head"><h2>{unit.name}</h2><button type="button" className="widget-settings-trigger" aria-label={`Manage ${unit.name}`} title="Manage widget" onClick={() => setFlipped(true)}><FlipHorizontal2 size={17} /></button></div>
      <iframe title={`${unit.name} dashboard widget`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={webContentDocument(unit.html)} />
    </div>
    <div className="widget-face widget-back" aria-hidden={!flipped} inert={!flipped} style={{ transform: reducedMotion ? "none" : "rotateY(180deg)", visibility: reducedMotion ? flipped ? "visible" : "hidden" : undefined }}>
      <div className="widget-back-head"><h2>{unit.name} settings</h2><button type="button" onClick={() => setFlipped(false)} aria-label="Return to widget" title="Return to widget"><RotateCcw size={16} /></button></div>
      <div className="widget-choice"><span>Source</span><div><button type="button" onClick={() => onOpen(unit.id)}>Edit source</button></div></div>
      <button type="button" className="widget-remove" onClick={() => command({ type: "close", panelId: panel.id })}><X size={14} /> Remove widget</button>
    </div>
    </motion.div>
  </section>;
}

/** A widget instance owns its size, placement, and back-side settings. */
export function DockWidget({ panel, workspace, actions }: { panel: Extract<Panel, { kind: "widget" }>; workspace: Workspace; actions: WidgetActions }) {
  const { command, layout } = useDockController();
  const item = WIDGET_CATALOG[panel.widget];
  const [flipped, setFlipped] = useState(false);
  const reducedMotion = useReducedMotion();
  return <section className={`dash-widget dash-widget-${panel.size} widget-tone-${panel.tone ?? (panel.widget === "weather" ? "blue" : panel.widget === "clock" ? "violet" : panel.widget === "stack" ? "coral" : "mint")}`} aria-label={`${item.title} widget`}>
    <motion.div className="widget-flip" animate={{ rotateY: flipped && !reducedMotion ? 180 : 0 }} transition={{ duration: reducedMotion ? 0 : .46, ease: [0.2, 0.8, 0.2, 1] }}>
    <div className="widget-face widget-front" aria-hidden={flipped} inert={flipped}>
    <div className="dash-widget-head"><h2>{item.title}</h2>
      <button type="button" className="widget-settings-trigger" aria-label={`Customize ${item.title}`} title="Customize widget" onClick={() => setFlipped(true)}><FlipHorizontal2 size={17} /></button>
    </div>
    <WidgetView id={panel.widget} workspace={workspace} actions={actions} stackMode={panel.stackMode} />
    </div>
    <div className="widget-face widget-back" aria-hidden={!flipped} inert={!flipped} style={{ transform: reducedMotion ? "none" : "rotateY(180deg)", visibility: reducedMotion ? flipped ? "visible" : "hidden" : undefined }}>
      <div className="widget-back-head"><h2>{item.title} settings</h2><button type="button" onClick={() => setFlipped(false)} aria-label="Return to widget" title="Return to widget"><RotateCcw size={16} /></button></div>
      <div className="widget-palette" role="group" aria-label="Color"><span>Color</span><div>{(["blue", "violet", "coral", "mint", "slate"] as WidgetTone[]).map((tone) => <button type="button" key={tone} className={`widget-swatch widget-swatch-${tone}`} aria-label={`${tone} color`} aria-pressed={panel.tone === tone || !panel.tone && (panel.widget === "weather" ? tone === "blue" : panel.widget === "clock" ? tone === "violet" : panel.widget === "stack" ? tone === "coral" : tone === "mint")} onClick={() => command({ type: "configureWidget", panelId: panel.id, tone })} />)}</div></div>
      <div className="widget-choice" role="group" aria-label="Size"><span>Size</span><div>{(["compact", "standard", "wide"] as WidgetSize[]).map((size) => <button type="button" key={size} aria-pressed={panel.size === size} onClick={() => command({ type: "resizeWidget", panelId: panel.id, size })}>{size}</button>)}</div></div>
      {panel.widget === "stack" && <div className="widget-choice" role="group" aria-label="Stack layout"><span>Stack layout</span><div>{(["carousel", "tabs"] as StackMode[]).map((mode) => <button type="button" key={mode} aria-pressed={(panel.stackMode ?? "carousel") === mode} onClick={() => command({ type: "configureWidget", panelId: panel.id, stackMode: mode })}>{mode === "carousel" ? "Vertical carousel" : "Tabs"}</button>)}</div></div>}
      <div className="widget-choice" role="group" aria-label="Placement"><span>Placement</span><div className="widget-placement-actions">
        {panelSurface(layout, panel.id) ? <button type="button" onClick={() => command({ type: "float", panelId: panel.id })}><ExternalLink size={14} /> Float widget</button>
          : <button type="button" onClick={() => command({ type: "dockFloat", panelId: panel.id })}><LayoutGrid size={14} /> Return to dock</button>}
        {panelSurface(layout, panel.id) && <>
          <button type="button" onClick={() => command({ type: "move", panelId: panel.id, target: { surface: "sidebar", intent: "append" } })}><PanelLeft size={14} /> Sidebar</button>
          <button type="button" onClick={() => command({ type: "move", panelId: panel.id, target: { surface: "bottom", intent: "append" } })}><PanelBottom size={14} /> Bottom</button>
          <button type="button" onClick={() => command({ type: "move", panelId: panel.id, target: { surface: "dashboard", intent: "append" } })}><LayoutGrid size={14} /> Dashboard</button>
        </>}
      </div></div>
      <button type="button" className="widget-remove" onClick={() => command({ type: "close", panelId: panel.id })}><X size={14} /> Remove widget</button>
    </div>
    </motion.div>
  </section>;
}

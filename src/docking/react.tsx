/**
 * Controlled React skin for the headless dock document. The host provides content
 * and persists successful commands; these components own only drag UI state.
 *
 * @example
 * <DockHost layout={workspace.dock} onCommand={store.dispatchDock} renderPanel={renderPanel}>
 *   <DockSurface surface="dashboard" />
 *   <DockSurface surface="bottom" />
 * </DockHost>
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { motion, useReducedMotion } from "motion/react";
import { Box, ExternalLink, LayoutGrid, Maximize2, Minimize2, X } from "lucide-react";
import { Panel as ResizePanel, PanelGroup, PanelHandle } from "@/components/ui/resizable-panels";
import { Tabs, TabsList, TabsPanel, TabsPanels, TabsTab } from "@/components/ui/tabs";
import { BROWSER_ID, DEFAULT_DOCK_POLICY, dropReason, findNode, panelSurface, surfacePanels, visitNode, type Command, type DockLayout, type DockPolicy, type Node, type Panel, type Result, type Stack, type Surface, type Target } from "./core";
import { resolveIntent } from "./drag";
import type { WidgetId } from "../panel-layout";

type ActiveDrag = { kind: "panel"; panelId: string; title: string } | { kind: "widget"; widget: WidgetId; title: string };
type Controller = {
  layout: DockLayout; command: (command: Command) => Result; active: ActiveDrag | null;
  over: string | null; tabDrop: { id: string; after: boolean } | null; debugDropZones: boolean; debugLayout: boolean; wiggle: boolean;
  renderPanel: (panel: Panel) => ReactNode;
  policy: DockPolicy;
};
const DockContext = createContext<Controller | null>(null);
/** Access the controlled command interface from custom panel controls and surfaces. */
export function useDockController() {
  const value = useContext(DockContext);
  if (!value) throw new Error("Dock components need a DockHost");
  return value;
}

export type DockHostProps = {
  layout: DockLayout;
  onCommand: (command: Command) => Result;
  renderPanel: (panel: Panel) => ReactNode;
  debugDropZones?: boolean;
  debugLayout?: boolean;
  wiggle?: boolean;
  policy?: DockPolicy;
  children: ReactNode;
};
export function DockHost({ layout, onCommand, renderPanel, debugDropZones = false, debugLayout = false, wiggle = false, policy = DEFAULT_DOCK_POLICY, children }: DockHostProps) {
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [tabDrop, setTabDrop] = useState<{ id: string; after: boolean } | null>(null);
  const modifiers = useRef({ shift: false, alt: false });
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const reduceMotion = !!useReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  useEffect(() => {
    const update = (event: KeyboardEvent) => { modifiers.current = { shift: event.shiftKey, alt: event.altKey }; };
    const clear = () => { modifiers.current = { shift: false, alt: false }; };
    const move = (event: PointerEvent) => { pointer.current = { x: event.clientX, y: event.clientY }; };
    window.addEventListener("keydown", update); window.addEventListener("keyup", update); window.addEventListener("blur", clear);
    window.addEventListener("pointermove", move, { passive: true });
    return () => { window.removeEventListener("keydown", update); window.removeEventListener("keyup", update); window.removeEventListener("blur", clear); window.removeEventListener("pointermove", move); };
  }, []);
  const command = (command: Command) => onCommand(command);
  const context = useMemo<Controller>(() => ({ layout, command, active, over, tabDrop, debugDropZones, debugLayout, wiggle: wiggle && !reduceMotion, renderPanel, policy }),
    [layout, onCommand, active, over, tabDrop, debugDropZones, debugLayout, wiggle, reduceMotion, renderPanel, policy]);
  const start = (event: DragStartEvent) => {
    const item = event.active.data.current?.item as ActiveDrag | undefined;
    const activation = event.activatorEvent;
    pointer.current = activation instanceof PointerEvent ? { x: activation.clientX, y: activation.clientY } : null;
    if (item) setActive(item);
  };
  const tabBoundary = (event: DragMoveEvent | DragEndEvent) => {
    const target = event.over?.data.current?.target as Target | undefined;
    if (!target || target.intent !== "tab" || target.index === undefined) return null;
    const tabId = event.over?.data.current?.tabId as string | undefined;
    const rect = event.over?.rect;
    const translated = event.active.rect.current.translated;
    const x = pointer.current?.x ?? (translated ? translated.left + translated.width / 2 : null);
    const after = Boolean(tabId && rect && x !== null && x >= rect.left + rect.width / 2);
    return { target: { ...target, index: target.index + Number(after) }, after };
  };
  const move = (event: DragMoveEvent) => {
    const slot = tabBoundary(event);
    const item = event.active.data.current?.item as ActiveDrag | undefined;
    if (!slot || !item) { setTabDrop(null); return; }
    const panel = item.kind === "panel" ? layout.panels[item.panelId] : { id: "preview", kind: "widget" as const, widget: item.widget, size: "standard" as const, tags: ["widget"] };
    const stack = slot.target.nodeId ? findNode(layout, slot.target.nodeId) : null;
    const sourceIndex = stack?.kind === "stack" && item.kind === "panel" ? stack.tabs.indexOf(item.panelId) : -1;
    const noop = sourceIndex >= 0 && (slot.target.index === sourceIndex || slot.target.index === sourceIndex + 1);
    setTabDrop(panel && !noop && !dropReason(layout, panel, slot.target, policy) ? { id: String(event.over!.id), after: slot.after } : null);
  };
  const finish = (event: DragEndEvent) => {
    const item = event.active.data.current?.item as ActiveDrag | undefined;
    const target = tabBoundary(event)?.target ?? event.over?.data.current?.target as Target | undefined;
    if (item && target) {
      const rect = event.over?.rect;
      const translated = event.active.rect.current.translated;
      const point = rect && (pointer.current || translated) ? { x: (pointer.current?.x ?? translated!.left + translated!.width / 2) - rect.left, y: (pointer.current?.y ?? translated!.top + translated!.height / 2) - rect.top, width: rect.width, height: rect.height }
        : { x: 50, y: 50, width: 100, height: 100 };
      const intent = resolveIntent(target.intent, modifiers.current, point);
      const finalTarget = { ...target, intent };
      const panel = item.kind === "panel" ? layout.panels[item.panelId] : { id: "preview", kind: "widget" as const, widget: item.widget, size: "standard" as const, tags: ["widget"] };
      if (panel && !dropReason(layout, panel, finalTarget, policy)) command(item.kind === "widget"
        ? { type: "createWidget", widget: item.widget, target: finalTarget }
        : { type: "move", panelId: item.panelId, target: finalTarget });
    }
    pointer.current = null; setActive(null); setOver(null); setTabDrop(null);
  };
  return <DockContext.Provider value={context}>
    <DndContext sensors={sensors} collisionDetection={(args) => {
      // Sortable tabs also register as droppables. Prefer the precise overlay
      // when pointer and overlay overlap, and never collide with the source.
      const hits = pointerWithin(args).filter((hit) => hit.id !== args.active.id);
      const zones = hits.filter((hit) => String(hit.id).startsWith("dock-target:"));
      return zones.length ? zones : hits.length ? hits : rectIntersection(args).filter((hit) => hit.id !== args.active.id);
    }} onDragStart={start} onDragMove={move} onDragOver={(event) => setOver(event.over?.id?.toString() ?? null)} onDragCancel={() => { pointer.current = null; setActive(null); setOver(null); setTabDrop(null); }} onDragEnd={finish}>
      {children}
      <DragOverlay dropAnimation={reduceMotion ? null : { duration: 170, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
        {active && <motion.div className="dock-drag-ghost" initial={reduceMotion ? false : { opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .14, ease: [0.16, 1, 0.3, 1] }}><span className="dock-drag-ghost-icon">{active.kind === "widget" ? <LayoutGrid size={17} /> : <Box size={17} />}</span><strong>{active.title}</strong></motion.div>}
      </DragOverlay>
    </DndContext>
  </DockContext.Provider>;
}

/** The catalog tile remains mounted while the pointer leaves its popover. */
export function DockCatalogItem({ widget, title, children }: { widget: WidgetId; title: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `catalog:${widget}`, data: { item: { kind: "widget", widget, title } satisfies ActiveDrag } });
  return <button type="button" ref={setNodeRef} {...attributes} {...listeners} className="dock-catalog-item" data-dragging={isDragging || undefined} aria-label={`Drag ${title} widget into workspace`}>{children}</button>;
}

function Zone({ target, className = "", label, showLabel = true }: { target: Target; className?: string; label: string; showLabel?: boolean }) {
  const { active, layout, over, debugDropZones, policy } = useDockController();
  const id = `dock-target:${target.surface}:${target.nodeId ?? "root"}:${target.intent}:${target.index ?? ""}`;
  const { setNodeRef } = useDroppable({ id, data: { target } });
  const panel = active?.kind === "panel" ? layout.panels[active.panelId] : active?.kind === "widget"
    ? { id: "preview", kind: "widget" as const, widget: active.widget, size: "standard" as const, tags: ["widget"] } : null;
  const reason = panel ? dropReason(layout, panel, target, policy) : null;
  const visible = Boolean(active && (!reason || debugDropZones));
  return <div ref={setNodeRef} className={`dock-drop-zone ${className}`} data-visible={visible || undefined} data-eligible={active && !reason || undefined} data-over={over === id || undefined} data-debug={debugDropZones || undefined} aria-label={label}>
    {showLabel && (debugDropZones || over === id && active) && <span className="dock-zone-label">{reason ?? (debugDropZones ? `${target.intent} · ${target.nodeId ?? target.surface}` : label)}</span>}
  </div>;
}
function TargetLayer({ surface, nodeId }: { surface: Surface; nodeId?: string }) {
  return <div className="dock-target-layer" aria-hidden="true">
    <Zone target={{ surface, nodeId, intent: "tab" }} className="dock-zone-center" label="Join tab stack" />
    {surface !== "dashboard" && <>
      <Zone target={{ surface, nodeId, intent: "left" }} className="dock-zone-left" label="Split left" />
      <Zone target={{ surface, nodeId, intent: "right" }} className="dock-zone-right" label="Split right" />
      <Zone target={{ surface, nodeId, intent: "top" }} className="dock-zone-top" label="Split above" />
      <Zone target={{ surface, nodeId, intent: "bottom" }} className="dock-zone-bottom" label="Split below" />
    </>}
  </div>;
}

function DockTab({ panelId, nodeId, surface, index }: { panelId: string; nodeId: string; surface: Surface; index: number }) {
  const { layout, command, debugLayout, wiggle, active, over, tabDrop, policy } = useDockController();
  const panel = layout.panels[panelId];
  const title = panel.kind === "widget" ? panel.widget : panel.kind === "unit" || panel.kind === "web-widget" ? panel.unitId : panel.kind === "browser" ? "Unit browser" : panel.kind === "navigation" ? "Navigation" : "Overview";
  const sortable = useSortable({ id: `panel:${panelId}`, data: { item: { kind: "panel", panelId, title } satisfies ActiveDrag,
    target: { surface, nodeId, intent: "tab", index } satisfies Target, tabId: panelId } });
  const dragged = active?.kind === "panel" ? layout.panels[active.panelId] : active?.kind === "widget"
    ? { id: "preview", kind: "widget" as const, widget: active.widget, size: "standard" as const, tags: ["widget"] } : null;
  const reason = dragged ? dropReason(layout, dragged, { surface, nodeId, intent: "tab", index }, policy) : null;
  return <div ref={sortable.setNodeRef} className="dock-stack-tab" data-active={undefined}
    data-dragging={sortable.isDragging || undefined}
    data-over={over === `panel:${panelId}` || undefined} data-eligible={dragged && !reason || undefined}
    data-drop-before={tabDrop?.id === `panel:${panelId}` && !tabDrop.after || undefined}
    data-drop-after={tabDrop?.id === `panel:${panelId}` && tabDrop.after || undefined}
    data-wiggle={Boolean(wiggle && active && active.kind === "panel" && active.panelId !== panelId && !dropReason(layout, layout.panels[active.panelId], { surface, nodeId, intent: "tab" }, policy)) || undefined}
    onAuxClick={(event) => { if (event.button === 1 && panel.kind !== "home" && panel.kind !== "browser") { event.preventDefault(); command({ type: "close", panelId }); } }}
    >
    <TabsTab value={panelId} ref={sortable.setActivatorNodeRef} {...sortable.listeners} icon={panel.kind === "widget" ? <LayoutGrid size={14} /> : <Box size={14} />}>{title}</TabsTab>
    {panel.kind === "widget" && <button className="dock-tab-close" type="button" title={`Float ${title}`} aria-label={`Float ${title}`} onClick={() => command({ type: "float", panelId })}><ExternalLink size={13} /></button>}
    {panel.kind !== "home" && panel.kind !== "browser" && panel.kind !== "navigation" && <button className="dock-tab-close" type="button" title={`Close ${title}`} aria-label={`Close ${title}`} onClick={() => command({ type: "close", panelId })}><X size={13} /></button>}
    {debugLayout && <small>{panelId}</small>}
  </div>;
}

function TabRail({ node, surface }: { node: Stack; surface: Surface }) {
  const { layout, command } = useDockController();
  const active = node.tabs.includes(node.active) ? node.active : node.tabs[0];
  return <Tabs value={active} onValueChange={(value) => command({ type: "activate", panelId: String(value) })} variant="underline" size="sm">
    <div className="dock-stack-heading"><SortableContext items={node.tabs.map((id) => `panel:${id}`)} strategy={horizontalListSortingStrategy}>
      <TabsList className="dock-tabs-list" wrapperClassName="dock-tabs-wrapper">{node.tabs.map((id, index) => <DockTab key={id} panelId={id} nodeId={node.id} surface={surface} index={index} />)}</TabsList>
    </SortableContext><Zone target={{ surface, nodeId: node.id, intent: "tab", index: node.tabs.length }} className="dock-tab-end" label="Add tab at end" showLabel={false} />
    {surface === "main" && <button className="dock-action" title={layout.maximized === active ? "Restore panel" : "Maximize panel"} aria-label={layout.maximized === active ? "Restore panel" : "Maximize panel"} onClick={() => command({ type: "maximize", panelId: layout.maximized === active ? null : active })}>{layout.maximized === active ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}
    </div></Tabs>;
}
/** The single main stack lends its real tab rail to the shared shell row. */
export function DockMainTabs() {
  const { layout } = useDockController();
  const root = layout.surfaces.main;
  if (layout.hidden.main) return <div className="dock-shell-tabs dock-shell-split-label">Main surface hidden</div>;
  return root?.kind === "stack" ? <div className="dock-shell-tabs"><TabRail node={root} surface="main" /></div> : <div className="dock-shell-tabs dock-shell-split-label">Split workspace</div>;
}
function StackView({ node, surface }: { node: Stack; surface: Surface }) {
  const { layout, command, renderPanel, debugLayout } = useDockController();
  const active = node.tabs.includes(node.active) ? node.active : node.tabs[0];
  return <section className={`dock-stack dock-stack-${surface}`} data-node-id={node.id} data-tab-style="connected" tabIndex={-1}>
    {(surface !== "dashboard" || node.tabs.length > 1) && !(surface === "main" && layout.surfaces.main?.kind === "stack") && <TabRail node={node} surface={surface} />}
    <div className="dock-stack-body" role="tabpanel" aria-label={active}>{renderPanel(layout.panels[active])}{layout.panels[active].kind !== "home" && <TargetLayer surface={surface} nodeId={node.id} />}</div>
    {debugLayout && <span className="dock-debug-node">{node.id} · stack</span>}
  </section>;
}
function NodeView({ node, surface }: { node: Node; surface: Surface }) {
  const { command, debugLayout } = useDockController();
  const reducedMotion = useReducedMotion();
  if (node.kind === "stack") return <StackView node={node} surface={surface} />;
  if (node.kind === "grid") return <div className="dock-grid" data-node-id={node.id} data-empty={node.cells.length === 0 || undefined}>
    {node.cells.map((cell, index) => <motion.div layout={!reducedMotion} transition={{ layout: { duration: .28, ease: [0.2, 0.8, 0.2, 1] } }} className="dock-grid-cell" key={cell.id}><Zone target={{ surface, intent: "append", index }} className="dock-grid-insert" label={`Insert widget before slot ${index + 1}`} /><NodeView node={cell.node} surface={surface} /></motion.div>)}
    <Zone target={{ surface, intent: "append", index: node.cells.length }} className="dock-grid-add" label="Drop widget here" />
    {node.cells.length === 0 && <div className="dock-grid-empty" aria-hidden="true"><LayoutGrid size={22} /><strong>Fill this page with useful widgets</strong><span>Drag a widget here from the toolbar.</span></div>}
    {debugLayout && <span className="dock-debug-node">{node.id} · grid</span>}
  </div>;
  return <div className="dock-split" data-axis={node.axis} data-node-id={node.id}>
    <PanelGroup key={node.id} direction={node.axis} onLayout={(sizes) => command({ type: "resizeSplit", nodeId: node.id, ratio: sizes[0] / 100 })}>
      <ResizePanel id={`${node.id}:first`} defaultSize={node.ratio * 100} minSize={20}><NodeView node={node.first} surface={surface} /></ResizePanel>
      <PanelHandle aria-label={`Resize ${node.axis} split`} grip />
      <ResizePanel id={`${node.id}:second`} defaultSize={(1 - node.ratio) * 100} minSize={20}><NodeView node={node.second} surface={surface} /></ResizePanel>
    </PanelGroup>{debugLayout && <span className="dock-debug-node">{node.id} · {node.axis} · {Math.round(node.ratio * 100)}%</span>}
  </div>;
}
/** Renders any surface from the same node tree. Empty docks expose one drop target during a drag. */
export function DockSurface({ surface, className = "" }: { surface: Surface; className?: string }) {
  const { layout, active, debugLayout, command, renderPanel } = useDockController();
  const root = layout.surfaces[surface];
  const max = layout.maximized;
  const hidden = Boolean(layout.hidden[surface] || max && surface !== "main");
  if (surface === "main" && max && layout.panels[max]) {
    const panel = layout.panels[max];
    const title = panel.kind === "widget" ? panel.widget : panel.kind === "unit" || panel.kind === "web-widget" ? panel.unitId : panel.kind === "browser" ? "Unit browser" : panel.kind === "navigation" ? "Navigation" : "Overview";
    return <div className="dock-maximized" role="region" aria-label={`${title} maximized`}>
      <div className="dock-maximized-bar"><strong>{title}</strong><span className="spacer" /><button className="dock-action" aria-label="Restore panel" title="Restore panel" onClick={() => command({ type: "maximize", panelId: null })}><Minimize2 size={16} /></button></div>
      <div className="dock-maximized-body">{renderPanel(panel)}</div>
    </div>;
  }
  return <div className={`dock-surface dock-surface-${surface} ${className}`} data-debug={debugLayout || undefined} data-maximized={max && surface === "main" || undefined} hidden={hidden}>
    {root ? <NodeView node={root} surface={surface} /> : <div className="dock-empty-surface">{active ? <span>Drop here</span> : surface === "dashboard" ? "Add a widget from the toolbar" : null}<Zone target={{ surface, intent: "append" }} className="dock-empty-target" label={`Dock in ${surface}`} /></div>}
  </div>;
}

/** On narrow viewports the sidebar and bottom docks share one visible tab rail. */
export function DockMobileSurface() {
  const { layout, command, renderPanel, active: dragging } = useDockController();
  const tabs = (["bottom", "sidebar"] as const).flatMap((surface) => {
    const entries: { panelId: string; surface: Surface; nodeId: string; index: number }[] = [];
    if (layout.hidden[surface]) return entries;
    visitNode(layout.surfaces[surface], (node) => {
      if (node.kind === "stack") node.tabs.forEach((panelId, index) => entries.push({ panelId, surface, nodeId: node.id, index }));
    });
    return entries;
  });
  const ids = tabs.map((tab) => tab.panelId);
  const [selected, setSelected] = useState<string>(BROWSER_ID);
  const current = ids.includes(selected) ? selected : ids[0];
  if (!current) return <div className="dock-mobile dock-empty-surface"><Zone target={{ surface: "bottom", intent: "append" }} className="dock-empty-target" label="Dock at bottom" /></div>;
  return <div className="dock-mobile" data-tab-style={layout.panels[current].kind === "browser" ? "connected" : "pill"}>
    <div className="dock-mobile-tabs" role="tablist" aria-label="Docked panels">{tabs.map(({ panelId, surface, nodeId, index }) => {
      const panel = layout.panels[panelId];
      const title = panel.kind === "widget" ? panel.widget : panel.kind === "unit" || panel.kind === "web-widget" ? panel.unitId : panel.kind === "browser" ? "Unit browser" : panel.kind === "navigation" ? "Navigation" : "Overview";
      return <MobileDockTab key={panelId} panelId={panelId} title={title} selected={current === panelId} target={{ surface, nodeId, intent: "tab", index }} onSelect={() => { setSelected(panelId); command({ type: "activate", panelId }); }} />;
    })}{tabs.length > 0 && <Zone target={{ surface: tabs[tabs.length - 1].surface, nodeId: tabs[tabs.length - 1].nodeId, intent: "tab", index: tabs[tabs.length - 1].index + 1 }} className="dock-tab-end dock-mobile-end" label="Add tab at end" showLabel={false} />}</div>
    <div className="dock-mobile-body" role="tabpanel" aria-label={current}>{renderPanel(layout.panels[current])}
      {dragging && <Zone target={{ surface: panelSurface(layout, current) ?? "bottom", intent: "append" }} className="dock-mobile-drop" label="Dock with this panel" />}
    </div>
  </div>;
}

function MobileDockTab({ panelId, title, selected, target, onSelect }: { panelId: string; title: string; selected: boolean; target: Target; onSelect: () => void }) {
  const { tabDrop } = useDockController();
  const { listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: `mobile-panel:${panelId}`, data: { item: { kind: "panel", panelId, title } satisfies ActiveDrag } });
  const id = `mobile-tab:${panelId}`;
  const { setNodeRef: setDropRef } = useDroppable({ id, data: { target, tabId: panelId } });
  return <div ref={(node) => { setDragRef(node); setDropRef(node); }} className="dock-mobile-tab" data-dragging={isDragging || undefined}
    data-drop-before={tabDrop?.id === id && !tabDrop.after || undefined} data-drop-after={tabDrop?.id === id && tabDrop.after || undefined}>
    <button type="button" role="tab" aria-selected={selected} onClick={onSelect} {...listeners}>{title}</button></div>;
}

/** A quiet edge target keeps an empty or collapsed bottom dock reachable by drag. */
export function DockBottomEdge() {
  const { active, layout } = useDockController();
  if (surfacePanels(layout, "bottom").length) return null;
  return <div className="dock-bottom-edge" data-active={active ? "" : undefined} aria-hidden={!active}><span>Dock at bottom</span><Zone target={{ surface: "bottom", intent: "append" }} label="Dock at bottom" /></div>;
}

/** Floating widget instances keep their panel ID and remain outside dock drop targets. */
export function DockFloatingPanels() {
  const { layout, command, renderPanel } = useDockController();
  return <div className="dock-floating-layer">{Object.entries(layout.floating).map(([id, position]) => {
    const panel = layout.panels[id];
    if (!panel || panel.kind !== "widget") return null;
    const width = Math.min(position.width, innerWidth - 16);
    const height = Math.min(position.height, innerHeight - 64);
    const x = Math.min(position.x, Math.max(8, innerWidth - width - 8));
    const y = Math.min(position.y, Math.max(8, innerHeight - height - 8));
    return <section key={id} className="dock-float" style={{ left: x, top: y, width, height }} aria-label={`${panel.widget} floating panel`}>
      <div className="dock-float-header" onPointerDown={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button")) return;
        const startX = event.clientX, startY = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
        const header = event.currentTarget;
        const move = (next: PointerEvent) => { header.parentElement!.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, x + next.clientX - startX))}px`; header.parentElement!.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, y + next.clientY - startY))}px`; };
        const finish = (next: PointerEvent) => { header.removeEventListener("pointermove", move); header.removeEventListener("pointerup", finish); command({ type: "moveFloat", panelId: id, x: x + next.clientX - startX, y: y + next.clientY - startY }); };
        header.addEventListener("pointermove", move); header.addEventListener("pointerup", finish, { once: true });
      }}><strong>{panel.widget}</strong><span className="spacer" /><button type="button" onClick={() => command({ type: "dockFloat", panelId: id })}>Return to dock</button></div>
      <div className="dock-float-body">{renderPanel(panel)}</div>
    </section>;
  })}</div>;
}

/** Developer overlay reads the document without becoming a dock node. */
export function DockInspector({ onClose }: { onClose: () => void }) {
  const { layout, command, policy } = useDockController();
  const describe = (node: Node, depth = 0): ReactNode => <div key={node.id} className="dock-inspector-node" style={{ paddingLeft: depth * 12 }}>
    <div><code>{node.kind}</code> <span>{node.id}</span>{node.kind === "stack" && <small> · active {node.active}</small>}</div>
    {node.kind === "stack" && node.tabs.map((id) => <div key={id} className="dock-inspector-panel" style={{ paddingLeft: 12 }}><button onClick={() => { command({ type: "activate", panelId: id }); const surface = panelSurface(layout, id); if (surface && surface !== "dashboard") command({ type: "visibility", surface, hidden: false }); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`)?.focus()); }}>{layout.panels[id]?.kind} · {id}</button></div>)}
    {node.kind === "split" && <>{describe(node.first, depth + 1)}{describe(node.second, depth + 1)}</>}
    {node.kind === "grid" && node.cells.map((cell) => describe(cell.node, depth + 1))}
  </div>;
  return <aside className="dock-inspector" role="dialog" aria-label="Docking inspector" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <header><strong>Docking inspector</strong><button autoFocus onClick={onClose} aria-label="Close docking inspector"><X size={16} /></button></header>
    <div className="dock-inspector-scroll">{(["main", "dashboard", "sidebar", "bottom"] as const).map((surface) => <section key={surface}>
      <h3>{surface} <small>· {policy[surface].maxLeafStacks} stacks max</small></h3>
      <small>Accepts {policy[surface].acceptedTags.join(", ")}{policy[surface].split ? " · splits allowed" : " · no splits"}</small>
      {surface !== "dashboard" && <button onClick={() => command({ type: "visibility", surface, hidden: !layout.hidden[surface] })}>{layout.hidden[surface] ? "Show" : "Hide"}</button>}
      {layout.surfaces[surface] && describe(layout.surfaces[surface]!)}
    </section>)}
    {Object.keys(layout.floating).length > 0 && <section><h3>Floating</h3>{Object.keys(layout.floating).map((id) => <p key={id}>{id}</p>)}</section>}</div>
  </aside>;
}

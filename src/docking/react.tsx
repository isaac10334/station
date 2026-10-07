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
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, MeasuringStrategy, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { motion, useReducedMotion } from "motion/react";
import { Box, ExternalLink, GripVertical, LayoutGrid, Maximize2, Minimize2, Plus, X } from "lucide-react";
import { Panel as ResizePanel, PanelGroup, PanelHandle } from "@/components/ui/resizable-panels";
import { Tabs, TabsList, TabsPanel, TabsPanels, TabsTab } from "@/components/ui/tabs";
import { BROWSER_ID, DEFAULT_DOCK_POLICY, dropReason, findNode, hostSurface, panelSurface, surfacePanels, visitNode, type Command, type DockLayout, type DockPolicy, type Node, type Panel, type Result, type Stack, type Surface, type Target } from "./core";
import { resolveIntent, createDockKeyboardCoordinates } from "./drag";
import { clippedBounds } from "./geometry";
import { PresentationHost, PresentationSlot, revealPresentation } from "./presentations";
import { WIDGET_CATALOG } from "../widget-catalog";

type ActiveDrag = { kind: "panel"; panelId: string; title: string };
type Controller = {
  layout: DockLayout; command: (command: Command) => Result; active: ActiveDrag | null;
  over: string | null; tabDrop: { id: string; after: boolean } | null; debugDropZones: boolean; debugLayout: boolean; wiggle: boolean;
  renderPanel: (panel: Panel) => ReactNode;
  panelTitle: (panel: Panel) => string;
  policy: DockPolicy;
  pressing: string | null; catalogTarget: Target | null; openCatalog: (target: Target | null) => void;
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
  panelTitle?: (panel: Panel) => string;
  debugDropZones?: boolean;
  debugLayout?: boolean;
  wiggle?: boolean;
  policy?: DockPolicy;
  children: ReactNode;
};
const defaultPanelTitle = (panel: Panel) => panel.kind === "widget" ? WIDGET_CATALOG[panel.widget].title : "unitId" in panel ? panel.unitId : panel.kind === "home" ? "Overview" : panel.kind === "browser" ? "Unit browser" : "Navigation";
export function DockHost({ layout, onCommand, renderPanel, panelTitle = defaultPanelTitle, debugDropZones = false, debugLayout = false, wiggle = false, policy = DEFAULT_DOCK_POLICY, children }: DockHostProps) {
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [tabDrop, setTabDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const [catalogTarget, openCatalog] = useState<Target | null>(null);
  const [announcement, announce] = useState("");
  const [preview, setPreview] = useState<{ x: number; y: number; width: number; height: number; label: string; rejected: boolean } | null>(null);
  const modifiers = useRef({ shift: false, alt: false });
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const keyboardTarget = useRef<string | null>(null);
  const keyboardCoordinates = useMemo(() => createDockKeyboardCoordinates((id) => { keyboardTarget.current = id; }), []);
  const reduceMotion = !!useReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 400, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates.coordinateGetter, scrollBehavior: "instant", keyboardCodes: { start: ["Space", "Enter"], end: ["Space", "Enter"], cancel: ["Escape"] } }),
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
  const context = useMemo<Controller>(() => ({ layout, command, active, over, tabDrop, debugDropZones, debugLayout, wiggle: wiggle && !reduceMotion, renderPanel, panelTitle, policy, pressing, catalogTarget, openCatalog }),
    [layout, onCommand, active, over, tabDrop, debugDropZones, debugLayout, wiggle, reduceMotion, renderPanel, panelTitle, policy, pressing, catalogTarget]);
  const start = (event: DragStartEvent) => {
    keyboardCoordinates.reset();
    const item = event.active.data.current?.item as ActiveDrag | undefined;
    const activation = event.activatorEvent;
    pointer.current = activation instanceof PointerEvent ? { x: activation.clientX, y: activation.clientY } : null;
    setPressing(null);
    if (item) { setActive(item); announce(`Picked up ${item.title}. Arrow keys choose a destination. Enter commits; Escape cancels.`); }
  };
  const tabBoundary = (event: DragMoveEvent | DragEndEvent) => {
    const target = event.over?.data.current?.target as Target | undefined;
    if (!target || target.intent !== "tab" || target.index === undefined) return null;
    const tabId = event.over?.data.current?.tabId as string | undefined;
    const rect = event.over?.rect;
    const translated = event.active.rect.current.translated;
    const x = pointer.current?.x ?? (translated ? translated.left + translated.width / 2 : null);
    const after = Boolean(!keyboardTarget.current && tabId && rect && x !== null && x >= rect.left + rect.width / 2);
    return { target: { ...target, index: target.index + Number(after) }, after };
  };
  const move = (event: DragMoveEvent) => {
    const slot = tabBoundary(event);
    const item = event.active.data.current?.item as ActiveDrag | undefined;
    const base = slot?.target ?? event.over?.data.current?.target as Target | undefined;
    if (base && item) {
      const rect = event.over!.rect;
      const point = { x: (pointer.current?.x ?? rect.left + rect.width / 2) - rect.left, y: (pointer.current?.y ?? rect.top + rect.height / 2) - rect.top, width: rect.width, height: rect.height };
      const target = { ...base, intent: resolveIntent(base.intent, modifiers.current, point) };
      const panel = layout.panels[item.panelId];
      const reason = dropReason(layout, panel, target, policy);
      const element = target.nodeId ? document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(target.nodeId)}"]`) : null;
      const bounds = element?.querySelector(".dock-stack-body")?.getBoundingClientRect() ?? element?.getBoundingClientRect() ?? rect;
      const horizontal = target.intent === "left" || target.intent === "right", vertical = target.intent === "top" || target.intent === "bottom";
      setPreview({ x: bounds.left + (target.intent === "right" ? bounds.width / 2 : 0), y: bounds.top + (target.intent === "bottom" ? bounds.height / 2 : 0), width: bounds.width / (horizontal ? 2 : 1), height: bounds.height / (vertical ? 2 : 1), label: reason ?? `${target.intent === "swap" ? "Swap both widgets" : target.intent === "tab" ? "Join this slot" : target.intent === "append" ? "Create a slot here" : `Split ${target.intent}`} · Enter or release to place`, rejected: !!reason });
    } else if (item?.kind === "panel" && String(event.active.id).startsWith("handle:float:") && layout.floating[item.panelId]) {
      const position = layout.floating[item.panelId];
      setPreview({ x: Math.max(0, position.x + event.delta.x), y: Math.max(0, position.y + event.delta.y), width: Math.min(position.width, innerWidth - 16), height: Math.min(position.height, innerHeight - 64), label: "Move floating window · release to place", rejected: false });
    } else setPreview(null);
    if (!slot || !item) { setTabDrop(null); return; }
    const panel = layout.panels[item.panelId];
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
      const panel = layout.panels[item.panelId];
      const reason = panel ? dropReason(layout, panel, finalTarget, policy) : "Instance missing";
      const result = panel && !reason ? command({ type: "move", panelId: item.panelId, target: finalTarget }) : null;
      const rejection = reason ?? (result && !result.ok ? result.reason : null);
      announce(rejection ? `Move rejected: ${rejection}` : `${item.title} moved.`);
    } else if (item?.kind === "panel" && String(event.active.id).startsWith("handle:float:") && layout.floating[item.panelId]) {
      const position = layout.floating[item.panelId];
      command({ type: "moveFloat", panelId: item.panelId, x: position.x + event.delta.x, y: position.y + event.delta.y });
      announce(`${item.title} floating window moved.`);
    }
    keyboardCoordinates.reset(); pointer.current = null; setActive(null); setOver(null); setTabDrop(null); setPressing(null); setPreview(null);
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      if (item?.kind === "panel") await revealPresentation(item.panelId);
      const source = event.activatorEvent.target;
      if (source instanceof HTMLElement && source.isConnected && !source.closest("[inert]")) source.focus({ preventScroll: true });
      else if (item?.kind === "panel") Array.from(document.querySelectorAll<HTMLElement>(`[data-instance-handle="${CSS.escape(item.panelId)}"]`)).find((node) => node.getClientRects().length && !node.closest("[inert]"))?.focus({ preventScroll: true });
    }));
  };
  return <DockContext.Provider value={context}>
    <DndContext sensors={sensors} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} accessibility={{ restoreFocus: false, screenReaderInstructions: { draggable: "Press Space or Enter to pick up. Arrow keys choose a target. Enter places; Escape cancels." }, announcements: { onDragStart: () => undefined, onDragMove: () => undefined, onDragOver: () => undefined, onDragEnd: () => undefined, onDragCancel: () => undefined } }} onDragPending={(event) => setPressing(String(event.id))} onDragAbort={() => { setPressing(null); announce("Pickup cancelled."); }} collisionDetection={(args) => {
      // Sortable tabs also register as droppables. Prefer the precise overlay
      // when pointer and overlay overlap, and never collide with the source.
      if (keyboardTarget.current && args.droppableContainers.some((item) => item.id === keyboardTarget.current)) return [{ id: keyboardTarget.current }];
      const hits = pointerWithin(args).filter((hit) => {
        if (hit.id === args.active.id) return false;
        const node = args.droppableContainers.find((item) => item.id === hit.id)?.node.current;
        if (!node || !args.pointerCoordinates) return false;
        const visible = clippedBounds(node);
        return args.pointerCoordinates.x >= visible.left && args.pointerCoordinates.x <= visible.right && args.pointerCoordinates.y >= visible.top && args.pointerCoordinates.y <= visible.bottom;
      });
      const zones = hits.filter((hit) => String(hit.id).startsWith("dock-target:"));
      zones.sort((a, b) => { const ra = args.droppableRects.get(a.id)!, rb = args.droppableRects.get(b.id)!; return ra.width * ra.height - rb.width * rb.height; });
      return zones.length ? zones : hits.length ? hits : args.pointerCoordinates ? [] : rectIntersection(args).filter((hit) => hit.id !== args.active.id);
    }} onDragStart={start} onDragMove={move} onDragOver={(event) => {
      move(event);
      setOver(event.over?.id?.toString() ?? null);
      const target = event.over?.data.current?.target as Target | undefined;
      const item = event.active.data.current?.item as ActiveDrag | undefined;
      if (target && item?.kind === "panel") {
        const reason = dropReason(layout, layout.panels[item.panelId], target, policy);
        const tabId = event.over?.data.current?.tabId as string | undefined;
        const boundary = tabId && layout.panels[tabId] ? ` before ${panelTitle(layout.panels[tabId])}` : target.index !== undefined && target.intent === "tab" ? " at the end" : "";
        announce(reason ? `Rejected: ${reason}` : `Accepted: ${target.intent}${boundary} in ${target.ownerId ? "Layout" : target.surface}`);
      }
    }} onDragCancel={() => { keyboardCoordinates.reset(); pointer.current = null; setActive(null); setOver(null); setTabDrop(null); setPressing(null); setPreview(null); announce("Move cancelled. Original layout retained."); }} onDragEnd={finish}>
      <PresentationHost layout={layout} renderPanel={renderPanel}>{children}</PresentationHost>
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      {active && preview && <div className="station-destination-preview" data-rejected={preview.rejected || undefined} style={{ left: preview.x, top: preview.y, width: preview.width, height: preview.height }}><span>{preview.label}</span></div>}
      <DragOverlay dropAnimation={reduceMotion ? null : { duration: 170, easing: "cubic-bezier(0.16,1,0.3,1)" }}>
        {active && <motion.div className="dock-drag-ghost" initial={reduceMotion ? false : { opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .14, ease: [0.16, 1, 0.3, 1] }}><span className="dock-drag-ghost-icon"><Box size={17} /></span><strong>{active.title}</strong></motion.div>}
      </DragOverlay>
    </DndContext>
  </DockContext.Provider>;
}

/** Dedicated handle: content never owns pickup listeners. */
export function WidgetDragHandle({ panelId, title, context = "front" }: { panelId: string; title: string; context?: string }) {
  const { pressing } = useDockController();
  const id = `handle:${context}:${panelId}`;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id, data: { item: { kind: "panel", panelId, title } satisfies ActiveDrag } });
  return <button type="button" ref={(node) => { setNodeRef(node); setActivatorNodeRef(node); }} {...attributes} {...listeners}
    onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); listeners?.onPointerDown?.(event); }}
    onLostPointerCapture={() => document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }))}
    className="station-drag-handle" data-instance-handle={panelId} data-pressing={pressing === id || undefined} data-dragging={isDragging || undefined}
    aria-label={`Move ${title}`} title={context === "float" ? "Hold to move window; drop over a slot to dock · Space or Enter to pick up" : "Hold to move · Space or Enter to pick up, arrows to choose, Escape to cancel"}><GripVertical size={16} /><span className="station-hold-progress" /></button>;
}

function Zone({ target, className = "", label, showLabel = true }: { target: Target; className?: string; label: string; showLabel?: boolean }) {
  const { active, layout, over, debugDropZones, policy } = useDockController();
  const id = `dock-target:${target.surface}:${target.ownerId ?? "surface"}:${target.nodeId ?? "root"}:${target.intent}:${target.index ?? ""}`;
  const { setNodeRef } = useDroppable({ id, data: { target } });
  const panel = active ? layout.panels[active.panelId] : null;
  const reason = panel ? dropReason(layout, panel, target, policy) : null;
  const visible = Boolean(active || debugDropZones);
  return <div ref={setNodeRef} id={id} className={`dock-drop-zone ${className}`} data-target-owner={target.ownerId} data-target-surface={target.surface} data-target-intent={target.intent} data-visible={visible || undefined} data-eligible={active && !reason || undefined} data-over={over === id || undefined} data-debug={debugDropZones || undefined} aria-label={label}>
    {showLabel && (debugDropZones || over === id && active) && <span className="dock-zone-label">{reason ?? (debugDropZones ? `${target.intent} · ${target.nodeId ?? target.surface}` : label)}</span>}
  </div>;
}
function TargetLayer({ surface, nodeId, ownerId }: { surface: Surface; nodeId?: string; ownerId?: string }) {
  const { layout, active } = useDockController();
  const node = nodeId ? findNode(layout, nodeId) : null;
  const swap = active?.kind === "panel" && node?.kind === "stack" && node.tabs.length === 1 && node.tabs[0] !== active.panelId;
  return <div className="dock-target-layer" aria-hidden="true">
    <Zone target={{ surface, nodeId, ownerId, intent: swap ? "swap" : "tab" }} className="dock-zone-center" label={swap ? "Swap widgets · Alt to join tabs" : "Place in this slot"} />
    {(surface === "main" || surface === "dashboard" || ownerId) && <>
      <Zone target={{ surface, nodeId, ownerId, intent: "left" }} className="dock-zone-left" label="Split left" />
      <Zone target={{ surface, nodeId, ownerId, intent: "right" }} className="dock-zone-right" label="Split right" />
      <Zone target={{ surface, nodeId, ownerId, intent: "top" }} className="dock-zone-top" label="Split above" />
      <Zone target={{ surface, nodeId, ownerId, intent: "bottom" }} className="dock-zone-bottom" label="Split below" />
    </>}
  </div>;
}

function DockTab({ panelId, nodeId, surface, ownerId, index }: { panelId: string; nodeId: string; surface: Surface; ownerId?: string; index: number }) {
  const { layout, command, debugLayout, wiggle, active, over, tabDrop, policy, panelTitle } = useDockController();
  const panel = layout.panels[panelId];
  const title = panelTitle(panel);
  const sortable = useSortable({ id: `panel:${panelId}`, data: { item: { kind: "panel", panelId, title } satisfies ActiveDrag,
    target: { surface, nodeId, ownerId, intent: "tab", index } satisfies Target, tabId: panelId } });
  const dragged = active ? layout.panels[active.panelId] : null;
  const reason = dragged ? dropReason(layout, dragged, { surface, nodeId, intent: "tab", index }, policy) : null;
  return <div ref={sortable.setNodeRef} className="dock-stack-tab" data-active={undefined}
    data-dragging={sortable.isDragging || undefined}
    data-over={over === `panel:${panelId}` || undefined} data-eligible={dragged && !reason || undefined}
    data-drop-before={tabDrop?.id === `panel:${panelId}` && !tabDrop.after || undefined}
    data-drop-after={tabDrop?.id === `panel:${panelId}` && tabDrop.after || undefined}
    data-wiggle={Boolean(wiggle && active && active.kind === "panel" && active.panelId !== panelId && !dropReason(layout, layout.panels[active.panelId], { surface, nodeId, intent: "tab" }, policy)) || undefined}
    onAuxClick={(event) => { if (event.button === 1 && panel.kind !== "home" && panel.kind !== "browser") { event.preventDefault(); command({ type: "close", panelId }); } }}
    >
    <WidgetDragHandle panelId={panelId} title={title} context={`tab:${nodeId}`} />
    <TabsTab value={panelId} icon={panel.kind === "widget" ? <LayoutGrid size={14} /> : <Box size={14} />}>{title}</TabsTab>
    {!["home", "navigation", "browser"].includes(panel.kind) && <button className="dock-tab-close" type="button" title={`Float ${title}`} aria-label={`Float ${title}`} onClick={() => command({ type: "float", panelId })}><ExternalLink size={13} /></button>}
    {panel.kind !== "home" && panel.kind !== "browser" && panel.kind !== "navigation" && <button className="dock-tab-close" type="button" title={`Close ${title}`} aria-label={`Close ${title}`} onClick={() => command({ type: "close", panelId })}><X size={13} /></button>}
    {debugLayout && <small>{panelId}</small>}
  </div>;
}

function TabRail({ node, surface, ownerId }: { node: Stack; surface: Surface; ownerId?: string }) {
  const { layout, command, openCatalog } = useDockController();
  const active = node.tabs.includes(node.active) ? node.active : node.tabs[0];
  return <Tabs value={active} onValueChange={(value) => command({ type: "activate", panelId: String(value) })} variant="underline" size="sm">
    <div className="dock-stack-heading"><SortableContext items={node.tabs.map((id) => `panel:${id}`)} strategy={horizontalListSortingStrategy}>
      <TabsList className="dock-tabs-list" wrapperClassName="dock-tabs-wrapper" onKeyDown={(event) => { if ((event.target as HTMLElement).closest(".station-drag-handle")) event.preventBaseUIHandler(); }}>{node.tabs.map((id, index) => <DockTab key={id} panelId={id} nodeId={node.id} surface={surface} ownerId={ownerId} index={index} />)}</TabsList>
    </SortableContext><Zone target={{ surface, nodeId: node.id, ownerId, intent: "tab", index: node.tabs.length }} className="dock-tab-end" label="Add tab at end" showLabel={false} />
    {ownerId && <button className="dock-action" aria-label="Add child widget" title="Add child to this slot" onClick={() => openCatalog({ surface, ownerId, nodeId: node.id, intent: "tab" })}><Plus size={15} /></button>}
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
export function SlotControls({ nodeId, surface, ownerId }: { nodeId: string; surface: Surface; ownerId?: string }) {
  const { command, openCatalog } = useDockController();
  return <div className="station-slot-controls" role="group" aria-label="Slot actions">
    <button onClick={() => openCatalog({ surface, ownerId, nodeId, intent: "tab" })}><Plus size={14} /> Add widget</button>
    {(surface === "dashboard" || surface === "main" || ownerId) && <><button onClick={() => command({ type: "splitSlot", nodeId, axis: "horizontal" })}>Split columns</button><button onClick={() => command({ type: "splitSlot", nodeId, axis: "vertical" })}>Split rows</button></>}
    <button onClick={() => command({ type: "removeSlot", nodeId })}>Remove empty slot</button>
  </div>;
}
function StackView({ node, surface, ownerId }: { node: Stack; surface: Surface; ownerId?: string }) {
  const { layout, command, renderPanel, debugLayout } = useDockController();
  const active = node.tabs.includes(node.active) ? node.active : node.tabs[0];
  const owner = ownerId ? layout.panels[ownerId] : null;
  const carousel = owner?.kind === "widget" && owner.stackMode === "carousel";
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = track.current;
    if (!carousel || !element) return;
    const align = () => element.scrollTo({ left: node.tabs.indexOf(active) * element.clientWidth, behavior: "instant" });
    const resize = new ResizeObserver(align);
    resize.observe(element); align();
    return () => resize.disconnect();
  }, [active, carousel, node.tabs.join("|")]);
  if (!active) return <section className="station-empty-slot" data-node-id={node.id}><strong>Empty slot</strong><SlotControls nodeId={node.id} surface={surface} ownerId={ownerId} /><TargetLayer surface={surface} nodeId={node.id} ownerId={ownerId} /></section>;
  return <section className={`dock-stack dock-stack-${surface}`} data-node-id={node.id} data-tab-style="connected" tabIndex={-1}>
    {(ownerId || surface !== "dashboard" || node.tabs.length > 1 || layout.panels[active].kind === "unit") && !(surface === "main" && layout.surfaces.main?.kind === "stack" && !ownerId) && <TabRail node={node} surface={surface} ownerId={ownerId} />}
    <div className="dock-stack-body" role="tabpanel" aria-label={active}>
      {carousel ? <div ref={track} className="station-carousel" onScrollEnd={(event) => { const element = event.currentTarget; const index = Math.round(element.scrollLeft / Math.max(1, element.clientWidth)); if (node.tabs[index] && node.tabs[index] !== active) command({ type: "activate", panelId: node.tabs[index] }); }}>{node.tabs.map((id, index) => <div key={id} className="station-carousel-page" inert={id !== active}><PresentationSlot panel={layout.panels[id]} renderPanel={renderPanel} /><span className="station-carousel-hint">Swipe to browse · {index + 1} / {node.tabs.length}</span></div>)}</div>
        : <PresentationSlot panel={layout.panels[active]} renderPanel={renderPanel} />}
      {layout.panels[active].kind !== "home" && <TargetLayer surface={surface} nodeId={node.id} ownerId={ownerId} />}
    </div>
    {debugLayout && <span className="dock-debug-node">{node.id} · stack</span>}
  </section>;
}
function NodeView({ node, surface, ownerId }: { node: Node; surface: Surface; ownerId?: string }) {
  const { command, debugLayout } = useDockController();
  const reducedMotion = useReducedMotion();
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 640px)").matches);
  useEffect(() => { const media = matchMedia("(max-width: 640px)"); const update = () => setNarrow(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  if (node.kind === "stack") return <StackView node={node} surface={surface} ownerId={ownerId} />;
  if (node.kind === "grid") return <div className="dock-grid" data-node-id={node.id} data-empty={node.cells.length === 0 || undefined}>
    {node.cells.map((cell, index) => <motion.div layout={reducedMotion ? false : "position"} transition={{ layout: { duration: .28, ease: [0.2, 0.8, 0.2, 1] } }} className="dock-grid-cell" key={cell.id}><Zone target={{ surface, ownerId, intent: "append", index }} className="dock-grid-insert" label={`Insert widget before row ${index + 1}`} /><NodeView node={cell.node} surface={surface} ownerId={ownerId} /></motion.div>)}
    <button className="station-add-slot" onClick={() => command({ type: "addSlot", surface, ownerId })}><Plus size={16} /> Add empty slot</button>
    <Zone target={{ surface, ownerId, intent: "append", index: node.cells.length }} className="dock-grid-add" label="Create slot here" />
    {node.cells.length === 0 && <div className="dock-grid-empty" aria-hidden="true"><LayoutGrid size={22} /><strong>Fill this page with useful widgets</strong><span>Drag a widget here from the toolbar.</span></div>}
    {debugLayout && <span className="dock-debug-node">{node.id} · grid</span>}
  </div>;
  return <div className="dock-split" data-axis={node.axis} data-node-id={node.id}>
    <PanelGroup key={`${node.id}:${narrow}`} value={[node.ratio * 100, (1 - node.ratio) * 100]} direction={narrow && node.axis === "horizontal" ? "vertical" : node.axis} onLayout={(sizes) => command({ type: "resizeSplit", nodeId: node.id, ratio: sizes[0] / 100 })}>
      <ResizePanel id={`${node.id}:first`} defaultSize={node.ratio * 100} minSize={20}><NodeView node={node.first} surface={surface} ownerId={ownerId} /></ResizePanel>
      <PanelHandle aria-label={`Resize ${node.axis} split`} grip />
      <ResizePanel id={`${node.id}:second`} defaultSize={(1 - node.ratio) * 100} minSize={20}><NodeView node={node.second} surface={surface} ownerId={ownerId} /></ResizePanel>
    </PanelGroup>{debugLayout && <span className="dock-debug-node">{node.id} · {node.axis} · {Math.round(node.ratio * 100)}%</span>}
  </div>;
}
/** Owned subtree rendering uses the same nodes, slots, resize and drag coordinator. */
export function DockOwnedLayout({ ownerId }: { ownerId: string }) {
  const { layout, command } = useDockController();
  const node = layout.containers[ownerId];
  const surface = hostSurface(layout, ownerId) ?? "dashboard";
  return <div className="station-owned-layout">{node && <NodeView node={node} surface={surface} ownerId={ownerId} />}<button className="station-add-slot" onClick={() => command({ type: "addSlot", surface, ownerId })}>Add slot to Layout</button></div>;
}
/** Renders any surface from the same node tree. Empty docks expose one drop target during a drag. */
export function DockSurface({ surface, className = "" }: { surface: Surface; className?: string }) {
  const { layout, active, debugLayout, command, renderPanel, panelTitle } = useDockController();
  const root = layout.surfaces[surface];
  const max = layout.maximized;
  const hidden = Boolean(layout.hidden[surface] || max && surface !== "main");
  if (surface === "main" && max && layout.panels[max]) {
    const panel = layout.panels[max];
    const title = panelTitle(panel);
    return <div className="dock-maximized" role="region" aria-label={`${title} maximized`}>
      <div className="dock-maximized-bar"><strong>{title}</strong><span className="spacer" /><button className="dock-action" aria-label="Restore panel" title="Restore panel" onClick={() => command({ type: "maximize", panelId: null })}><Minimize2 size={16} /></button></div>
      <div className="dock-maximized-body"><PresentationSlot panel={panel} renderPanel={renderPanel} /></div>
    </div>;
  }
  return <div className={`dock-surface dock-surface-${surface} ${className}`} data-debug={debugLayout || undefined} data-maximized={max && surface === "main" || undefined} hidden={hidden}>
    {root ? <NodeView node={root} surface={surface} /> : <div className="dock-empty-surface">{active ? <span>Drop here</span> : surface === "dashboard" ? "Add a widget from the toolbar" : null}<Zone target={{ surface, intent: "append" }} className="dock-empty-target" label={`Dock in ${surface}`} /></div>}
  </div>;
}

/** On narrow viewports the sidebar and bottom docks share one visible tab rail. */
export function DockMobileSurface() {
  const { layout, command, renderPanel, panelTitle, active: dragging } = useDockController();
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
      const title = panelTitle(panel);
      return <MobileDockTab key={panelId} panelId={panelId} title={title} selected={current === panelId} target={{ surface, nodeId, intent: "tab", index }} onSelect={() => { setSelected(panelId); command({ type: "activate", panelId }); }} />;
    })}{tabs.length > 0 && <Zone target={{ surface: tabs[tabs.length - 1].surface, nodeId: tabs[tabs.length - 1].nodeId, intent: "tab", index: tabs[tabs.length - 1].index + 1 }} className="dock-tab-end dock-mobile-end" label="Add tab at end" showLabel={false} />}</div>
    <div className="dock-mobile-body" role="tabpanel" aria-label={current}><PresentationSlot panel={layout.panels[current]} renderPanel={renderPanel} />
      {dragging && <Zone target={{ surface: panelSurface(layout, current) ?? "bottom", intent: "append" }} className="dock-mobile-drop" label="Dock with this panel" />}
    </div>
  </div>;
}

function MobileDockTab({ panelId, title, selected, target, onSelect }: { panelId: string; title: string; selected: boolean; target: Target; onSelect: () => void }) {
  const { tabDrop } = useDockController();
  const id = `mobile-tab:${panelId}`;
  const { setNodeRef: setDropRef } = useDroppable({ id, data: { target, tabId: panelId } });
  return <div ref={setDropRef} className="dock-mobile-tab"
    data-drop-before={tabDrop?.id === id && !tabDrop.after || undefined} data-drop-after={tabDrop?.id === id && tabDrop.after || undefined}>
    <WidgetDragHandle panelId={panelId} title={title} context="mobile" /><button type="button" role="tab" aria-selected={selected} onClick={onSelect}>{title}</button></div>;
}

/** A quiet edge target keeps an empty or collapsed bottom dock reachable by drag. */
export function DockBottomEdge() {
  const { active, layout } = useDockController();
  if (surfacePanels(layout, "bottom").length) return null;
  return <div className="dock-bottom-edge" data-active={active ? "" : undefined} aria-hidden={!active}><span>Dock at bottom</span><Zone target={{ surface: "bottom", intent: "append" }} label="Dock at bottom" /></div>;
}

/** Floating widget instances keep their panel ID and remain outside dock drop targets. */
export function DockFloatingPanels() {
  const { layout, command, renderPanel, panelTitle } = useDockController();
  return <div className="dock-floating-layer">{Object.entries(layout.floating).map(([id, position]) => {
    const panel = layout.panels[id];
    if (!panel) return null;
    const title = panelTitle(panel);
    const width = Math.min(position.width, innerWidth - 16);
    const height = Math.min(position.height, innerHeight - 64);
    const x = Math.min(position.x, Math.max(8, innerWidth - width - 8));
    const y = Math.min(position.y, Math.max(8, innerHeight - height - 8));
    return <section key={id} className="dock-float" style={{ left: x, top: y, width, height }} aria-label={`${title} floating panel`}>
      <div className="dock-float-header"><WidgetDragHandle panelId={id} title={title} context="float" /><strong>{title}</strong><span className="spacer" /><button type="button" onClick={() => command({ type: "dockFloat", panelId: id })}>Return to dock</button></div>
      <div className="dock-float-body"><PresentationSlot panel={panel} renderPanel={renderPanel} /></div>
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

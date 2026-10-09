import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { descendants, type DockLayout, type Panel } from "./core";
import { clippedBounds } from "./geometry";
import { ScrollArea } from "../components/ui/scroll-area";
import { useDndMonitor } from "@dnd-kit/core";

type Bounds = { x: number; y: number; width: number; height: number; visible: boolean; interactive: boolean; clip: string; placement: string };
type Anchors = Map<string, HTMLElement>;
const PresentationContext = createContext<{ attach: (id: string, node: HTMLElement | null, previous: HTMLElement | null) => void } | null>(null);

/** Reveal outer backing slots before focusing content in the persistent layer. */
export async function revealPresentation(id: string) {
  const chain: HTMLElement[] = [];
  let anchor = document.querySelector<HTMLElement>(`[data-instance-slot="${CSS.escape(id)}"]`);
  while (anchor && !chain.includes(anchor)) {
    chain.unshift(anchor);
    const owner = anchor.closest<HTMLElement>("[data-presentation-owner]")?.dataset.presentationOwner;
    anchor = owner ? document.querySelector<HTMLElement>(`[data-instance-slot="${CSS.escape(owner)}"]`) : null;
  }
  for (const node of chain) {
    node.scrollIntoView({ block: "nearest", inline: "nearest" });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
}

/** Geometry anchor only. Content stays mounted in the host's persistent layer. */
export function PresentationSlot({ panel, renderPanel }: { panel: Panel; renderPanel: (panel: Panel) => ReactNode }) {
  const registry = useContext(PresentationContext);
  const attached = useRef<HTMLElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => { registry?.attach(panel.id, node, attached.current); attached.current = node; }, [registry, panel.id]);
  return panel.kind === "home" ? <>{renderPanel(panel)}</> : <div ref={ref} className="station-presentation-slot" data-instance-slot={panel.id} />;
}

/**
 * Instance DOM is keyed once under this layer. Slot transfer changes measured
 * bounds, never its React parent, iframe, editor or service lifetime. Inactive
 * instances stay mounted, hidden and inert; deletion unmounts the instance.
 */
export function PresentationHost({ layout, renderPanel, children }: { layout: DockLayout; renderPanel: (panel: Panel) => ReactNode; children: ReactNode }) {
  const anchors = useRef<Anchors>(new Map());
  // Desktop and mobile may both retain backing slots for a singleton. Track each
  // registration so unmounting one cannot remove the other panel's live anchor.
  const registeredSlots = useRef(new Map<string, Set<HTMLElement>>());
  const bounds = useRef<Record<string, Bounds>>({});
  const frames = useRef(new Map<string, HTMLDivElement>());
  const layer = useRef<HTMLDivElement>(null);
  const scheduleRef = useRef<() => void>(() => {});
  const observerRef = useRef<ResizeObserver | null>(null);
  // Pickup translates the mounted DOM, never a second iframe/editor/service.
  // Geometry writes pause for this subtree until the gesture commits or cancels.
  const pickup = useRef(new Map<string, { style: string; anchor?: HTMLElement }>());
  const restorePickup = () => {
    for (const [id, saved] of pickup.current) {
      const element = frames.current.get(id);
      if (element) { element.style.cssText = saved.style; delete element.dataset.pickup; }
      if (saved.anchor) delete saved.anchor.dataset.pickupPlaceholder;
    }
    pickup.current.clear();
    scheduleRef.current();
  };
  useDndMonitor({
    onDragStart: ({ active }) => {
      const item = active.data.current?.item;
      const root = item && frames.current.get(item.panelId);
      if (item?.dragMode !== "physical" || !root || getComputedStyle(root).visibility !== "visible") return;
      for (const id of [item.panelId, ...descendants(layout, item.panelId)]) {
        const element = frames.current.get(id);
        if (!element) continue;
        const anchor = id === item.panelId ? anchors.current.get(id) : undefined;
        pickup.current.set(id, { style: element.style.cssText, anchor });
        element.dataset.pickup = id === item.panelId ? "root" : "child";
        element.style.zIndex = String(160 + Object.keys(layout.containers).filter((owner) => descendants(layout, owner).includes(id)).length);
        element.style.pointerEvents = "none";
        if (id === item.panelId) element.style.clipPath = "none";
        if (anchor) anchor.dataset.pickupPlaceholder = "true";
      }
    },
    onDragMove: ({ delta }) => {
      for (const id of pickup.current.keys()) {
        const element = frames.current.get(id);
        if (element) element.style.transform = `translate3d(${delta.x}px, ${delta.y}px, 0)`;
      }
    },
    onDragEnd: restorePickup,
    onDragCancel: restorePickup,
  });
  useLayoutEffect(() => () => restorePickup(), []);
  const [registry] = useState(() => ({ attach: (id: string, node: HTMLElement | null, previous: HTMLElement | null) => {
    const slots = registeredSlots.current.get(id) ?? new Set<HTMLElement>();
    if (previous) { slots.delete(previous); observerRef.current?.unobserve(previous); }
    if (node) { slots.add(node); observerRef.current?.observe(node); }
    if (slots.size) registeredSlots.current.set(id, slots);
    else { registeredSlots.current.delete(id); anchors.current.delete(id); }
    scheduleRef.current();
  } }));
  useLayoutEffect(() => { scheduleRef.current(); }, [layout]);
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      for (const [id, slots] of registeredSlots.current) {
        const available = [...slots].filter((node) => node.isConnected);
        const anchor = available.find((node) => node.getClientRects().length > 0) ?? available[0];
        if (anchor) anchors.current.set(id, anchor); else anchors.current.delete(id);
      }
      const next: Record<string, Bounds> = {};
      const rects = new Map<HTMLElement, DOMRect>();
      const styles = new Map<HTMLElement, CSSStyleDeclaration>();
      const actualRect = (element: HTMLElement) => {
        if (!rects.has(element)) rects.set(element, element.getBoundingClientRect());
        return rects.get(element)!;
      };
      const style = (element: HTMLElement) => {
        if (!styles.has(element)) styles.set(element, getComputedStyle(element));
        return styles.get(element)!;
      };
      const rect = (element: HTMLElement): DOMRect => {
        const actual = actualRect(element);
        const owner = element.closest<HTMLElement>('[data-presentation-owner]');
        const ownerId = owner?.dataset.presentationOwner;
        const box = ownerId && anchors.current.has(ownerId) ? measureOne(ownerId) : null;
        if (!box || !owner) return actual;
        if (element === owner) return new DOMRect(box.x, box.y, box.width, box.height);
        const previous = actualRect(owner);
        return new DOMRect(actual.x + box.x - previous.x, actual.y + box.y - previous.y, actual.width, actual.height);
      };
      const clipPath = (element: HTMLElement) => {
        const id = element.dataset.presentationOwner;
        return id && anchors.current.has(id) ? `inset(${measureOne(id).clip})` : style(element).clipPath;
      };
      const measureOne = (id: string): Bounds => {
        if (next[id]) return next[id];
        const node = anchors.current.get(id)!;
        const boundsRect = rect(node);
        const parent = node.closest<HTMLElement>("[data-presentation-owner]");
        const ownerId = parent?.dataset.presentationOwner;
        const parentHidden = !!ownerId && (!anchors.current.has(ownerId) || !measureOne(ownerId).visible) || !!node.closest(".widget-face[aria-hidden=true], [hidden]");
        // Clip to native scrolling ancestors; the content layer never escapes a dock.
        const { left, top, right, bottom } = clippedBounds(node, { rect, style, clipPath });
        return next[id] = { x: Math.round(boundsRect.left * 10) / 10, y: Math.round(boundsRect.top * 10) / 10, width: Math.round(boundsRect.width * 10) / 10, height: Math.round(boundsRect.height * 10) / 10,
          visible: !!node.getClientRects().length && right > left && bottom > top && !parentHidden,
          interactive: (!ownerId || anchors.current.has(ownerId) && measureOne(ownerId).interactive) && !node.closest("[inert]:not(.station-presentation)"), placement: node.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId ?? "floating",
          clip: `${Math.max(0, top - boundsRect.top)}px ${Math.max(0, boundsRect.right - right)}px ${Math.max(0, boundsRect.bottom - bottom)}px ${Math.max(0, left - boundsRect.left)}px` };
      };
      for (const id of anchors.current.keys()) measureOne(id);
      // Read every anchor before writing frames. Scrolling must not rerender the
      // workspace or animate fixed geometry behind its native scroll position.
      let resizedOwner = false;
      for (const [id, box] of Object.entries(next)) {
        if (pickup.current.has(id)) continue;
        const element = frames.current.get(id);
        if (!element || JSON.stringify(bounds.current[id]) === JSON.stringify(box)) continue;
        Object.assign(element.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px`, visibility: box.visible ? "visible" : "hidden", clipPath: `inset(${box.clip})` });
        element.inert = !box.visible || !box.interactive;
        element.setAttribute("aria-hidden", String(element.inert));
        const previous = bounds.current[id];
        if (element.querySelector('[data-instance-slot]') && (previous?.width !== box.width || previous?.height !== box.height)) resizedOwner = true;
      }
      for (const [id, element] of frames.current) if (!next[id]) {
        if (pickup.current.has(id)) continue;
        element.style.visibility = "hidden";
        element.inert = true;
        element.setAttribute("aria-hidden", "true");
      }
      bounds.current = next;
      // Resize can reflow nested anchors; scrolling already predicts owner translation.
      if (resizedOwner) schedule();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    scheduleRef.current = schedule;
    const resize = new ResizeObserver(schedule); observerRef.current = resize;
    for (const slots of registeredSlots.current.values()) for (const node of slots) resize.observe(node);
    const mutation = new MutationObserver((records) => {
      if (records.some(({ target, type, attributeName }) => {
        if (!(target instanceof HTMLElement)) return false;
        if (target.classList.contains("station-presentation")) return false;
        if (type === "childList") return !target.closest(".station-presentation");
        if (attributeName !== "style" && attributeName !== "class") return true;
        return target.matches('[data-panel], [data-node-id], .dock-surface, .widget-face, .dock-workspace');
      })) schedule();
    });
    const root = document.getElementById("app");
    if (root) mutation.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "hidden", "inert", "aria-hidden"] });
    window.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule);
    schedule();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); scheduleRef.current = () => {}; };
  }, []);
  useLayoutEffect(() => {
    const root = layer.current;
    if (!root) return;
    const wheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || !(event.target instanceof Element)) return;
      const owner = event.target.closest<HTMLElement>('[data-presentation-owner]');
      if (!owner) return;
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const hasScroll = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        return /(auto|scroll)/.test(horizontal ? style.overflowX : style.overflowY) && (horizontal ? element.scrollWidth - element.clientWidth : element.scrollHeight - element.clientHeight) > 1;
      };
      // Content with its own scroll area owns the gesture, including its edges.
      for (let element = event.target as HTMLElement; element && element !== owner.parentElement; element = element.parentElement!) if (hasScroll(element)) return;
      const anchor = anchors.current.get(owner.dataset.presentationOwner!);
      for (let element = anchor?.parentElement; element; element = element.parentElement) {
        if (!hasScroll(element)) continue;
        const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
        event.preventDefault();
        element.scrollBy({ left: horizontal ? event.deltaX * scale : 0, top: horizontal ? 0 : event.deltaY * scale, behavior: "instant" });
        break;
      }
    };
    root.addEventListener("wheel", wheel, { passive: false });
    return () => root.removeEventListener("wheel", wheel);
  }, []);
  return <PresentationContext.Provider value={registry}>{children}
    <div ref={layer} className="app station-presentations">{Object.values(layout.panels).filter((panel) => panel.kind !== "home").map((panel) => {
      const depth = Object.keys(layout.containers).filter((id) => descendants(layout, id).includes(panel.id)).length;
      const floated = !!layout.floating[panel.id] || Object.keys(layout.floating).some((id) => descendants(layout, id).includes(panel.id));
      return <div key={panel.id} ref={(element) => { if (element) frames.current.set(panel.id, element); else frames.current.delete(panel.id); }} data-presentation-owner={panel.id} className="station-presentation"
        onFocusCapture={(event) => {
          const target = event.target as HTMLElement, anchor = anchors.current.get(panel.id);
          const box = bounds.current[panel.id];
          if (!anchor || !box) return;
          const rect = target.getBoundingClientRect(), inset = box.clip.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
          if (rect.top < box.y + inset[0] || rect.bottom > box.y + box.height - inset[2]) void revealPresentation(panel.id);
        }}
        style={{ zIndex: (floated ? 60 : layout.maximized === panel.id ? 100 : 2) + depth }}>{panel.kind === "asset" ? <ScrollArea className="station-editor-scroll" contentClassName="station-editor-content" fade={false} aria-label="Asset editor">{renderPanel(panel)}</ScrollArea> : renderPanel(panel)}</div>;
    })}</div>
  </PresentationContext.Provider>;
}

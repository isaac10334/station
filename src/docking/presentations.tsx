import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { descendants, type DockLayout, type Panel } from "./core";

type Bounds = { x: number; y: number; width: number; height: number; visible: boolean; interactive: boolean; clip: string; placement: string };
type Anchors = Map<string, HTMLElement>;
const PresentationContext = createContext<{ attach: (id: string, node: HTMLElement | null) => void } | null>(null);

/** Geometry anchor only. Content stays mounted in the host's persistent layer. */
export function PresentationSlot({ panel, renderPanel }: { panel: Panel; renderPanel: (panel: Panel) => ReactNode }) {
  const registry = useContext(PresentationContext);
  const ref = useCallback((node: HTMLDivElement | null) => registry?.attach(panel.id, node), [registry, panel.id]);
  return panel.kind === "home" ? <>{renderPanel(panel)}</> : <div ref={ref} className="station-presentation-slot" data-instance-slot={panel.id} />;
}

/**
 * Instance DOM is keyed once under this layer. Slot transfer changes measured
 * bounds, never its React parent, iframe, editor or service lifetime. Inactive
 * instances stay mounted, hidden and inert; deletion unmounts the instance.
 */
export function PresentationHost({ layout, renderPanel, children }: { layout: DockLayout; renderPanel: (panel: Panel) => ReactNode; children: ReactNode }) {
  const anchors = useRef<Anchors>(new Map());
  const [bounds, setBounds] = useState<Record<string, Bounds>>({});
  const scheduleRef = useRef<() => void>(() => {});
  const observerRef = useRef<ResizeObserver | null>(null);
  const [registry] = useState(() => ({ attach: (id: string, node: HTMLElement | null) => {
    const previous = anchors.current.get(id); if (previous) observerRef.current?.unobserve(previous);
    if (node) { anchors.current.set(id, node); observerRef.current?.observe(node); } else anchors.current.delete(id);
    scheduleRef.current();
  } }));
  const reduced = useReducedMotion();
  const last = useRef("");
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next: Record<string, Bounds> = {};
      for (const [id, node] of anchors.current) {
        const rect = node.getBoundingClientRect();
        const parent = node.closest<HTMLElement>("[data-presentation-owner]");
        const parentHidden = !!parent && parent.style.visibility === "hidden" || !!node.closest(".widget-face[aria-hidden=true], [hidden]");
        // Clip to native scrolling ancestors; the content layer never escapes a dock.
        let left = rect.left, top = rect.top, right = rect.right, bottom = rect.bottom;
        for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (style.display === "contents") continue;
          if (/(auto|scroll|hidden|clip)/.test(style.overflow + style.overflowX + style.overflowY)) {
            const clip = ancestor.getBoundingClientRect(); left = Math.max(left, clip.left); top = Math.max(top, clip.top); right = Math.min(right, clip.right); bottom = Math.min(bottom, clip.bottom);
          }
          if (ancestor.dataset.presentationOwner && style.clipPath.startsWith("inset(")) {
            const inset = ancestor.style.clipPath.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
            const clip = ancestor.getBoundingClientRect(); left = Math.max(left, clip.left + (inset[3] ?? inset[1] ?? inset[0])); top = Math.max(top, clip.top + inset[0]); right = Math.min(right, clip.right - (inset[1] ?? inset[0])); bottom = Math.min(bottom, clip.bottom - (inset[2] ?? inset[0]));
          }
        }
        next[id] = { x: Math.round(rect.left * 10) / 10, y: Math.round(rect.top * 10) / 10, width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10,
          visible: !!node.getClientRects().length && right > left && bottom > top && !parentHidden,
          interactive: !node.closest("[inert]"), placement: node.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId ?? "floating",
          clip: `${Math.max(0, top - rect.top)}px ${Math.max(0, rect.right - right)}px ${Math.max(0, rect.bottom - bottom)}px ${Math.max(0, left - rect.left)}px` };
      }
      const serialized = JSON.stringify(next);
      if (serialized !== last.current) { last.current = serialized; setBounds(next); }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    scheduleRef.current = schedule;
    const resize = new ResizeObserver(schedule); observerRef.current = resize;
    for (const node of anchors.current.values()) resize.observe(node);
    const mutation = new MutationObserver(schedule);
    const root = document.getElementById("app");
    if (root) mutation.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "hidden", "inert", "aria-hidden"] });
    window.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule);
    schedule();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); scheduleRef.current = () => {}; };
  }, []);
  return <PresentationContext.Provider value={registry}>{children}
    <div className="app station-presentations">{Object.values(layout.panels).filter((panel) => panel.kind !== "home").map((panel) => {
      const box = bounds[panel.id];
      const visible = !!box?.visible;
      const clip = box?.clip ?? "0px";
      const depth = Object.keys(layout.containers).filter((id) => descendants(layout, id).includes(panel.id)).length;
      const floated = !!layout.floating[panel.id] || Object.keys(layout.floating).some((id) => descendants(layout, id).includes(panel.id));
      return <motion.div key={panel.id} data-presentation-owner={panel.id} className="station-presentation" aria-hidden={!visible || !box?.interactive} inert={!visible || !box?.interactive}
        onFocusCapture={(event) => {
          const target = event.target as HTMLElement, anchor = anchors.current.get(panel.id);
          if (!anchor || !box) return;
          const rect = target.getBoundingClientRect(), inset = box.clip.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
          if (rect.top < box.y + inset[0] || rect.bottom > box.y + box.height - inset[2]) anchor.scrollIntoView({ block: "nearest", inline: "nearest" });
        }}
        onWheel={(event) => {
          if (event.defaultPrevented || event.ctrlKey) return;
          const canScroll = (element: HTMLElement) => { const style = getComputedStyle(element); return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1 && (event.deltaY < 0 ? element.scrollTop > 0 : element.scrollTop < element.scrollHeight - element.clientHeight - 1); };
          for (let element = event.target as HTMLElement; element && element !== event.currentTarget.parentElement; element = element.parentElement!) if (canScroll(element)) return;
          const anchor = anchors.current.get(panel.id);
          for (let element = anchor?.parentElement; element; element = element.parentElement) if (canScroll(element)) { element.scrollTop += event.deltaY; break; }
        }}
        style={{ position: "fixed", zIndex: (floated ? 16 : layout.maximized === panel.id ? 26 : 2) + depth * .05, visibility: visible ? "visible" : "hidden", clipPath: `inset(${clip})`, left: box?.x ?? 0, top: box?.y ?? 0, width: box?.width ?? 1, height: box?.height ?? 1 }}
        layout={reduced ? false : "position"} layoutDependency={`${box?.placement}:${box?.width}:${box?.height}`} transition={{ layout: { duration: .22, ease: [0.2, 0.8, 0.2, 1] } }}>{renderPanel(panel)}</motion.div>;
    })}</div>
  </PresentationContext.Provider>;
}

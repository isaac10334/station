import { useRef, useState } from "react";
import { svgIconUrl } from "../../../services/svg-icons";
import { Button } from "../ui/button";

type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
const number = (element: Element, key: string, fallback = 0) => Number.isFinite(Number(element.getAttribute(key))) ? Number(element.getAttribute(key) ?? fallback) : fallback;
/** Bounds for editable primitives; complex groups/paths use their viewBox as a
 * conservative transform frame and retain their exact authored path source. */
function bounds(element: Element | undefined, view: Box): Box {
  if (!element) return view;
  if (element.localName === "rect") return { x: number(element, "x"), y: number(element, "y"), width: number(element, "width"), height: number(element, "height") };
  if (["circle", "ellipse"].includes(element.localName)) { const rx = number(element, element.localName === "circle" ? "r" : "rx"), ry = number(element, element.localName === "circle" ? "r" : "ry"); return { x: number(element, "cx") - rx, y: number(element, "cy") - ry, width: rx * 2, height: ry * 2 }; }
  if (element.localName === "line") { const x = number(element, "x1"), y = number(element, "y1"), x2 = number(element, "x2"), y2 = number(element, "y2"); return { x: Math.min(x, x2), y: Math.min(y, y2), width: Math.max(Math.abs(x2 - x), 0.1), height: Math.max(Math.abs(y2 - y), 0.1) }; }
  return view;
}
const parse = (source: string) => new DOMParser().parseFromString(source, "image/svg+xml");
const serialize = (doc: Document) => new XMLSerializer().serializeToString(doc.documentElement);
const fmt = (n: number) => String(Math.round(n * 100) / 100);
type Tool = "select" | "rect" | "circle" | "line";
type Gesture = { source: string; start: Point; index: number; mode: "move" | "resize" | "draw"; box: Box; transform: string; next: string };

/** Direct manipulation over a validated image resource. Only Station-authored
 * hit rectangles/handles enter the host DOM. One gesture commits one source edit;
 * cancellation and concurrent edits preserve the stored source. */
export function SvgCanvas({ source, selected, onSelect, editable, onCommit }: { source: string; selected: number; onSelect: (index: number) => void; editable: boolean; onCommit: (source: string, expected: string) => void }) {
  const [tool, setTool] = useState<Tool>("select"), [draft, setDraft] = useState<string | null>(null), [error, setError] = useState("");
  const gesture = useRef<Gesture | null>(null);
  const shown = draft ?? source;
  let url = "", view: Box = { x: 0, y: 0, width: 24, height: 24 }, elements: Element[] = [];
  try { url = svgIconUrl(shown); const doc = parse(shown); const v = doc.documentElement.getAttribute("viewBox")?.trim().split(/[ ,]+/).map(Number); if (v?.length === 4 && v.every(Number.isFinite) && v[2] > 0 && v[3] > 0) view = { x: v[0], y: v[1], width: v[2], height: v[3] }; elements = Array.from(doc.documentElement.children); } catch {}
  const box = bounds(elements[selected], view), handle = Math.max(view.width, view.height) / 70;
  const point = (event: React.PointerEvent<SVGSVGElement>): Point => { const matrix = event.currentTarget.getScreenCTM(); return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : { x: 0, y: 0 }; };
  const commit = (next: string, expected: string) => { try { svgIconUrl(next); onCommit(next, expected); setError(""); } catch (e) { setError(String(e)); } };
  return <div className="flex min-h-72 min-w-64 flex-1 flex-col gap-2">
    <div className="flex flex-wrap gap-1" aria-label="SVG drawing tools">{(["select", "rect", "circle", "line"] as Tool[]).map(value => <Button key={value} size="sm" variant={tool === value ? "secondary" : "ghost"} disabled={!editable} aria-pressed={tool === value} draggable={value !== "select"} onDragStart={e => e.dataTransfer.setData("application/x-station-svg-shape", value)} onClick={() => setTool(value)}>{value === "select" ? "Select / move" : `Draw ${value}`}</Button>)}</div>
    <svg tabIndex={0} role="application" aria-label="SVG drawing canvas" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} className="min-h-64 w-full flex-1 touch-none rounded-lg border border-line outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring" style={{ backgroundColor: "#fff", color: "#111", cursor: tool === "select" ? "default" : "crosshair" }}
      onDragOver={e => { if (editable) e.preventDefault(); }} onDrop={async e => {
        e.preventDefault(); e.stopPropagation(); if (!editable) return;
        const shape = e.dataTransfer.getData("application/x-station-svg-shape");
        if (["rect", "circle", "line"].includes(shape)) { setTool(shape as Tool); return; }
        const file = e.dataTransfer.files[0]; if (!file) return;
        if (file.size > 32768 || !file.name.toLowerCase().endsWith(".svg")) { setError("Drop a static SVG file up to 32 KB"); return; }
        const baseline = source, text = await file.text(); commit(text, baseline); onSelect(0);
      }}
      onPointerDown={e => {
        if (!editable || !url || e.button !== 0) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.focus();
        const start = point(e), hit = (e.target as Element).getAttribute("data-shape"), resize = (e.target as Element).getAttribute("data-resize") === "true";
        const index = hit === null ? selected : Number(hit), doc = parse(source), children = Array.from(doc.documentElement.children);
        let next = source, selectedIndex = index;
        if (tool !== "select") { const node = doc.createElementNS("http://www.w3.org/2000/svg", tool); node.setAttribute("fill", tool === "line" ? "none" : "currentColor"); if (tool === "line") { node.setAttribute("stroke", "currentColor"); node.setAttribute("stroke-width", fmt(view.width / 50)); } doc.documentElement.appendChild(node); selectedIndex = children.length; next = serialize(doc); }
        else if (hit === null && !resize) return;
        onSelect(selectedIndex); gesture.current = { source, start, index: selectedIndex, mode: tool === "select" ? resize ? "resize" : "move" : "draw", box: bounds(children[index], view), transform: children[index]?.getAttribute("transform") ?? "", next };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        const g = gesture.current; if (!g) return; const p = point(e), dx = p.x - g.start.x, dy = p.y - g.start.y;
        const doc = parse(g.mode === "draw" ? g.next : g.source), node = doc.documentElement.children[g.index]; if (!node) return;
        if (g.mode === "move") node.setAttribute("transform", `translate(${fmt(dx)} ${fmt(dy)}) ${g.transform}`.trim());
        else if (g.mode === "resize") { const sx = Math.max(0.02, (g.box.width + dx) / Math.max(g.box.width, 0.1)), sy = e.shiftKey ? sx : Math.max(0.02, (g.box.height + dy) / Math.max(g.box.height, 0.1)); node.setAttribute("transform", `translate(${fmt(g.box.x)} ${fmt(g.box.y)}) scale(${fmt(sx)} ${fmt(sy)}) translate(${fmt(-g.box.x)} ${fmt(-g.box.y)}) ${g.transform}`.trim()); }
        else {
          const attrs = node.localName === "circle" ? { cx: fmt(g.start.x), cy: fmt(g.start.y), r: fmt(Math.max(0.1, Math.hypot(dx, dy))) } : node.localName === "line" ? { x1: fmt(g.start.x), y1: fmt(g.start.y), x2: fmt(p.x), y2: fmt(p.y) } : { x: fmt(Math.min(g.start.x, p.x)), y: fmt(Math.min(g.start.y, p.y)), width: fmt(Math.max(0.1, Math.abs(dx))), height: fmt(Math.max(0.1, Math.abs(dy))) };
          for (const [key, value] of Object.entries(attrs)) if (value !== undefined) node.setAttribute(key, value);
        }
        g.next = serialize(doc); setDraft(g.next);
      }}
      onPointerUp={e => { const g = gesture.current; if (!g) return; gesture.current = null; setDraft(null); if (g.next !== g.source) commit(g.next, g.source); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { gesture.current = null; setDraft(null); }}
      onKeyDown={e => {
        if (e.key === "Escape") { gesture.current = null; setDraft(null); setTool("select"); e.preventDefault(); e.stopPropagation(); }
        if (!editable || !elements[selected] || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Delete", "Backspace"].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation(); const doc = parse(source), node = doc.documentElement.children[selected];
        if (["Delete", "Backspace"].includes(e.key)) node.remove();
        else { const step = e.shiftKey ? 10 : 1; node.setAttribute("transform", `translate(${e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0} ${e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0}) ${node.getAttribute("transform") ?? ""}`); }
        commit(serialize(doc), source);
      }}>
      {url && <image href={url} x={view.x} y={view.y} width={view.width} height={view.height} pointerEvents="none" />}
      {elements.map((element, index) => { if (["defs", "title", "desc"].includes(element.localName)) return null; const b = bounds(element, view); return <rect key={index} data-shape={index} x={b.x} y={b.y} width={Math.max(b.width, handle)} height={Math.max(b.height, handle)} transform={element.getAttribute("transform") ?? undefined} fill="transparent" stroke="none" style={{ cursor: "move" }} />; })}
      {elements[selected] && <g transform={elements[selected].getAttribute("transform") ?? undefined}><rect x={box.x} y={box.y} width={Math.max(box.width, handle)} height={Math.max(box.height, handle)} fill="none" stroke="var(--color-focus-ring, currentColor)" strokeWidth={handle / 4} pointerEvents="none" /><rect data-resize="true" x={box.x + box.width - handle / 2} y={box.y + box.height - handle / 2} width={handle} height={handle} fill="currentColor" style={{ cursor: "nwse-resize" }} /></g>}
    </svg>
    <p className="text-xs text-fg-3">Drag shapes to move; drag the corner to scale. Draw on the canvas, nudge with arrows (Shift ×10), Delete to remove, Escape to cancel. Drop a static SVG file to import.</p>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}

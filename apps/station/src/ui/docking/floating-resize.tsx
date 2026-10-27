import { useEffect, useRef, useState } from "react";
import { useDockController } from "./react";
import { floatingBounds } from "./floating";

/** Preview on the existing geometry owner; commit once, cancel without touching history. */
export function FloatingResize({ panelId, title, active }: { panelId: string; title: string; active: boolean }) {
  const { layout, command, raiseFloating } = useDockController();
  const position = layout.floating[panelId];
  const [preview, setPreview] = useState<{ width: number; height: number } | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; width: number; height: number; element: HTMLElement; style: string } | null>(null);
  const pending = useRef(preview);
  const cancel = () => { if (drag.current) drag.current.element.style.cssText = drag.current.style; drag.current = null; pending.current = null; setPreview(null); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener("keydown", escape, true);
    return () => { window.removeEventListener("keydown", escape, true); if (drag.current) drag.current.element.style.cssText = drag.current.style; };
  }, []);
  if (!position) return null;
  const box = floatingBounds({ ...position, ...preview });
  return <button type="button" className="floating-resize-handle" aria-label={`Resize ${title}`} title="Drag to resize; arrow keys resize; Escape cancels" style={{ left: box.x + box.width - 20, top: box.y + box.height - 20, zIndex: active ? 120 : 70 }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      const element = document.querySelector<HTMLElement>(`[data-floating-panel="${CSS.escape(panelId)}"]`);
      if (!element) return;
      event.preventDefault(); event.stopPropagation(); raiseFloating(panelId);
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: box.width, height: box.height, element, style: element.style.cssText };
    }}
    onPointerMove={event => {
      const start = drag.current; if (!start || start.pointerId !== event.pointerId) return;
      const next = { width: Math.max(Math.min(220, innerWidth - box.x - 8), Math.min(innerWidth - box.x - 8, start.width + event.clientX - start.x)), height: Math.max(Math.min(160, innerHeight - box.y - 8), Math.min(innerHeight - box.y - 8, start.height + event.clientY - start.y)) };
      start.element.style.width = `${next.width}px`; start.element.style.height = `${next.height}px`;
      pending.current = next; setPreview(next);
    }}
    onPointerUp={event => { if (drag.current?.pointerId !== event.pointerId) return; const next = pending.current; cancel(); if (next) command({ type: "resizeFloat", panelId, ...next }); }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 50 : 10; command({ type: "resizeFloat", panelId, width: box.width + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), height: box.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) }); }}
  >◢</button>;
}

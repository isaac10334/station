import { useEffect, useRef, useState } from "react";

/** Previews geometry directly; commits one dock command on release. Escape cancels.
 * The saved width is retained on mobile and clamped only for desktop presentation.
 */
export function SideDockResize({ width, side, onResize }: { width: number; side: "left" | "right"; onResize: (width: number) => void }) {
  const drag = useRef<{ x: number; width: number; next: number; app: HTMLElement; id: number } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const limit = () => Math.min(520, window.innerWidth * .55);
  const clamp = (value: number) => Math.round(Math.max(220, Math.min(limit(), value)));
  function reset() {
    drag.current?.app.style.removeProperty("--dock-sidebar-width");
    drag.current = null;
    setPreview(null);
  }
  useEffect(() => () => { drag.current?.app.style.removeProperty("--dock-sidebar-width"); }, []);
  return <div role="separator" tabIndex={0} aria-label="Resize side dock" aria-orientation="vertical"
    aria-valuemin={220} aria-valuemax={520} aria-valuenow={preview ?? width}
    className="side-dock-resize" data-side={side}
    onPointerDown={event => {
      if (event.button !== 0) return;
      const app = event.currentTarget.closest<HTMLElement>(".app")!;
      const actual = app.querySelector(".app-sidebar-dock")!.getBoundingClientRect().width;
      drag.current = { x: event.clientX, width: actual, next: actual, app, id: event.pointerId };
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      current.next = clamp(current.width + (event.clientX - current.x) * (side === "left" ? 1 : -1));
      current.app.style.setProperty("--dock-sidebar-width", `${current.next}px`);
      setPreview(current.next);
    }}
    onPointerUp={event => {
      if (!drag.current || drag.current.id !== event.pointerId) return;
      const next = drag.current.next;
      reset();
      onResize(next);
    }}
    onPointerCancel={reset} onLostPointerCapture={reset}
    onDoubleClick={() => onResize(310)}
    onKeyDown={event => {
      if (event.key === "Escape") { reset(); return; }
      const direction = side === "left" ? 1 : -1;
      const next = event.key === "ArrowLeft" ? width - 16 * direction : event.key === "ArrowRight" ? width + 16 * direction : event.key === "Home" ? 220 : event.key === "End" ? limit() : null;
      if (next !== null) { event.preventDefault(); onResize(clamp(next)); }
    }} />;
}

import { useOverlayContainer } from "./overlay-container";
import { useRef, useState, useEffect, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogBody } from "./dialog";
import { ArrowUpRight } from "../../lib/icons";

/** Compact property entry and a retained, focus-managed editor. FLIP connects
 * the trigger's actual bounds to the overlay without animating editor layout.
 * Closing retains drafts; only the child's explicit save commits source.
 */
export function MorphingEditor({ label, preview, kind, dirty = false, children }: { label: string; preview: string; kind: string; dirty?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false), [visited, setVisited] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), origin = useRef<DOMRect | null>(null), animation = useRef<Animation | null>(null);
  const reduced = useReducedMotion(), container = useOverlayContainer();
  const popup = useRef<HTMLDivElement | null>(null), closing = useRef(false);
  useEffect(() => () => animation.current?.cancel(), []);
  return <Dialog open={open} onOpenChange={(next, details) => {
    const reduceMotion = reduced || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const keyboard = details.reason === "escape-key" || details.event?.type === "keydown" || (details.event && "detail" in details.event && details.event.detail === 0);
    if (!next && closing.current) { animation.current?.cancel(); closing.current = false; setOpen(false); return; }
    if (!next && open && !reduceMotion && !keyboard && popup.current && trigger.current && typeof popup.current.animate === "function") {
      details.cancel(); animation.current?.cancel();
      const start = popup.current.getBoundingClientRect(), end = trigger.current.getBoundingClientRect();
      closing.current = true;
      const movement = popup.current.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${end.x - start.x}px, ${end.y - start.y}px) scale(${Math.max(.05, end.width / start.width)}, ${Math.max(.05, end.height / start.height)})`, opacity: 0 }], { duration: 220, easing: "cubic-bezier(.32,.72,0,1)" });
      animation.current = movement; movement.onfinish = () => { closing.current = false; setOpen(false); };
      return;
    }
    animation.current?.cancel(); origin.current = keyboard ? null : trigger.current?.getBoundingClientRect() ?? null; setVisited(true); setOpen(next);
  }}>
    <DialogTrigger ref={trigger} className="station-property-launch" aria-label={`${label} editor`}>
      <span className="station-property-preview" data-empty={!preview.trim() || undefined}>{preview.trim() || `Add ${label.toLowerCase()}…`}</span>{dirty && <span className="station-property-draft" aria-label="Unsaved draft" />}<span className="station-property-kind">{kind}</span><ArrowUpRight size={14} aria-hidden="true" />
    </DialogTrigger>
    <DialogContent container={container ?? trigger.current?.ownerDocument.body} keepMounted size="lg" className="station-morph-editor" ref={node => {
      popup.current = node;
      if (!node || !open || reduced || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !origin.current || typeof node.animate !== "function") return;
      const start = origin.current, end = node.getBoundingClientRect(); origin.current = null;
      animation.current = node.animate([{ transform: `translate(${start.x - end.x}px, ${start.y - end.y}px) scale(${Math.max(.05, start.width / end.width)}, ${Math.max(.05, start.height / end.height)})`, borderRadius: "10px", opacity: .6 }, { transform: "none", borderRadius: "20px", opacity: 1 }], { duration: 340, easing: "cubic-bezier(.16,1,.3,1)" });
    }}>
      <DialogHeader><DialogTitle>{label}</DialogTitle><p className="text-xs text-fg-3">{kind} · changes stay in your draft until saved</p></DialogHeader>
      <DialogBody className="flex min-h-0 flex-1 flex-col" contentClassName="flex min-h-0 flex-1 flex-col">{visited && children}</DialogBody>
    </DialogContent>
  </Dialog>;
}

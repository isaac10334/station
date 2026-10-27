import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useReducedMotion } from "motion/react";

const Scene = createContext({ open: false, snapshot: false, show: (_open: boolean, _animate = true) => {} });
export const useDeskScene = () => useContext(Scene);

/** A named visual snapshot includes the shell AND its retained presentation layer.
 * Holding that snapshot avoids scaling live docking/native geometry, mounting a
 * second widget tree, or losing editor drafts. The owner survives desk switches.
 */
export function DeskScene({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false), [snapshot, setSnapshot] = useState(false);
  const current = useRef<ViewTransition | null>(null), revision = useRef(0);
  const reduced = useReducedMotion();
  const show = (next: boolean, animate = true) => {
    const generation = ++revision.current;
    current.current?.skipTransition(); current.current = null;
    const root = document.documentElement;
    if (!document.startViewTransition || (!next && !animate)) {
      delete root.dataset.deskOverview; delete root.dataset.deskTransition; delete root.dataset.deskMotion;
      setSnapshot(false); setOpen(next); return;
    }
    root.dataset.deskTransition = next ? "out" : "in";
    root.dataset.deskMotion = reduced || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !animate ? "instant" : "smooth";
    const transition = document.startViewTransition(() => {
      if (revision.current !== generation) return;
      root.toggleAttribute("data-desk-overview", next);
      flushSync(() => { setSnapshot(next); setOpen(next); });
    });
    current.current = transition;
    void transition.ready.catch(error => { if (error?.name !== "AbortError") {
      // Snapshot failure falls back to the inert layout preview, never a blank desk.
      if (current.current === transition) { delete root.dataset.deskOverview; setSnapshot(false); }
    } });
    void transition.finished.then(() => {
      if (current.current !== transition) return;
      current.current = null;
      delete root.dataset.deskOverview; delete root.dataset.deskTransition; delete root.dataset.deskMotion;
      if (next) setSnapshot(false);
    }, () => {});
  };
  useEffect(() => () => { revision.current++; current.current?.skipTransition(); delete document.documentElement.dataset.deskOverview; delete document.documentElement.dataset.deskTransition; delete document.documentElement.dataset.deskMotion; }, []);
  return <Scene.Provider value={{ open, snapshot, show }}><div className="station-desk-scene">{children}</div></Scene.Provider>;
}

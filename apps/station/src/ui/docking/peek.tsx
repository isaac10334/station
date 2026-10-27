import { useEffect } from "react";
import { X, PanelRightClose, Maximize2 } from "lucide-react";
import { IconAction } from "../components/ui/icon-action";
import { PresentationSlot } from "./presentations";
import { useDockController } from "./react";

/** Side peeks are destinations for individual existing panels, including Layout
 * owners. Hiding retains their placement and mounted content; docking restores it.
 */
export function PanelPeeks() {
  const { layout, command, renderPanel, panelTitle, activeFloating, raiseFloating, focusPanel } = useDockController();
  const visible = Object.entries(layout.floating).filter(([, item]) => item.presentation === "peek" && !item.hidden);
  useEffect(() => {
    if (!visible.length) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[role="dialog"], [role="menu"]')) return;
      const id = visible.find(([id]) => id === activeFloating)?.[0] ?? visible.at(-1)![0];
      event.preventDefault(); command({ type: "peekVisibility", panelId: id, hidden: true });
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [layout.floating, activeFloating]);
  return <>{visible.map(([id, position]) => {
    const panel = layout.panels[id]; if (!panel) return null;
    const title = panelTitle(panel);
    return <section key={id} data-native-overlay-owner={id} data-native-overlay data-panel-peek={id} data-edge={position.edge ?? "right"} className="app dock-peek" style={{ zIndex: activeFloating === id ? 105 : 55 }} onPointerDownCapture={() => raiseFloating(id)} aria-label={`${title} side peek`}>
      <div className="dock-peek-heading"><strong className="min-w-0 flex-1 truncate">{title}</strong><IconAction label={`Focus ${title}`} onClick={() => focusPanel(id)}><Maximize2 size={14} /></IconAction><IconAction label={`Dock ${title}`} onClick={() => command({ type: "dockFloat", panelId: id })}><PanelRightClose size={14} /></IconAction><IconAction label={`Close ${title} peek`} onClick={() => command({ type: "peekVisibility", panelId: id, hidden: true })}><X size={14} /></IconAction></div>
      <div className="min-h-0 flex-1"><PresentationSlot panel={panel} renderPanel={renderPanel} /></div>
    </section>;
  })}</>;
}

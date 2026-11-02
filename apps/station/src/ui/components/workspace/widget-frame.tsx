import { WindowControls } from "./window-controls";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { FlipHorizontal2, MoreHorizontal, RotateCcw, Minimize2, X } from "lucide-react";
import { widgetCloseCommand } from "../../../core/widget-actions";
import { isLayoutPanel, panelSlot, panelSurface, hostSurface, type Panel } from "../../../core/docking";
import { useDockController, WidgetDragHandle } from "../../docking/react";
import { revealPresentation } from "../../docking/presentations";
import { IconAction } from "../ui/icon-action";
import { ActionTooltip } from "../ui/action-tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { ScrollArea } from "../ui/scroll-area";
import { WidgetSettings } from "./widget-settings";

/** React presentation hooks never enter the persisted document. Commands are the
 * only mutation API; a custom header/back may reuse the official parts below.
 * Recovery controls remain on the ellipsis button and in the inspector.
 */
export type WidgetFrameContext = {
  panel: Panel;
  title: string;
  actions: ReactNode;
  dragHandle: ReactNode;
  settings: ReactNode;
  flip: () => void;
  close: (removeSlot?: boolean) => void;
};
const WidgetToolbarContext = createContext<ReactNode>(null);
/** Host controls can join a widget-owned toolbar without floating over authored content. */
export const useWidgetToolbarControls = () => useContext(WidgetToolbarContext);
export type WidgetFrameProps = {
  /** The content must render useWidgetToolbarControls in its own toolbar. Floating windows keep their titlebar. */
  integratedToolbar?: boolean;
  panel: Panel;
  title: string;
  children: ReactNode;
  onOpenSource?: () => void;
  /** Replace the front header. Reuse WidgetHeader for the standard drag surface. */
  header?: (context: WidgetFrameContext) => ReactNode;
  /** Replace the flip side; the return control and host menu remain available. */
  back?: (context: WidgetFrameContext) => ReactNode;
};
/** One full-width pickup surface with independently interactive action/middle slots.
 * @example <WidgetHeader heading={title} dragHandle={dragHandle} actions={actions}><Status /></WidgetHeader>
 */
export function WidgetHeader({ heading, dragHandle, actions, children, hidden = false, leading }: {
  leading?: ReactNode; heading: ReactNode; dragHandle?: ReactNode; actions?: ReactNode; children?: ReactNode; hidden?: boolean;
}) {
  return <div className="dash-widget-head widget-header" data-title-hidden={hidden || undefined}>
    {leading && <div className="relative z-10 shrink-0">{leading}</div>}
    {dragHandle}
    <h2 className={hidden ? "sr-only" : "widget-header-heading min-w-0 flex-1 truncate text-sm font-semibold"}>{heading}</h2>
    {children && <div className="relative z-10 min-w-0">{children}</div>}
    <div className="relative z-10 shrink-0">{actions}</div>
  </div>;
}

/** Persistent instance chrome. Compact/seamless presentation never removes host
 * controls: hover, focus, touch, keyboard and inspector remain recovery paths.
 * Flipping only hides the front; child widgets and services remain mounted.
 */
export function WidgetFrame({ panel, title, children, onOpenSource, header, back, integratedToolbar }: WidgetFrameProps) {
  const { layout, editingWidgets, command, selectWidget, selectedWidgets, controlsPanel, openWidgetControls, highlightedWidget } = useDockController();
  const [flipped, setFlipped] = useState(false);
  const [backVisited, setBackVisited] = useState(false);
  const menuOpen = controlsPanel === panel.id;
  const setMenuOpen = (value: boolean) => { if (value || menuOpen) openWidgetControls(value ? panel.id : null); };
  const section = useRef<HTMLElement>(null);
  const previousFlip = useRef(false);
  const reduce = useReducedMotion();
  const nestedLayout = isLayoutPanel(panel) && !!panelSlot(layout, panel.id)?.target.ownerId;
  const chrome = panel.chrome ?? (nestedLayout ? "compact" : "default");
  useEffect(() => {
    if (previousFlip.current === flipped) return;
    previousFlip.current = flipped;
    let cancelled = false;
    void revealPresentation(panel.id).then(() => {
      if (!cancelled) section.current?.querySelector<HTMLElement>(flipped ? ".widget-back button" : ".widget-settings-trigger")?.focus({ preventScroll: true });
    });
    return () => { cancelled = true; };
  }, [flipped, panel.id]);
  useEffect(() => { if (!panel.flippable) setFlipped(false); }, [panel.flippable]);
  const flip = () => { if (!panel.flippable || inToolbar) return; setMenuOpen(false); setBackVisited(true); setFlipped(true); };
  const floating = !!layout.floating[panel.id], root = layout.panels[layout.rootId!];
  const inToolbar = panelSurface(layout, panel.id) === "toolbar";
  const close = (removeSlot = false) => command(widgetCloseCommand(layout, panel.id, { removeSlot }));
  const hidden = panel.hideDisplayName || chrome === "seamless";
  const dragHandle = <WidgetDragHandle panelId={panel.id} title={title} context={floating ? "float" : "front"} className={hidden ? "widget-header-grip" : "widget-header-drag"} compact={hidden}>{hidden ? undefined : <span className="sr-only">{title}</span>}</WidgetDragHandle>;
  const settings = <WidgetSettings panelId={panel.id} onOpenSource={onOpenSource} />;
  const actions = <div className="widget-quick-actions flex items-center gap-0.5">
    {hidden && dragHandle}
    <PopoverTrigger variant="bare" render={<IconAction className="widget-settings-trigger size-7 border-0 bg-transparent" label={`Widget controls · ${title}`}><MoreHorizontal size={16} /></IconAction>} onClick={() => selectWidget(panel.id)} />

    {panel.flippable && <IconAction className="size-7 border-0 bg-transparent" label={`Flip ${title} to settings`} onClick={flip}><FlipHorizontal2 size={14} /></IconAction>}
    {!floating && editingWidgets && <IconAction className="size-7 border-0 bg-transparent" label={`Remove ${title} widget`} tooltip={`Remove ${title} · Ctrl+click also removes its slot`} onClick={event => close(event.ctrlKey)}><X size={14} /></IconAction>}
  </div>;
  const context: WidgetFrameContext = { panel, title, actions, dragHandle, settings, flip, close };
  return <Popover open={menuOpen} onOpenChange={setMenuOpen}><section ref={section} className={`dash-widget dash-widget-standard ${inToolbar ? "widget-toolbar" : ""} widget-tone-${panel.kind === "widget" ? panel.tone ?? "slate" : "slate"}`}
    id={`widget-instance:${panel.id}`} data-widget-instance={panel.id} data-widget-surface={hostSurface(layout, panel.id)} data-floating={floating || undefined} data-chrome={chrome} data-editing={editingWidgets && !flipped || undefined} data-selected={editingWidgets && selectedWidgets.includes(panel.id) || undefined}
    data-highlighted={highlightedWidget === panel.id || undefined} aria-label={`${title} widget`}

  >
    {inToolbar && <WidgetDragHandle panelId={panel.id} title={title} context="toolbar" compact className="toolbar-widget-grip" />}
    <motion.div className="widget-flip" animate={{ rotateY: flipped && !reduce ? 180 : 0 }} transition={{ duration: reduce ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}>
      <div className="widget-face widget-front flex min-h-0 flex-col" aria-hidden={flipped} inert={flipped}>
        {integratedToolbar && (!floating || panel.kind === "widget" && panel.widget === "desk-controls") ? null : header ? header(context) : <WidgetHeader leading={floating ? <WindowControls title={title} onClose={() => close()} onDock={() => command({ type: "dockFloat", panelId: panel.id })} onMinimize={root?.kind === "widget" && root.widget === "desktop-shell" ? () => command({ type: "windowVisibility", panelId: panel.id, hidden: true }) : undefined} /> : undefined} heading={title} hidden={hidden && !floating} dragHandle={hidden ? undefined : dragHandle} actions={actions} />}
        <div className="widget-content-sizing" data-content-sizing={panel.contentSizing ?? "fill"}><WidgetToolbarContext.Provider value={integratedToolbar && (!floating || panel.kind === "widget" && panel.widget === "desk-controls") ? <>{!hidden && <WidgetDragHandle panelId={panel.id} title={title} context={floating ? "float" : "front"} compact className="widget-header-grip"/>}{actions}</> : null}>{children}</WidgetToolbarContext.Provider></div>
      </div>
      <div className="widget-face widget-back" aria-hidden={!flipped} inert={!flipped} style={{ transform: reduce ? "none" : "rotateY(180deg)", visibility: reduce ? flipped ? "visible" : "hidden" : undefined }}>
        <ScrollArea className="widget-back-scroll" contentClassName="widget-back-content" fade={false} aria-label="Widget settings">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="min-w-0 truncate text-sm font-medium">{title}</h2><IconAction className="size-7" label="Return to widget" onClick={() => setFlipped(false)}><RotateCcw size={14} /></IconAction></div>
          {backVisited && (back ? back(context) : settings)}
        </ScrollArea>
      </div>
    </motion.div>
    <PopoverContent anchor={() => inToolbar ? section.current : section.current?.querySelector<HTMLElement>(".widget-settings-trigger") ?? section.current} container={section.current?.closest("dialog")} align="end" arrow={false} size="md" className="max-h-[min(80dvh,640px)] overflow-y-auto p-3" data-native-overlay>
      <WidgetSettings panelId={panel.id} onDismiss={() => setMenuOpen(false)} onFlip={panel.flippable && !inToolbar ? flip : undefined} onOpenSource={onOpenSource} />
    </PopoverContent>
  </section></Popover>;
}

import type { ComponentProps, ReactNode } from "react";
import { Tabs, TabsList, TabsTab, TabsPanel, TabsPanels } from "../ui/tabs";
import { cn } from "../../lib/utils";
import { DockOwnedLayout } from "../../docking/react";

export type LayoutPage = {
  id: string;
  title: ReactNode;
  /** Omit for navigation backed by an externally rendered view (such as a native browser). */
  content?: ReactNode;
  count?: number;
  disabled?: boolean;
};

/** Shared Layout presentation. `ownerId` renders movable widgets in the existing
 * dock graph; controlled `pages` render local view sections without placements.
 * Page identity preserves mounted state; removed pages unmount normally.
 * The caller owns selection and any service lifecycle.
 * @example
 * <LayoutWidget pages={pages} value={page} onValueChange={setPage} label="Views" />
 * // Inside a DockHost, reuse a real owner's slots, tabs, splits and drag/drop:
 * <LayoutWidget ownerId={instanceId} className="flex-1" />
 */
export function LayoutWidget({
  title, hideTitle = false, titleControl, actions, pages, value, onValueChange, ownerId,
  label = "Layout views", children, className, ...rest
}: Omit<ComponentProps<"div">, "title"> & {
  title?: string;
  hideTitle?: boolean;
  /** Optional draggable heading supplied by the dock owner. */
  titleControl?: ReactNode;
  actions?: ReactNode;
  label?: string;
} & ({ ownerId?: never; pages: readonly LayoutPage[]; value: string; onValueChange: (value: string) => void }
  | { ownerId?: string; pages?: never; value?: never; onValueChange?: never })) {
  const selected = pages?.find(page => page.id === value && !page.disabled)?.id
    ?? pages?.find(page => !page.disabled)?.id;
  return <div className={cn("flex min-h-0 min-w-0 flex-col", className)} {...rest}>
    {(title || titleControl || actions) && <div className="dash-widget-head" data-title-hidden={hideTitle || undefined}>
      {(title || titleControl) && <h2 className={hideTitle ? "sr-only" : "min-w-0 break-words"}>{hideTitle ? title : titleControl ?? title}</h2>}
      {actions}
    </div>}
    {pages ? <Tabs size="sm" value={selected ?? null} onValueChange={next => {
      if (typeof next === "string") onValueChange?.(next);
    }}>
      <TabsList aria-label={label}>{pages.map(page => <TabsTab key={page.id} value={page.id} count={page.count} disabled={page.disabled}>{page.title}</TabsTab>)}</TabsList>
      {pages.some(page => page.content !== undefined) && <TabsPanels animateHeight={false}>{pages.map(page => <TabsPanel key={page.id} value={page.id} keepMounted>{page.content}</TabsPanel>)}</TabsPanels>}
    </Tabs> : ownerId ? <DockOwnedLayout ownerId={ownerId} /> : children}
  </div>;
}

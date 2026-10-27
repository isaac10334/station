import { DEFAULT_DOCK_POLICY, descendants, panelSlot, reduceDock, type Command, type DockLayout, type DockPolicy } from "./docking";

/** Resolve the common close gesture without depending on DOM or React events.
 * Ctrl-close removes the backing slot only when it contains this instance alone.
 * Shared slots and floating windows safely fall back to closing the instance.
 * @example dispatch(widgetCloseCommand(layout, id, { removeSlot: event.ctrlKey }));
 */
export function widgetCloseCommand(layout: DockLayout, panelId: string, options: { removeSlot?: boolean } = {}): Command {
  return { type: options.removeSlot && panelSlot(layout, panelId)?.node.tabs.length === 1 ? "closeAndRemoveSlot" : "close", panelId };
}

/** Remove duplicate and logically owned selections before a bulk operation.
 * Children of selected package/editor owners close with that owner. Layout children
 * are independent instances and remain explicit targets when selected together.
 */
export function independentWidgetSelection(layout: DockLayout, ids: readonly string[]): string[] {
  const selected = new Set(ids.filter(id => id !== layout.rootId && layout.panels[id] && !["home", "browser", "navigation"].includes(layout.panels[id].kind)));
  for (const id of selected) {
    const panel = layout.panels[id];
    if (panel.kind === "widget" && ["stack", "web-browser", "main-surface"].includes(panel.widget)) continue;
    for (const child of descendants(layout, id)) selected.delete(child);
  }
  return [...selected];
}

/** Plan against each preceding close so the final selected tab can remove its
 * now-empty slot. Dispatch the returned batch once for atomic history/validation.
 * No service is stopped and no source is changed while planning this command.
 */
export function widgetBulkCloseCommand(layout: DockLayout, ids: readonly string[], options: { removeSlot?: boolean } = {}, policy: DockPolicy = DEFAULT_DOCK_POLICY): Command {
  let preview = layout;
  const commands = independentWidgetSelection(layout, ids).map(id => {
    const action = widgetCloseCommand(preview, id, options);
    const result = reduceDock(preview, action, policy);
    if (result.ok) preview = result.layout;
    return action;
  });
  return { type: "batch", commands };
}

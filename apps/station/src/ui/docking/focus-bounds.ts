/** Modal presentation measurements are host-owned and transient. The widget keeps
 * its original slot, identity, draft and service scope while this projection is active. */
export function widgetFocusBounds(viewport: { width: number; height: number }, presentation: "focus" | "quick-access") {
  const width = Math.max(1, Math.min(viewport.width - 24, presentation === "quick-access" ? 720 : viewport.width - 24));
  const height = Math.max(1, Math.min(viewport.height - 80, presentation === "quick-access" ? 520 : viewport.height - 64));
  return { x: (viewport.width - width) / 2, y: presentation === "quick-access" ? Math.max(52, (viewport.height - height) / 2) : 52, width, height };
}

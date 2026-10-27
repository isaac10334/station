import type { ReactNode } from "react";

/** Content-sized presentation inside host-owned geometry. Container queries
 * respond to the actual slot, float or main view without replacing the widget,
 * resetting its controller or changing docking authority. Compact views retain
 * every control; roomier views center a bounded reading surface. */
export function AdaptiveWidgetSurface({ children }: { children: ReactNode }) {
  return <div className="adaptive-widget-surface"><div className="adaptive-widget-content">{children}</div></div>;
}

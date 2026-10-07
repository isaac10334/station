/** Widget catalog identities and view preferences shared by the dock core and app. */
export const WIDGET_IDS = ["weather", "clock", "capabilities", "stack", "snake"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];
export type WidgetSize = "compact" | "standard" | "wide";
export type WidgetTone = "blue" | "violet" | "coral" | "mint" | "slate";
export type StackMode = "carousel" | "tabs";
export type BrowserView = "grid" | "list";

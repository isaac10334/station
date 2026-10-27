/** Widget catalog identities and view preferences shared by the dock core and app. */
export const WIDGET_IDS = ["weather", "clock", "capabilities", "stack", "snake", "docking-inspector", "ai-chat", "web-browser", "browser-tab", "app-shell", "desktop-shell", "navigation", "asset-browser", "main-surface", "widget-editor", "widget-list", "data-view", "action-button", "program", "desk-settings", "ide", "note", "quick-capture", "desk-controls"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];
export type WidgetSize = "compact" | "standard" | "wide";
export type WidgetTone = "blue" | "violet" | "coral" | "mint" | "slate";
export type WidgetChrome = "default" | "compact" | "seamless";
export type StackMode = "carousel" | "tabs" | "sidebar";
export type BrowserView = "grid" | "list";

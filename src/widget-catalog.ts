import { Activity, Clock3, CloudSun, Layers3, ShieldCheck, Code2, Globe, PanelLeft, LayoutGrid } from "lucide-react";
import type { WidgetId } from "./panel-layout";
import type { Unit } from "./model";
import type { Panel } from "./docking/core";

/** Reusable app renderer definitions; no per-instance state or guest authority. */
export const WIDGET_CATALOG = {
  weather: { title: "Weather", description: "A six-hour forecast, with location requested when you choose.", icon: CloudSun, renderer: "react", preview: "Forecast · temperature · next six hours" },
  clock: { title: "Local time", description: "Your time, date and time zone, always in sync.", icon: Clock3, renderer: "react", preview: "12:34 · Wednesday · local time" },
  capabilities: { title: "Capability inspector", description: "Inspect and change the selected Component’s explicit grants.", icon: ShieldCheck, renderer: "react", preview: "Logging · feed · text surface · clock" },
  // Serialized `stack` identity is retained. Its renderer is now a real Layout.
  stack: { title: "Layout", description: "Arrange real child widgets in split slots, tabs or a horizontal carousel.", icon: Layers3, renderer: "layout", preview: "Resizable slots · tabs · carousel" },
  "docking-inspector": { title: "Docking inspector", description: "Explore placements and nested slots; toggle drag diagnostics and motion experiments.", icon: LayoutGrid, renderer: "react", preview: "Layout tree � visibility � drag diagnostics" },
  snake: { title: "Snake", description: "A keyboard game. Focus the game to play.", icon: Activity, renderer: "react", preview: "Arrow keys · score · restart" },
} satisfies Record<WidgetId, { title: string; description: string; icon: typeof Activity; renderer: string; preview: string }>;

/** Definition metadata is reusable; creating it never creates a placement or starts a service. */
export type WidgetDefinition = {
  id: string; title: string; description: string; preview: string; icon: typeof Activity;
  provider: "builtin" | "authored-unit"; renderer: "react" | "layout" | "editor" | "iframe";
  create?: { kind: "widget"; widget: WidgetId } | { kind: "unit" | "web-widget"; unitId: string };
};

/** Build the catalog from host definitions and current content, without instance state. */
export function widgetDefinitions(units: readonly Unit[]): WidgetDefinition[] {
  return [
    ...Object.entries(WIDGET_CATALOG).map(([widget, item]) => ({ ...item, id: `builtin:${widget}`, renderer: item.renderer as "react" | "layout", provider: "builtin" as const, create: { kind: "widget" as const, widget: widget as WidgetId } })),
    ...units.flatMap((unit): WidgetDefinition[] => [
      { id: `editor:${unit.id}`, title: `${unit.name} editor`, description: "New view of existing content; all views share its source.", preview: unit.kind === "component" ? "Source · artifact · grants · invocation" : "HTML source · isolated preview", icon: Code2, renderer: "editor", provider: "authored-unit", create: { kind: "unit", unitId: unit.id } },
      ...(unit.kind === "web-content" ? [{ id: `web:${unit.id}`, title: unit.name, description: "Authored web widget in an isolated iframe.", preview: "Interactive HTML · scripts · retained state during moves", icon: Globe, renderer: "iframe" as const, provider: "authored-unit" as const, create: { kind: "web-widget" as const, unitId: unit.id } }] : []),
    ]),
    ...(["home", "browser", "navigation"] as const).map((kind) => ({ id: `host:${kind}`, title: kind === "home" ? "Overview" : kind === "browser" ? "Unit browser" : "Navigation", description: "Required host instance, governed by placement policy.", preview: "Host navigation", icon: kind === "navigation" ? PanelLeft : LayoutGrid, renderer: "react" as const, provider: "builtin" as const })),
  ];
}

/** Compatibility panel records resolve to a definition; IDs and content are unchanged. */
export function definitionForPanel(panel: Panel, definitions: readonly WidgetDefinition[]) {
  const id = panel.kind === "widget" ? `builtin:${panel.widget}` : panel.kind === "unit" ? `editor:${panel.unitId}` : panel.kind === "web-widget" ? `web:${panel.unitId}` : `host:${panel.kind}`;
  return definitions.find((item) => item.id === id);
}

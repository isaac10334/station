import { BUILTIN_WIDGET_DEFINITIONS, RETIRED_WIDGETS, builtinWidgetAssets, isBuiltinWidgetAsset, parseWidgetRecipe } from "../core/widget-definitions";
import {
  Activity,
  Clock3,
  CloudSun,
  Layers3,
  ShieldCheck,
  Code2,
  Globe,
  PanelLeft,
  LayoutGrid,
  MessageSquare,
} from "lucide-react";
import type { WidgetId } from "../core/panel-layout";
import { installedDefinitions } from "../core/contribution-catalog";
import type { Workspace } from "../core/workspace-state";
import type { Asset, DataAsset } from "../core/asset-state";
import type { Panel } from "../core/docking";

/** Reusable app renderer definitions; no per-instance state or guest authority. */
export const WIDGET_CATALOG = Object.fromEntries(Object.entries(BUILTIN_WIDGET_DEFINITIONS).map(([id, item]) => [id, { ...item, icon: ({ "desk-controls": LayoutGrid, "quick-capture": MessageSquare, note: MessageSquare, ide: Code2, "desk-settings": LayoutGrid, program: Code2, "data-view": Layers3, "action-button": Activity, "widget-list": Layers3, "widget-editor": Code2, "app-shell": LayoutGrid, "desktop-shell": LayoutGrid, navigation: PanelLeft, "asset-browser": Layers3, "main-surface": LayoutGrid, "browser-tab": Globe, "web-browser": Globe, "ai-chat": MessageSquare, weather: CloudSun, clock: Clock3, capabilities: ShieldCheck, stack: Layers3, "docking-inspector": LayoutGrid, snake: Activity } as const)[id as WidgetId] }])) as Record<WidgetId, (typeof BUILTIN_WIDGET_DEFINITIONS)[WidgetId] & { icon: typeof Activity }>;

/** Definition metadata is reusable; creating it never creates a placement or starts a service. */
export type WidgetDefinition = {
  creation?: "menu" | "contextual";
  assetId?: string;
  id: string;
  title: string;
  description: string;
  preview: string;
  previewSeed?: import("../core/widget-definitions").WidgetSeed;
  icon: typeof Activity;
  provider: "builtin" | "authored-asset" | "package";
  renderer: "react" | "layout" | "editor" | "iframe";
  create?:
    | { kind: "widget"; widget: WidgetId; definitionId?: string }
    | { kind: "asset" | "web-widget"; assetId: string }
    | { kind: "contribution"; definitionId: string };
};

/** Build the catalog from host definitions and current content, without instance state. */
export function widgetDefinitions(
  assets: readonly Asset[],
  workspace?: Workspace,
): WidgetDefinition[] {
  return [
    ...(workspace
      ? installedDefinitions(workspace).map((item) => ({
          id: item.id,
          assetId: item.installation.packageAssetId,
          title: item.contribution.title,
          description: item.installation.name,
          preview: "Installed web widget",
          icon: Globe,
          provider: "package" as const,
          renderer: "iframe" as const,
          creation: item.contribution.creation,
          create:
            item.contribution.role === "widget" &&
            item.contribution.creation === "menu"
              ? { kind: "contribution" as const, definitionId: item.id }
              : undefined,
        }))
      : []),
    ...Object.entries(WIDGET_CATALOG).map(([widget, item]) => ({
      ...item,
      previewSeed: { widget: widget as WidgetId },
      id: `builtin:${widget}`,
      assetId: `builtin:${widget}`,
      renderer: item.renderer as "react" | "layout",
      provider: "builtin" as const,
      creation: widget === "desktop-shell" || RETIRED_WIDGETS.includes(widget as WidgetId) ? "contextual" as const : "menu" as const,
      create: RETIRED_WIDGETS.includes(widget as WidgetId) ? undefined : { kind: "widget" as const, widget: widget as WidgetId },
    })),
    ...assets.filter((asset): asset is DataAsset => asset.kind === "widget-definition").flatMap((asset): WidgetDefinition[] => {
      try {
        const recipe = parseWidgetRecipe(asset.files["widget.json"] ?? "");
        return [{ id: asset.id, assetId: asset.id, title: recipe.title, description: recipe.description, previewSeed: recipe, preview: `Recipe · ${WIDGET_CATALOG[recipe.widget].title}`, icon: WIDGET_CATALOG[recipe.widget].icon, renderer: WIDGET_CATALOG[recipe.widget].renderer, provider: "authored-asset", creation: recipe.widget === "desktop-shell" ? "contextual" : "menu", create: { kind: "widget", widget: recipe.widget, definitionId: asset.id } }];
      } catch { return []; }
    }),
    ...assets.flatMap((asset): WidgetDefinition[] => [
      {
        id: `editor:${asset.id}`,
        assetId: asset.id,
        title: `${asset.name} editor`,
        description:
          "New view of existing content; all views share its source.",
        preview:
          asset.kind === "component"
            ? "Source · artifact · grants · invocation"
            : "HTML source · isolated preview",
        icon: Code2,
        renderer: "editor",
        provider: "authored-asset",
        create: { kind: "asset", assetId: asset.id },
      },
      ...(asset.kind === "web-content"
        ? [
            {
              id: `web:${asset.id}`,
              assetId: asset.id,
              title: asset.name,
              description: "Authored web widget in an isolated iframe.",
              preview:
                "Interactive HTML · scripts · retained state during moves",
              icon: Globe,
              renderer: "iframe" as const,
              provider: "authored-asset" as const,
              create: { kind: "web-widget" as const, assetId: asset.id },
            },
          ]
        : []),
    ]),
    ...(["home", "browser", "navigation"] as const).map((kind) => ({
      id: `host:${kind}`,
      title:
        kind === "home"
          ? "Overview"
          : kind === "browser"
            ? "Asset browser"
            : "Navigation",
      description: "Required host instance, governed by placement policy.",
      preview: "Host navigation",
      icon: kind === "navigation" ? PanelLeft : LayoutGrid,
      renderer: "react" as const,
      provider: "builtin" as const,
    })),
  ];
}

/** Instance names follow the widget across slots; browser pages default to their bookmark host. */
export function widgetInstanceTitle(panel: Extract<Panel, { kind: "widget" }>): string {
  if (panel.displayName) return panel.displayName;
  if (panel.widget === "browser-tab") {
    try { return new URL(panel.browser?.tabs[0]?.url ?? "https://example.com/").hostname; } catch { return "Browser tab"; }
  }
  return WIDGET_CATALOG[panel.widget].title;
}

/** Compatibility panel records resolve to a definition; IDs and content are unchanged. */
export function definitionForPanel(
  panel: Panel,
  definitions: readonly WidgetDefinition[],
) {
  if (panel.kind === "asset" && isBuiltinWidgetAsset(panel.assetId)) {
    const builtin = builtinWidgetAssets().find(asset => asset.id === panel.assetId)!;
    return { title: panel.displayName || `${builtin.name} definition`, assetId: panel.assetId };
  }
  const id =
    panel.kind === "widget"
      ? panel.definitionId ?? `builtin:${panel.widget}`
      : panel.kind === "asset"
        ? `editor:${panel.assetId}`
        : panel.kind === "web-widget"
          ? `web:${panel.assetId}`
          : `host:${panel.kind}`;
  if (panel.kind === "editor-part")
    return {
      title: panel.displayName || {
        files: "Files",
        code: "Code",
        preview: "Preview",
        problems: "Problems",
      }[panel.part],
    };
  if (panel.kind === "contribution" || panel.kind === "command-output") {
    const definition = definitions.find(item => item.id === panel.definitionId);
    return definition && panel.displayName ? { ...definition, title: panel.displayName } : definition;
  }
  const definition = definitions.find(item => item.id === id) ?? (panel.kind === "widget" ? definitions.find(item => item.id === `builtin:${panel.widget}`) : undefined);
  if (!definition) return undefined;
  const title = panel.kind === "widget" ? panel.displayName || (panel.definitionId ? definition.title : widgetInstanceTitle(panel)) : panel.displayName;
  return title ? { ...definition, title } : definition;
}

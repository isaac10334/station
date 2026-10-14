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
import type { Workspace } from "../core/model";
import type { Asset } from "../core/model";
import type { Panel } from "../core/docking";

/** Reusable app renderer definitions; no per-instance state or guest authority. */
export const WIDGET_CATALOG = {
  "ai-chat": {
    title: "AI chat",
    description:
      "Chat through Vercel AI Gateway with explicit workspace tool grants.",
    icon: MessageSquare,
    renderer: "react",
    preview: "Your key · streaming chat · granted tools",
  },
  weather: {
    title: "Weather",
    description:
      "A six-hour forecast, with location requested when you choose.",
    icon: CloudSun,
    renderer: "react",
    preview: "Forecast · temperature · next six hours",
  },
  clock: {
    title: "Local time",
    description: "Your time, date and time zone, always in sync.",
    icon: Clock3,
    renderer: "react",
    preview: "12:34 · Wednesday · local time",
  },
  capabilities: {
    title: "Capability inspector",
    description:
      "Inspect capabilities and their providers, scope-owned uses and Component grants.",
    icon: ShieldCheck,
    renderer: "react",
    preview: "Capabilities · scopes · grants",
  },
  // Serialized `stack` identity is retained. Its renderer is now a real Layout.
  stack: {
    title: "Layout",
    description:
      "Arrange real child widgets in split slots, tabs or a horizontal carousel.",
    icon: Layers3,
    renderer: "layout",
    preview: "Resizable slots · tabs · carousel",
  },
  "docking-inspector": {
    title: "Docking inspector",
    description:
      "Explore placements and nested slots; toggle drag diagnostics and motion experiments.",
    icon: LayoutGrid,
    renderer: "react",
    preview: "Layout tree · visibility · drag diagnostics",
  },
  snake: {
    title: "Snake",
    description: "A keyboard game. Focus the game to play.",
    icon: Activity,
    renderer: "react",
    preview: "Arrow keys · score · restart",
  },
} satisfies Record<
  WidgetId,
  {
    title: string;
    description: string;
    icon: typeof Activity;
    renderer: string;
    preview: string;
  }
>;

/** Definition metadata is reusable; creating it never creates a placement or starts a service. */
export type WidgetDefinition = {
  creation?: "menu" | "contextual";
  id: string;
  title: string;
  description: string;
  preview: string;
  icon: typeof Activity;
  provider: "builtin" | "authored-asset" | "package";
  renderer: "react" | "layout" | "editor" | "iframe";
  create?:
    | { kind: "widget"; widget: WidgetId }
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
      id: `builtin:${widget}`,
      renderer: item.renderer as "react" | "layout",
      provider: "builtin" as const,
      create: { kind: "widget" as const, widget: widget as WidgetId },
    })),
    ...assets.flatMap((asset): WidgetDefinition[] => [
      {
        id: `editor:${asset.id}`,
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

/** Compatibility panel records resolve to a definition; IDs and content are unchanged. */
export function definitionForPanel(
  panel: Panel,
  definitions: readonly WidgetDefinition[],
) {
  const id =
    panel.kind === "widget"
      ? `builtin:${panel.widget}`
      : panel.kind === "asset"
        ? `editor:${panel.assetId}`
        : panel.kind === "web-widget"
          ? `web:${panel.assetId}`
          : `host:${panel.kind}`;
  if (panel.kind === "editor-part")
    return {
      title: {
        files: "Files",
        code: "Code",
        preview: "Preview",
        problems: "Problems",
      }[panel.part],
    };
  if (panel.kind === "contribution" || panel.kind === "command-output")
    return definitions.find((item) => item.id === panel.definitionId);
  return definitions.find((item) => item.id === id);
}

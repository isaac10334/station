import type { Workspace } from "./model";

import { definitionForPanel, widgetDefinitions } from "./widget-catalog";

export const ASSET_DRAG_TYPE = "application/x-station-asset";
export type SearchScope = "all" | "search" | "assets" | "panels" | "actions";
export type SearchKind = "assets" | "panels";
/** A reference to content or an existing presentation; no view or execution state. */
export type WorkspaceSearchItem = {
  id: string;
  kind: SearchKind;
  label: string;
  hint: string;
  keywords: string[];
  assetId?: string;
  assetKind?: "component" | "web-content";
  panelId?: string;
};

/** Explicit prefixes are interpreted only at the start; unknown prefixes remain ordinary text. */
export function parseWorkspaceQuery(value: string): {
  scope: SearchScope;
  text: string;
} {
  const query = value.trimStart();
  if (query.startsWith(">"))
    return { scope: "actions", text: query.slice(1).trim() };
  const match = /^(assets|panels|actions|search):\s*/i.exec(query);
  return match
    ? {
        scope: match[1].toLowerCase() as SearchScope,
        text: query.slice(match[0].length).trim(),
      }
    : { scope: "all", text: query.trim() };
}

/** Shared by the palette and navigation. Stable IDs survive renames and editor duplication. */
export function workspaceSearchItems(
  workspace: Workspace,
): WorkspaceSearchItem[] {
  const definitions = widgetDefinitions(workspace.assets);
  const panels = Object.values(workspace.dock.panels);
  return [
    ...workspace.assets.map((asset): WorkspaceSearchItem => ({
      id: `asset:${asset.id}`,
      kind: "assets",
      label: asset.name,
      hint: asset.kind === "component" ? "Component" : "Web content",
      keywords: [
        asset.description,
        asset.kind,
        ...(asset.kind === "component"
          ? Object.keys(asset.files)
          : ["html", "widget"]),
      ],
      assetId: asset.id,
      assetKind: asset.kind,
    })),
    ...panels
      .filter((panel) => panel.kind !== "navigation")
      .map((panel): WorkspaceSearchItem => ({
        id: `panel:${panel.id}`,
        kind: "panels",
        panelId: panel.id,
        label: definitionForPanel(panel, definitions)?.title ?? panel.id,
        hint:
          panel.kind === "asset"
            ? "Asset editor"
            : panel.kind === "web-widget"
              ? "Web widget"
              : panel.kind === "home"
                ? "Workspace"
                : "Panel",
        keywords: [panel.kind, panel.id],
      })),
  ];
}

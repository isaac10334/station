import type { Workspace } from "../core/model";

import { definitionForPanel, widgetDefinitions } from "./widget-catalog";

export * from "../core/workspace-query";
import type { WorkspaceSearchItem } from "../core/workspace-query";
/** Shared by the palette and navigation. Stable IDs survive renames and editor duplication. */
export function workspaceSearchItems(
  workspace: Workspace,
): WorkspaceSearchItem[] {
  const definitions = widgetDefinitions(workspace.assets, workspace);
  const panels = Object.values(workspace.dock.panels);
  return [
    ...workspace.assets.map((asset): WorkspaceSearchItem => ({
      id: `asset:${asset.id}`,
      kind: "assets",
      label: asset.name,
      hint:
        asset.kind === "component"
          ? "Component"
          : asset.kind === "web-content"
            ? "Web content"
            : asset.kind === "theme"
              ? "Theme"
              : "Package",
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

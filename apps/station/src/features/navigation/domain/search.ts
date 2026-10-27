import { scriptAssetLabel } from "../../../core/script-assets";
import type { Workspace } from "../../../core/workspace-state";
import type { WorkspaceSearchItem } from "../../../core/workspace-query";
/** Shared by the palette and navigation. Stable IDs survive renames and editor duplication. */
export function workspaceSearchItems(
  workspace: Workspace,
  panelTitles: Readonly<Record<string, string>>,
): WorkspaceSearchItem[] {
  const panels = Object.values(workspace.dock.panels);
  return [
    ...workspace.assets.map((asset): WorkspaceSearchItem => ({
      id: `asset:${asset.id}`,
      kind: "assets",
      label: asset.name,
      hint: ({ component: "Component", "web-content": "Web content", theme: "Theme", package: "Package", "widget-definition": "Widget definition", "desk-template": "Desk template", svg: "SVG", decision: "Decision policy", "data-source": "Data source", custom:"Custom document", markdown:"Markdown", note:"Rich note",script: scriptAssetLabel(asset) })[asset.kind],
      keywords: [
        asset.description,
        asset.kind,
        ...Object.keys(asset.files ?? {}),
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
        label: (panel.kind === "widget" ? panel.displayName : undefined)
          || (panelTitles[panel.id] ?? panel.id),
        hint:
          panel.kind === "asset"
            ? "Asset editor"
            : panel.kind === "web-widget"
              ? "Web widget"
              : panel.kind === "home"
                ? "Workspace"
                : "Panel",
        keywords: [panel.kind, panel.id, panelTitles[panel.id] ?? ""],
      })),
  ];
}

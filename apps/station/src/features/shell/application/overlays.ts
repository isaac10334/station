import type { OverlayWorkspacePort } from "./ports";
export type CreationTarget = "component" | "web-content" | "theme" | "package" | "workspace" | "widget-definition" | "desk-template" | "svg" | "decision" | "data-source" | "script" | "custom" | "markdown" | "note";
export type Overlay = null | { kind: "create"; target: CreationTarget; scriptMode?: "javascript" }
  | { kind: "rename"; assetId: string } | { kind: "restore"; assetId: string }
  | { kind: "delete"; assetIds: string[]; workspaceId: string } | { kind: "delete-workspace"; workspaceId: string } | { kind: "settings"; section?: "app" | "workspaces" | "shortcuts" };
/** Authored source creation and opening are distinct steps. This workflow starts
 * no service and grants no capability; the existing store owns persistence.
 */
export function createOverlayActions(workspace: OverlayWorkspacePort) {
  const creators: Record<CreationTarget, (name: string, mode?: "javascript") => string | void> = {
    workspace: name => { workspace.createWorkspace(name); },
    "desk-template": workspace.saveDeskTemplate,
    "widget-definition": workspace.createWidgetDefinition,
    "web-content": workspace.createWebAsset,
    component: workspace.createAsset,
    custom: workspace.createAsset,
    theme: name => workspace.createDataAsset("theme", name),
    package: name => workspace.createDataAsset("package", name),
    svg: name => workspace.createDataAsset("svg", name),
    markdown: name => workspace.createDataAsset("markdown", name),
    note: name => workspace.createDataAsset("note", name),
    decision: name => workspace.createDataAsset("decision", name),
    "data-source": name => workspace.createDataAsset("data-source", name),
    script: (name, mode) => workspace.createDataAsset("script", name, mode),
  };
  return {
    create(target: CreationTarget, name: string, mode?: "javascript") {
      const trimmed = name.trim();
      if (!trimmed) return;
      const id = creators[target](trimmed, mode);
      if (id) workspace.dispatchDock({ type: "openAsset", assetId: id });
      return id;
    },
    remove(workspaceId: string, assetIds: string[]) {
      if (workspace.active().id === workspaceId) workspace.deleteAssets(assetIds);
    },
  };
}

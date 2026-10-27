import { compatibleEditors, editorChoices } from "../../../core/asset-routing";
import type { Asset } from "../../../core/asset-state";
import type { Workspace } from "../../../core/workspace-state";
import type { Panel } from "../../../core/docking";
/** Identity/revision and selection projection. Calling this never opens, edits,
 * activates or acquires an editor. Unavailable installed editors recover source.
 */
export function projectEditorDocument(workspace: Workspace, asset: Asset, panel: Extract<Panel, { kind: "asset" }>) {
  const selected = compatibleEditors(workspace, asset).some(editor => editor.id === panel.definitionId);
  return {
    workspaceId: workspace.id, assetId: asset.id, revision: asset.revision,
    panelId: panel.id, kind: asset.kind, files: asset.files,
    choices: editorChoices(workspace, asset),
    editorId: selected || asset.kind === "svg" && panel.definitionId === "station:vectorcraft" ? panel.definitionId! : "station",
    recoverSelection: Boolean(panel.definitionId && !selected && !(asset.kind === "svg" && panel.definitionId === "station:vectorcraft")),
    renderer: asset.kind === "svg" && panel.definitionId === "station:vectorcraft" ? "vectorcraft" as const : selected ? "contribution" as const : "builtin" as const,
  };
}

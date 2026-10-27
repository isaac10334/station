/** Renderer metadata adapter. Query parsing and search projection remain pure. */
import type { Workspace } from "../core/workspace-state";
import { definitionForPanel, widgetDefinitions } from "./widget-catalog";
import { workspaceSearchItems as projectSearch } from "../features/navigation/domain/search";
export * from "../core/workspace-query";
export function workspaceSearchItems(workspace: Workspace) {
  const definitions = widgetDefinitions(workspace.assets, workspace);
  const titles = Object.fromEntries(Object.values(workspace.dock.panels).map(panel => [panel.id, definitionForPanel(panel, definitions)?.title ?? panel.id]));
  return projectSearch(workspace, titles);
}

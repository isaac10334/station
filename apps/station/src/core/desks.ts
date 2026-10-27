import {
  BROWSER_ID,
  HOME_ID,
  NAVIGATION_ID,
  migrateDock,
  reduceDock,
  type DockLayout,
  type Node,
} from "./docking";
import {
  normalizeNavigation,
  type NavigationFilter,
} from "./navigation-filter";
import { widgetDefinitionAsset, parseWidgetRecipe } from "./widget-definitions";

/** A saved view of shared workspace assets. Runtime state and grants never enter this record. */
export interface Desk {
  id: string;
  name: string;
  dock: DockLayout;
  navigation: NavigationFilter;
  disabledContributions: string[];
  hiddenDefinitions: string[];
  editorDefaults: Record<string, string>;
  themeId: string | null;
  /** One-time migration reference; removing its widget never recreates it on reload. */
  toolbarWidgetId?: string;
  toolbar?: {anchor:"bottom-left"|"bottom-center"|"bottom-right"|"top-left"|"top-center"|"top-right";inset:number};
}
/** Convert legacy fixed shell chrome into one ordinary retained overlay widget.
 * Existing toolbar preferences remain readable history; placement is now DockLayout-owned. */
export function initializeDeskToolbar(desk: Desk): Desk {
  if (desk.toolbarWidgetId !== undefined) return desk;
  const existing = Object.values(desk.dock.panels).find(panel => panel.kind === "widget" && panel.widget === "desk-controls");
  if (existing) return { ...desk, toolbarWidgetId: existing.id };
  const definition = widgetDefinitionAsset([], "builtin:desk-controls")!;
  const recipe = parseWidgetRecipe(definition.files["widget.json"]);
  const made = reduceDock(desk.dock, { type: "createWidget", widget: "desk-controls", definitionId: definition.id, definitionSnapshot: { assetId: definition.id, revision: definition.revision, recipe }, defaults: { ...recipe.defaults, displayName: "Desk controls", chrome: "seamless" }, target: { surface: "main", intent: "tab" } });
  if (!made.ok || !made.panelId) return desk;
  const floated = reduceDock(made.layout, { type: "float", panelId: made.panelId, x: 16, y: 720 });
  if (!floated.ok) return desk;
  return { ...desk, dock: migrateDock({ ...floated.layout, surfaces: desk.dock.surfaces }, []), toolbarWidgetId: made.panelId };
}
export type DeskSetup = Omit<Desk, "id" | "name">;
export function createDesk(
  name: string,
  dock: DockLayout,
  navigation = normalizeNavigation(),
): Desk {
  return {
    id: crypto.randomUUID(),
    name,
    dock,
    navigation,
    disabledContributions: [],
    hiddenDefinitions: [],
    editorDefaults: {},
    themeId: null,
  };
}
/** Clone all placements and references atomically, preserving only required host identities. */
export function cloneDesk(source: DeskSetup, name: string): Desk {
  const copy = structuredClone(source);
  copy.dock = migrateDock(copy.dock, []);
  const reserved = new Set([HOME_ID, BROWSER_ID, NAVIGATION_ID]);
  const ids = new Map(
    Object.keys(copy.dock.panels).map((id) => [
      id,
      reserved.has(id) ? id : `instance:${crypto.randomUUID()}`,
    ]),
  );
  const nodes = new Map<string, string>();
  const nodeId = (id: string, prefix: string) => { const fresh = `${prefix}:${crypto.randomUUID()}`; nodes.set(id, fresh); return fresh; };
  const remap = (node: Node): Node =>
    node.kind === "stack"
      ? {
          ...node,
          id: nodeId(node.id, "slot"),
          tabs: node.tabs.map((id) => ids.get(id)!),
          active: ids.get(node.active) ?? "",
        }
      : node.kind === "split"
        ? {
            ...node,
            id: nodeId(node.id, "split"),
            first: remap(node.first),
            second: remap(node.second),
          }
        : {
            ...node,
            id: nodeId(node.id, "grid"),
            cells: node.cells.map((cell) => ({
              ...cell,
              id: crypto.randomUUID(),
              node: remap(cell.node),
            })),
          };
  copy.dock.rootId = copy.dock.rootId ? ids.get(copy.dock.rootId) : undefined;
  copy.dock.panels = Object.fromEntries(
    Object.entries(copy.dock.panels).map(([id, panel]) => [
      ids.get(id)!,
      {
        ...panel,
        id: ids.get(id)!,
        ownerId: panel.ownerId ? ids.get(panel.ownerId) : undefined,
      },
    ]),
  );
  copy.dock.containers = Object.fromEntries(
    Object.entries(copy.dock.containers).map(([id, node]) => [
      ids.get(id)!,
      remap(node),
    ]),
  );
  copy.dock.surfaces = Object.fromEntries(
    Object.entries(copy.dock.surfaces).map(([surface, node]) => [
      surface,
      node ? remap(node) : null,
    ]),
  ) as DockLayout["surfaces"];
  copy.dock.floating = Object.fromEntries(
    Object.entries(copy.dock.floating).map(([id, position]) => [
      ids.get(id)!,
      position,
    ]),
  );
  const reference = (value: string) =>
    value.startsWith("panel:")
      ? `panel:${ids.get(value.slice(6)) ?? value.slice(6)}`
      : value;
  for (const panel of Object.values(copy.dock.panels)) if (panel.targetRef) panel.targetRef = { ...panel.targetRef, nodeId: nodes.get(panel.targetRef.nodeId) ?? panel.targetRef.nodeId, ownerId: panel.targetRef.ownerId ? ids.get(panel.targetRef.ownerId) ?? panel.targetRef.ownerId : undefined };
  for (const panel of Object.values(copy.dock.panels)) if (panel.actionButton?.targetId) panel.actionButton.targetId = ids.get(panel.actionButton.targetId) ?? panel.actionButton.targetId;
  copy.navigation.pinned = copy.navigation.pinned.map(reference);
  copy.navigation.excluded = copy.navigation.excluded.map(reference);
  copy.dock.maximized = null;
  return { ...copy, toolbarWidgetId: copy.toolbarWidgetId ? ids.get(copy.toolbarWidgetId) ?? copy.toolbarWidgetId : undefined, id: crypto.randomUUID(), name };
}

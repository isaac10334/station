import {
  BROWSER_ID,
  HOME_ID,
  NAVIGATION_ID,
  type DockLayout,
  type Node,
} from "./docking";
import {
  normalizeNavigation,
  type NavigationFilter,
} from "./navigation-filter";

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
  toolbar?: {anchor:"bottom-left"|"bottom-center"|"bottom-right"|"top-left"|"top-center"|"top-right";inset:number};
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
  const reserved = new Set([HOME_ID, BROWSER_ID, NAVIGATION_ID]);
  const ids = new Map(
    Object.keys(copy.dock.panels).map((id) => [
      id,
      reserved.has(id) ? id : `instance:${crypto.randomUUID()}`,
    ]),
  );
  const remap = (node: Node): Node =>
    node.kind === "stack"
      ? {
          ...node,
          id: `slot:${crypto.randomUUID()}`,
          tabs: node.tabs.map((id) => ids.get(id)!),
          active: ids.get(node.active) ?? "",
        }
      : node.kind === "split"
        ? {
            ...node,
            id: `split:${crypto.randomUUID()}`,
            first: remap(node.first),
            second: remap(node.second),
          }
        : {
            ...node,
            id: `grid:${crypto.randomUUID()}`,
            cells: node.cells.map((cell) => ({
              id: crypto.randomUUID(),
              node: remap(cell.node),
            })),
          };
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
  copy.navigation.pinned = copy.navigation.pinned.map(reference);
  copy.navigation.excluded = copy.navigation.excluded.map(reference);
  copy.dock.maximized = null;
  return { ...copy, id: crypto.randomUUID(), name };
}

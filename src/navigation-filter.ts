import type { SearchKind, WorkspaceSearchItem } from "./workspace-search";
import { parseWorkspaceQuery } from "./workspace-search";
import { BROWSER_ID, HOME_ID } from "./docking/core";

/** Saved per workspace. Pins bypass filters; exclusions always win until restored. */
export type NavigationFilter = {
  query: string;
  kinds: SearchKind[];
  assetKinds: ("component" | "web-content")[];
  sort: "name" | "workspace";
  pinned: string[];
  excluded: string[];
};

export function normalizeNavigation(
  value?: Partial<NavigationFilter> | null,
): NavigationFilter {
  const strings = (items: unknown, fallback: string[] = []) =>
    Array.isArray(items)
      ? [
          ...new Set(
            items.filter((item): item is string => typeof item === "string"),
          ),
        ]
      : fallback;
  return {
    query: typeof value?.query === "string" ? value.query : "",
    kinds: strings(value?.kinds, ["assets"]).filter(
      (kind): kind is SearchKind => kind === "assets" || kind === "panels",
    ),
    assetKinds: strings(value?.assetKinds).filter(
      (kind): kind is "component" | "web-content" =>
        kind === "component" || kind === "web-content",
    ),
    sort: value?.sort === "workspace" ? "workspace" : "name",
    pinned: strings(value?.pinned, [`panel:${HOME_ID}`, `panel:${BROWSER_ID}`]),
    excluded: strings(value?.excluded),
  };
}

/** Resolve a saved filter against live workspace content, dropping missing references naturally. */
export function navigationItems(
  items: WorkspaceSearchItem[],
  filter: NavigationFilter,
  matches: (item: WorkspaceSearchItem, query: string) => boolean,
): WorkspaceSearchItem[] {
  const query = parseWorkspaceQuery(filter.query);
  const available = items.filter((item) => !filter.excluded.includes(item.id));
  const pins = filter.pinned.flatMap(
    (id) => available.find((item) => item.id === id) ?? [],
  );
  const results = available.filter(
    (item) =>
      !filter.pinned.includes(item.id) &&
      filter.kinds.includes(item.kind) &&
      (item.kind !== "assets" ||
        !filter.assetKinds.length ||
        (!!item.assetKind && filter.assetKinds.includes(item.assetKind))) &&
      (query.scope === "all" ||
        query.scope === "search" ||
        query.scope === item.kind) &&
      matches(item, query.text),
  );
  if (filter.sort === "name")
    results.sort((a, b) => a.label.localeCompare(b.label));
  return [...pins, ...results];
}

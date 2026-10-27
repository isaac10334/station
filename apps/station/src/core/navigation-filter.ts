import type { SearchKind, WorkspaceSearchItem } from "./workspace-query";
import { parseWorkspaceQuery } from "./workspace-query";
import { BROWSER_ID, HOME_ID } from "./dock-identities";
import { z } from 'zod';
/** Reusable Navigation configuration omits live selection. */
export const navigationDefinitionSchema=z.object({presentation:z.enum(['list','tree','compact']),filter:z.object({query:z.string().max(2000),kinds:z.array(z.enum(['assets','panels'])).max(2),assetKinds:z.array(z.enum(['component','web-content','theme','package','widget-definition','desk-template','svg','decision','data-source','script','custom','markdown','note'])).max(16),sort:z.enum(['name','workspace']),pinned:z.array(z.string().max(160)).max(128),excluded:z.array(z.string().max(160)).max(128)}).strict()}).strict();

/** Saved per workspace. Pins bypass filters; exclusions always win until restored. */
export type NavigationFilter = {
  query: string;
  kinds: SearchKind[];
  assetKinds: ("component" | "web-content" | "theme" | "package" | "widget-definition" | "desk-template" | "svg" | "decision" | "data-source" | "script" | "custom" | "markdown" | "note")[];
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
      (kind): kind is "component" | "web-content" | "theme" | "package" | "widget-definition" | "desk-template" | "svg" | "decision" | "data-source" | "script" | "custom" | "markdown" | "note" =>
        kind === "component" ||
        kind === "web-content" ||
        kind === "theme" ||
        kind === "package" || kind === "widget-definition" || kind === "desk-template" || kind === "svg" || kind === "decision" || kind === "data-source" || kind === "script" || kind === "custom" || kind === "markdown" || kind === "note",
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

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
  assetKind?: import("./asset-state").Asset["kind"];
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


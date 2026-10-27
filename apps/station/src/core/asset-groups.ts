/** Organizational metadata only. Membership never changes an asset ID or source reference. */
export type AssetGroup = { id: string; name: string; parentId: string | null; assetIds: string[] };
export const BUILTIN_GROUP_ID = "station:builtins";

/** Atomic identity membership edits; virtual groups and foreign assets reject writes. */
export function moveAssetGroupMembers(groups: AssetGroup[], assetIds: readonly string[], ids: string[], groupId: string | null): AssetGroup[] {
  if (groupId !== null && !groups.some(g => g.id === groupId)) throw new Error("Choose an editable asset group");
  if (!ids.length || ids.some(id => !assetIds.includes(id) || id.startsWith("builtin:"))) throw new Error("Only authored workspace assets can be grouped");
  return groups.map(g => ({ ...g, assetIds: [...g.assetIds.filter(id => !ids.includes(id)), ...(g.id === groupId ? [...new Set(ids)] : [])] }));
}

/** Repair imported metadata, dropping cycles, unknown memberships and duplicate placement. */
export function normalizeAssetGroups(value: unknown, assetIds: readonly string[]): AssetGroup[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(assetIds), seen = new Set<string>(), placed = new Set<string>();
  const groups: AssetGroup[] = [];
  for (const item of value) {
    if (!item || typeof item.id !== "string" || item.id === BUILTIN_GROUP_ID || seen.has(item.id) || typeof item.name !== "string" || !item.name.trim()) continue;
    seen.add(item.id);
    groups.push({ id: item.id, name: item.name.trim(), parentId: typeof item.parentId === "string" ? item.parentId : null,
      assetIds: Array.isArray(item.assetIds) ? item.assetIds.filter((id: unknown): id is string => {
        if (typeof id !== "string" || !known.has(id) || placed.has(id)) return false;
        placed.add(id); return true;
      }) : [] });
  }
  const byId = new Map(groups.map(group => [group.id, group]));
  for (const group of groups) {
    const ancestors = new Set([group.id]);
    let parent = group.parentId;
    while (parent) {
      if (!byId.has(parent) || ancestors.has(parent)) { group.parentId = null; break; }
      ancestors.add(parent); parent = byId.get(parent)!.parentId;
    }
  }
  return groups;
}

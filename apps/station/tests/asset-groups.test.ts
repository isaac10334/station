import { expect, test } from "bun:test";
import { normalizeAssetGroups, BUILTIN_GROUP_ID } from "../src/core/asset-groups";
import { createStore } from "../src/features/workspace/application/store";

test("groups repair cycles and duplicate membership without changing asset identity", () => {
  const groups = normalizeAssetGroups([
    { id: "a", name: "One", parentId: "b", assetIds: ["asset", "missing"] },
    { id: "b", name: "Two", parentId: "a", assetIds: ["asset"] },
    { id: "c", name: "Three", parentId: "missing", assetIds: [] },
    { id: BUILTIN_GROUP_ID, name: "Spoofed built-ins", assetIds: ["asset"] },
  ], ["asset"]);
  expect(groups).toHaveLength(3);
  expect(groups[0]).toEqual({ id: "a", name: "One", parentId: null, assetIds: ["asset"] });
  expect(groups[1].assetIds).toEqual([]);
  expect(groups[2].parentId).toBeNull();
});

test("workspace group membership survives reload and leaves source and IDs unchanged", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createStore(storage);
  const asset = structuredClone(store.active().assets[0]);
  store.setAssetGroups([{ id: "research", name: "Research", parentId: null, assetIds: [asset.id] }]);
  const restored = createStore(storage).active();
  expect(restored.assetGroups?.[0].assetIds).toEqual([asset.id]);
  expect(restored.assets[0]).toEqual(asset);
  store.setAssetGroups([]);
  expect(store.active().assets[0]).toEqual(asset);
});

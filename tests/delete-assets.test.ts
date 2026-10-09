import { expect, test } from "bun:test";
import { createStore } from "../src/model";
import { panelSurface } from "../src/docking/core";

test("deleting selected Components removes their data and open views together", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createStore(storage);
  const first = store.createAsset("First");
  const second = store.createAsset("Second");
  store.dispatchDock({ type: "openAsset", assetId: first });
  store.dispatchDock({ type: "openAsset", assetId: second });
  store.dispatchDock({ type: "maximize", panelId: `asset-view:${second}` });

  expect(store.deleteAssets([first, second, first, "missing"])).toBe(2);
  const active = store.active();
  expect(active.assets.map((asset) => asset.id)).toEqual(["greeting"]);
  expect(active.selectedAssetId).toBe("greeting");
  expect(panelSurface(active.dock, `asset-view:${first}`)).toBeNull();
  expect(panelSurface(active.dock, `asset-view:${second}`)).toBeNull();
  expect(active.dock.panels[`asset-view:${first}`]).toBeUndefined();
  expect(active.dock.panels[`asset-view:${second}`]).toBeUndefined();
  expect(active.dock.maximized).toBeNull();
  expect(createStore(storage).active().assets.map((asset) => asset.id)).toEqual(["greeting"]);
});

test("the bundled sample can be deleted, leaving an empty workspace", () => {
  const storage = { getItem: () => null, setItem: () => {} };
  const store = createStore(storage);
  expect(store.deleteAssets(["greeting"])).toBe(1);
  expect(store.active().assets).toEqual([]);
  expect(store.active().selectedAssetId).toBeNull();
  expect(store.deleteAssets(["greeting"])).toBe(0);
});

test("a completed build cannot attach to a recreated Component with the same source", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const id = store.createAsset("Repeat");
  const original = store.selected()!;
  const source = { id, revision: original.revision, files: { ...original.files } };
  store.deleteAssets([id]);
  expect(store.createAsset("Repeat")).toBe(id);
  const artifact = { id, revision: source.revision, sourceSha256: "a".repeat(64), sha256: "b".repeat(64), bytes: 10, builtBy: "vercel-sandbox" as const };
  expect(store.installArtifact(store.active().id, source, artifact, original.instanceId)).toBe(false);
  expect(store.selected()?.artifact).toBeNull();
});

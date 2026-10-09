import { expect, test } from "bun:test";
import { createStore, HOST_LOG } from "../src/model";
import type { BuiltArtifact } from "../src/build-contract";
import { BROWSER_ID, migrateDock, panelSurface, validateDock } from "../src/docking/core";

test("legacy content and dock references migrate while source, grants and artifacts stay identical", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const original = createStore(storage);
  const component = original.selected()!;
  if (component.kind !== "component") throw new Error("Expected sample Component");
  const artifact: BuiltArtifact = { schemaVersion: 2, buildId: crypto.randomUUID(), id: component.id, revision: component.revision,
    sourceSha256: "a".repeat(64), witSha256: "b".repeat(64), sha256: "c".repeat(64), bytes: 123,
    builtBy: "vercel-sandbox", profile: "component-model-0.3", worldDigest: "sha256:fixture",
    imports: ["unit:workspace/host@0.3.0"], toolchain: "fixture", snapshotId: "fixture", translatorSha256: "d".repeat(64) };
  original.installArtifact(original.active().id, { id: component.id, revision: component.revision, files: component.files }, artifact, component.instanceId);
  original.setGrant("greeting", HOST_LOG, true);
  const webId = original.createWebAsset("Old document");
  const html = '<p>unit unitId unit-browser asset</p>';
  original.editWebHtml(webId, html);
  original.dispatchDock({ type: "openAsset", assetId: "greeting" });
  original.dispatchDock({ type: "openAsset", assetId: webId });
  original.dispatchDock({ type: "createWebWidget", assetId: webId });
  original.dispatchDock({ type: "maximize", panelId: `asset-view:${webId}` });
  const prior = JSON.parse(values.get("unit-workspace.v4")!);
  const workspace = prior.workspaces[0];
  // Fixture metadata matches the old persisted vocabulary. Authored content is untouched.
  workspace.units = workspace.assets;
  delete workspace.assets;
  workspace.selectedUnitId = workspace.selectedAssetId;
  delete workspace.selectedAssetId;
  workspace.dock = JSON.parse(JSON.stringify(workspace.dock).replaceAll('"asset"', '"unit"').replaceAll('"assetId"', '"unitId"').replaceAll("asset-view:", "unit-view:").replaceAll("asset-browser", "unit-browser"));
  const sources = structuredClone(workspace.units);
  values.set("unit-workspace.v4", JSON.stringify(prior));

  const store = createStore(storage);
  expect(store.active().assets).toEqual(sources);
  expect(store.active().assets.find((asset) => asset.kind === "component")?.artifact).toEqual(artifact);
  expect(store.active().selectedAssetId).toBe(webId);
  expect(store.active().dock.panels[`asset-view:${webId}`]).toMatchObject({ kind: "asset", assetId: webId });
  expect(store.active().dock.maximized).toBe(`asset-view:${webId}`);
  expect(panelSurface(store.active().dock, BROWSER_ID)).toBe("bottom");
  expect(validateDock(store.active().dock)).toBeNull();
  expect(migrateDock(store.active().dock)).toEqual(store.active().dock);
  // New commands reuse migrated views and persist only current model fields.
  const count = Object.keys(store.active().dock.panels).length;
  store.dispatchDock({ type: "openAsset", assetId: webId });
  expect(Object.keys(store.active().dock.panels)).toHaveLength(count);
  const persisted = JSON.parse(values.get("unit-workspace.v4")!).workspaces[0];
  expect(persisted.units).toBeUndefined();
  expect(persisted.selectedUnitId).toBeUndefined();
  expect(createStore(storage).active().assets).toEqual(sources);
});

test("legacy flat docks recognize the renamed browser and explicit empty selection survives", () => {
  const migrated = migrateDock({ sidebar: ["unit-browser"], bottom: [] });
  expect(panelSurface(migrated, BROWSER_ID)).toBe("sidebar");
  expect(validateDock(migrated)).toBeNull();
  const store = createStore({ getItem: (key) => key === "unit-workspace.v4" ? JSON.stringify({
    activeWorkspaceId: "empty", workspaces: [{ id: "empty", name: "Empty", description: "", units: [], selectedUnitId: null, dock: migrated }],
  }) : null, setItem: () => {} });
  expect(store.active().assets).toEqual([]);
  expect(store.active().selectedAssetId).toBeNull();
});

test("legacy floating and nested views keep their locations and browser tab references", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const layoutId = Object.values(store.active().dock.panels).find((panel) => panel.kind === "widget" && panel.widget === "stack")!.id;
  store.dispatchDock({ type: "createAssetView", assetId: "greeting", id: "nested", target: { surface: "dashboard", ownerId: layoutId, intent: "append" } });
  store.dispatchDock({ type: "openAsset", assetId: "greeting" });
  store.dispatchDock({ type: "float", panelId: "asset-view:greeting", x: 42, y: 51 });
  const legacy = JSON.parse(JSON.stringify(store.active().dock).replaceAll('"asset"', '"unit"').replaceAll('"assetId"', '"unitId"').replaceAll("asset-view:", "unit-view:").replaceAll("asset-browser", "unit-browser"));
  const migrated = migrateDock(legacy);
  expect(migrated.floating["asset-view:greeting"]).toMatchObject({ x: 42, y: 51 });
  expect(migrated.panels.nested).toMatchObject({ kind: "asset", assetId: "greeting" });
  expect(panelSurface(migrated, "nested")).toBe("dashboard");
  expect(validateDock(migrated)).toBeNull();
  expect(migrateDock(migrated)).toEqual(migrated);
});

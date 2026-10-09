import { expect, test } from "bun:test";
import { createDockLayout, reduceDock, migrateDock, descendants, panelSlot, findNode, validateDock, type DockLayout, type Command } from "../src/docking/core";
import { createStore } from "../src/model";

function apply(layout: DockLayout, command: Command) {
  const result = reduceDock(layout, command);
  if (!result.ok) throw new Error(result.reason);
  return result.layout;
}
const dashboard = { surface: "dashboard", intent: "append" } as const;
test("side dock width migrates, clamps, persists, and supports layout undo", () => {
  const storage = new Map<string, string>();
  const backing = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } };
  const store = createStore(backing);
  expect(store.active().dock.sidebarWidth).toBe(310);
  store.dispatchDock({ type: "resizeSidebar", width: 412 });
  expect(createStore(backing).active().dock.sidebarWidth).toBe(412);
  store.undoLayout();
  expect(store.active().dock.sidebarWidth).toBe(310);
  store.redoLayout();
  expect(store.active().dock.sidebarWidth).toBe(412);
  expect(apply(store.active().dock, { type: "resizeSidebar", width: 999 }).sidebarWidth).toBe(520);
  const legacy = { ...store.active().dock } as Partial<DockLayout>;
  delete legacy.sidebarWidth;
  expect(migrateDock(legacy).sidebarWidth).toBe(310);
  expect(reduceDock(store.active().dock, { type: "resizeSidebar", width: NaN }).ok).toBe(false);
});
test("docking inspector is an ordinary movable instance retained by layout recovery", () => {
  let dock = createDockLayout([]);
  dock = apply(dock, { type: "createWidget", widget: "stack", id: "layout", target: dashboard });
  dock = apply(dock, { type: "createWidget", widget: "docking-inspector", id: "inspector", target: { ...dashboard, ownerId: "layout" } });
  const restored = migrateDock(JSON.parse(JSON.stringify(dock)));
  expect(restored.panels.inspector).toMatchObject({ widget: "docking-inspector" });
  expect(descendants(restored, "layout")).toContain("inspector");
  dock = apply(restored, { type: "float", panelId: "inspector" });
  expect(dock.floating.inspector).toBeDefined();
  dock = apply(dock, { type: "dockFloat", panelId: "inspector" });
  expect(validateDock(dock)).toBeNull();
  dock = apply(dock, { type: "close", panelId: "inspector" });
  expect(dock.panels.inspector).toBeUndefined();
});
test("additional editor instances share source; removal keeps content; content deletion removes all views", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createStore(storage);
  const id = store.createAsset("Multiple views");
  store.dispatchDock({ type: "createAssetView", assetId: id, id: "editor-a", target: dashboard });
  store.dispatchDock({ type: "createAssetView", assetId: id, id: "editor-b", target: dashboard });
  store.editFile(id, "src/lib.rs", "// shared source\n");
  const reloaded = createStore(storage);
  expect(reloaded.active().dock.panels["editor-a"]).toMatchObject({ assetId: id });
  expect(reloaded.active().dock.panels["editor-b"]).toMatchObject({ assetId: id });
  expect(reloaded.active().assets.find((asset) => asset.id === id)).toMatchObject({ files: { "src/lib.rs": "// shared source\n" }, revision: 1 });
  reloaded.dispatchDock({ type: "close", panelId: "editor-a" });
  expect(reloaded.active().assets.some((asset) => asset.id === id)).toBe(true);
  reloaded.deleteAssets([id]);
  expect(reloaded.active().dock.panels["editor-b"]).toBeUndefined();
  expect(reloaded.dispatchDock({ type: "createAssetView", assetId: id, target: dashboard }).ok).toBe(false);
});
test("appending after a whole-dashboard split retains every placed instance", () => {
  let dock = createDockLayout(["clock"]);
  dock = apply(dock, { type: "createWidget", widget: "snake", id: "right", target: { surface: "dashboard", nodeId: dock.surfaces.dashboard!.id, intent: "right" } });
  dock = apply(dock, { type: "createWidget", widget: "clock", id: "appended", target: dashboard });
  expect(validateDock(dock)).toBeNull();
  expect(panelSlot(dock, "right")).not.toBeNull();
  expect(panelSlot(dock, "appended")).not.toBeNull();
});
test("a floating position commit has one independent undo step", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  store.dispatchDock({ type: "createWidget", widget: "clock", id: "float", target: dashboard });
  store.dispatchDock({ type: "float", panelId: "float" });
  store.dispatchDock({ type: "moveFloat", panelId: "float", x: 300, y: 100 });
  expect(store.active().dock.floating.float).toMatchObject({ x: 300, y: 100 });
  store.undoLayout();
  expect(store.active().dock.floating.float).toMatchObject({ x: 80, y: 80 });
  store.redoLayout();
  expect(store.active().dock.floating.float).toMatchObject({ x: 300, y: 100 });
});
test("Layout children share identity, configuration, placement, migration and cycle checks", () => {
  let dock = apply(createDockLayout([]), { type: "createWidget", widget: "stack", id: "parent", target: dashboard });
  const target = { surface: "dashboard", ownerId: "parent", nodeId: dock.containers.parent.id, intent: "tab" } as const;
  dock = apply(dock, { type: "createWidget", widget: "stack", id: "child", target });
  dock = apply(dock, { type: "configureWidget", panelId: "child", tone: "slate", stackMode: "tabs" });
  const rejection = reduceDock(dock, { type: "move", panelId: "parent", target: { ...target, ownerId: "child", nodeId: dock.containers.child.id } });
  expect(rejection.ok).toBe(false); expect(rejection.layout).toBe(dock);
  expect(descendants(dock, "parent")).toEqual(["child"]);
  expect(panelSlot(dock, "child")?.target.ownerId).toBe("parent");
  const saved = migrateDock(JSON.parse(JSON.stringify(dock)));
  expect(descendants(saved, "parent")).toEqual(["child"]);
  dock = apply(saved, { type: "move", panelId: "child", target: dashboard });
  expect(descendants(dock, "parent")).toEqual([]);
  expect(dock.panels.child).toMatchObject({ tone: "slate", stackMode: "tabs" });
  expect(Object.keys(dock.panels).filter((id) => id === "child")).toHaveLength(1);
});
test("empty backing slots survive moves/reload; split ratios are normalized; slot removal is explicit", () => {
  let dock = apply(createDockLayout([]), { type: "createWidget", widget: "clock", id: "clock", target: dashboard });
  const slot = panelSlot(dock, "clock")!.node;
  dock = apply(dock, { type: "splitSlot", nodeId: slot.id, axis: "vertical" });
  dock = apply(dock, { type: "move", panelId: "clock", target: { surface: "bottom", intent: "tab" } });
  expect(findNode(migrateDock(dock), slot.id)).toMatchObject({ tabs: [], keepEmpty: true });
  expect(reduceDock(dock, { type: "removeSlot", nodeId: "stack:bottom" }).ok).toBe(false);
  dock = apply(dock, { type: "removeSlot", nodeId: slot.id });
  expect(findNode(dock, slot.id)).toBeNull();
});
test("occupied-slot swap changes both placements atomically, preserving instances and geometry", () => {
  let dock = createDockLayout(["clock", "snake"]);
  const ids = Object.keys(dock.panels).filter((id) => id.startsWith("widget:"));
  const source = panelSlot(dock, ids[0])!, destination = panelSlot(dock, ids[1])!;
  const geometry = (dock.surfaces.dashboard as any).cells.map((cell: any) => cell.id);
  dock = apply(dock, { type: "move", panelId: ids[0], target: { ...destination.target, intent: "swap" } });
  expect(panelSlot(dock, ids[0])!.node.id).toBe(destination.node.id);
  expect(panelSlot(dock, ids[1])!.node.id).toBe(source.node.id);
  expect((dock.surfaces.dashboard as any).cells.map((cell: any) => cell.id)).toEqual(geometry);
});
test("container removal promotes children and undo restores the complete subtree", () => {
  const values = new Map<string, string>();
  const store = createStore({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } });
  store.dispatchDock({ type: "createWidget", widget: "stack", id: "parent", target: dashboard });
  store.dispatchDock({ type: "createWidget", widget: "snake", id: "child", target: { surface: "dashboard", ownerId: "parent", nodeId: store.active().dock.containers.parent.id, intent: "tab" } });
  store.dispatchDock({ type: "close", panelId: "parent" });
  expect(panelSlot(store.active().dock, "child")?.target.ownerId).toBeUndefined();
  expect(store.undoLayout()).toBe(true);
  expect(descendants(store.active().dock, "parent")).toEqual(["child"]);
  expect(store.redoLayout()).toBe(true);
  expect(store.active().dock.panels.parent).toBeUndefined();
});
test("nested slots work in a dock and a float with the same children and ratios", () => {
  let dock = apply(createDockLayout([]), { type: "createWidget", widget: "stack", id: "layout", target: { surface: "sidebar", intent: "tab" } });
  dock = apply(dock, { type: "splitSlot", nodeId: dock.containers.layout.id, axis: "vertical" });
  const split = dock.containers.layout;
  if (split.kind !== "split") throw new Error("Expected split");
  dock = apply(dock, { type: "createWebWidget", assetId: "web", id: "web-widget", target: { surface: "sidebar", ownerId: "layout", nodeId: split.first.id, intent: "tab" } });
  dock = apply(dock, { type: "float", panelId: "layout" });
  dock = apply(dock, { type: "activate", panelId: "web-widget" });
  dock = apply(dock, { type: "resizeSplit", nodeId: split.id, ratio: .123456 });
  expect(findNode(dock, split.id)).toMatchObject({ ratio: .2 });
  expect(validateDock(dock)).toBeNull();
  expect(descendants(migrateDock(dock), "layout")).toEqual(["web-widget"]);
  dock = apply(dock, { type: "move", panelId: "web-widget", target: dashboard });
  expect(descendants(dock, "layout")).toEqual([]);
});
test("a swap rejects the reverse policy direction and preserves the exact document", () => {
  let dock = apply(createDockLayout(["clock"]), { type: "createWidget", widget: "clock", id: "main-clock", target: { surface: "main", nodeId: "stack:main", intent: "right" } });
  const clock = Object.keys(dock.panels).find((id) => id.startsWith("widget:"))!;
  const target = { surface: "main", nodeId: "stack:main", intent: "swap" } as const;
  const result = reduceDock(dock, { type: "move", panelId: clock, target });
  expect(result.ok).toBe(false); expect(result.layout).toBe(dock);
});
test("whole dashboard splits and malformed ownership survive repair without lost instances", () => {
  let dock = createDockLayout(["stack", "clock"]);
  dock = apply(dock, { type: "createWidget", id: "outside", widget: "snake", target: { surface: "dashboard", intent: "right" } });
  expect(migrateDock(dock).surfaces.dashboard?.kind).toBe("split");
  const owner = Object.keys(dock.containers)[0];
  const corrupt = structuredClone(dock);
  corrupt.containers[owner] = { kind: "stack", id: "corrupt", active: owner, tabs: [owner, "workspace-home", "outside"] };
  const restored = migrateDock(corrupt);
  expect(validateDock(restored)).toBeNull();
  expect(Object.keys(restored.panels)).toEqual(Object.keys(dock.panels));
});


test("Asset browser moves through main, dashboard and Layout slots without losing identity", () => {
  let dock = createDockLayout([]);
  dock = apply(dock, { type: "move", panelId: "asset-browser", target: { surface: "main", intent: "tab" } });
  expect(dock.surfaces.bottom).toMatchObject({ kind: "stack", tabs: [], keepEmpty: true });
  dock = migrateDock(JSON.parse(JSON.stringify(dock)));
  expect(panelSlot(dock, "asset-browser")?.target.surface).toBe("main");
  expect(dock.surfaces.bottom).toMatchObject({ tabs: [], keepEmpty: true });
  dock = apply(dock, { type: "move", panelId: "asset-browser", target: dashboard });
  dock = apply(dock, { type: "createWidget", widget: "stack", id: "browser-layout", target: dashboard });
  dock = apply(dock, { type: "move", panelId: "asset-browser", target: { ...dashboard, ownerId: "browser-layout", nodeId: dock.containers["browser-layout"].id, intent: "tab" } });
  dock = migrateDock(JSON.parse(JSON.stringify(dock)));
  expect(descendants(dock, "browser-layout")).toContain("asset-browser");
  dock = apply(dock, { type: "close", panelId: "browser-layout" });
  expect(panelSlot(dock, "asset-browser")?.target.surface).toBe("dashboard");
  expect(reduceDock(dock, { type: "close", panelId: "asset-browser" }).ok).toBe(false);
  dock = apply(dock, { type: "move", panelId: "asset-browser", target: { surface: "bottom", nodeId: dock.surfaces.bottom!.id, intent: "tab" } });
  expect(validateDock(dock)).toBeNull();
});

test("older layouts with the browser elsewhere recover a reusable empty bottom slot", () => {
  const dock = createDockLayout([]);
  const moved = apply(dock, { type: "move", panelId: "asset-browser", target: { surface: "sidebar", intent: "tab" } });
  moved.surfaces.bottom = null;
  const restored = migrateDock(moved);
  expect(restored.surfaces.bottom).toMatchObject({ kind: "stack", tabs: [], keepEmpty: true });
  expect(validateDock(restored)).toBeNull();
});

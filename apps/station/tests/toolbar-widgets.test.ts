import { expect, test } from "bun:test";
import { actionButtonName, actionButtonSchema } from "../src/core/action-buttons";
import { createDockLayout, migrateDock, panelSlot, panelSurface, reduceDock, surfacePanels, validateDock, type Command, type DockLayout } from "../src/core/docking";
import { createStore } from "../src/features/workspace/application/store";
import { deskTemplateAsset, parseDeskTemplate } from "../src/core/desk-templates";
import { TOOLBAR_TOOL_DEFINITIONS } from "../src/core/toolbar-tools";
import { createStationControl } from "../src/features/commands/application/runtime";
import { taskScopeSchema } from "@station/protocol";

function apply(dock: DockLayout, command: Command) {
  const result = reduceDock(dock, command);
  if (!result.ok) throw new Error(result.reason);
  return result.layout;
}
const dashboard = { surface: "dashboard", intent: "append" } as const;
const toolbar = { surface: "toolbar", intent: "append" } as const;

test("empty labels retain independent tooltips and accessible names", () => {
  const config = actionButtonSchema.parse({ label: "", tooltip: "Show assets" });
  expect(actionButtonName(config)).toBe("Show assets");
  expect(actionButtonName({ ...config, tooltip: "" }, "Asset toggle")).toBe("Asset toggle");
  expect(actionButtonName({ ...config, tooltip: "" })).toBe("Open target tab");
  expect(actionButtonSchema.safeParse({ label: "x".repeat(81) }).success).toBe(false);
});

test("toolbar placement moves one instance, reorders, retains identity and rejects incompatible widgets", () => {
  let dock = createDockLayout([]);
  dock = apply(dock, { type: "createWidget", id: "first", widget: "action-button", target: dashboard });
  expect(surfacePanels(dock, "toolbar")).toEqual([]);
  const instance = dock.panels.first;
  dock = apply(dock, { type: "move", panelId: "first", target: toolbar });
  expect(dock.panels.first).toBe(instance);
  expect(surfacePanels(dock, "dashboard")).not.toContain("first");
  expect(surfacePanels(dock, "toolbar")).toEqual(["first"]);
  dock = apply(dock, { type: "createWidget", id: "second", widget: "action-button", target: toolbar });
  dock = apply(dock, { type: "move", panelId: "second", target: { ...toolbar, intent: "tab", nodeId: dock.surfaces.toolbar!.id, index: 0 } });
  expect(surfacePanels(dock, "toolbar")).toEqual(["second", "first"]);
  expect(migrateDock(JSON.parse(JSON.stringify(dock))).surfaces.toolbar).toEqual(dock.surfaces.toolbar);
  const rejected = reduceDock(dock, { type: "createWidget", widget: "clock", target: toolbar });
  expect(rejected.ok).toBe(false);
  expect(rejected.layout).toBe(dock);
  expect(reduceDock(dock, { type: "visibility", surface: "toolbar", hidden: true }).ok).toBe(false);
  dock = apply(dock, { type: "move", panelId: "first", target: dashboard });
  expect(dock.panels.first).toBe(instance);
  expect(panelSurface(dock, "first")).toBe("dashboard");
  expect(validateDock(dock)).toBeNull();
});

test("legacy explicit pins migrate once; unpinned instances stay in place and old templates load", () => {
  let dock = apply(createDockLayout([]), { type: "createWidget", id: "pinned", widget: "action-button", target: dashboard, defaults: { actionButton: actionButtonSchema.parse({ pinned: true }) } });
  dock = apply(dock, { type: "createWidget", id: "ordinary", widget: "action-button", target: dashboard });
  const legacy = structuredClone(dock) as any;
  legacy.version = 4;
  delete legacy.surfaces.toolbar;
  const migrated = migrateDock(legacy);
  expect(panelSurface(migrated, "pinned")).toBe("toolbar");
  expect(panelSurface(migrated, "ordinary")).toBe("dashboard");
  expect(migrated.panels.pinned.actionButton?.pinned).toBeUndefined();
  expect(validateDock(migrated)).toBeNull();
  expect(migrateDock(migrated)).toEqual(migrated);
  const source = JSON.stringify({ version: 1, title: "Old desk", setup: { dock: legacy } });
  expect(parseDeskTemplate(source).setup.dock.version).toBe(5);
});

test("toolbar movement and settings survive undo, reload, cloning and templates", () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  const store = createStore(storage);
  store.dispatchDock({ type: "createWidget", id: "button", widget: "action-button", target: dashboard });
  store.dispatchDock({ type: "configureActionButton", panelId: "button", config: actionButtonSchema.parse({ label: "", tooltip: "My action" }) });
  const original = panelSlot(store.active().dock, "button")!.node.id;
  store.dispatchDock({ type: "move", panelId: "button", target: toolbar });
  store.undoLayout();
  expect(panelSlot(store.active().dock, "button")?.node.id).toBe(original);
  store.redoLayout();
  const reloaded = createStore(storage);
  expect(surfacePanels(reloaded.active().dock, "toolbar")).toEqual(["button"]);
  expect(reloaded.active().dock.panels.button.actionButton).toMatchObject({ label: "", tooltip: "My action" });
  const asset = deskTemplateAsset("Toolbar", reloaded.desk());
  expect(parseDeskTemplate(asset.files["desk.json"]).setup.dock.surfaces.toolbar).toMatchObject({ tabs: ["button"] });
  expect(Object.values(TOOLBAR_TOOL_DEFINITIONS).every(item => item.protected && !item.listed)).toBe(true);
  reloaded.createDesk("Clone", true);
  const clones = surfacePanels(reloaded.active().dock, "toolbar");
  expect(clones).toHaveLength(1);
  expect(clones[0]).not.toBe("button");
  expect(reloaded.active().dock.panels[clones[0]].actionButton?.tooltip).toBe("My action");
  expect(reloaded.dispatchDock({ type: "close", panelId: clones[0] }).ok).toBe(true);
  expect(validateDock(reloaded.active().dock)).toBeNull();
  expect(reloaded.active().dock.surfaces.toolbar).toMatchObject({ kind: "stack", tabs: [], keepEmpty: true });
});

test("external placement requires both source and toolbar authority; target configuration is separately scoped", () => {
  const values = new Map<string, string>();
  const store = createStore({ getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } });
  const control = createStationControl(store);
  try {
    const context = control.issueTask({ name: "Dashboard only", workspaceId: store.active().id, scope: taskScopeSchema.parse({ operations: ["dock.apply"], surfaces: ["dashboard"] }) });
    control.executeFor(context, { method: "dock.apply", version: control.version(), params: { type: "createWidget", id: "task-action", widget: "action-button", target: dashboard } });
    const before = store.active().dock;
    expect(() => control.executeFor(context, { method: "dock.apply", version: control.version(), params: { type: "move", panelId: "task-action", target: toolbar } })).toThrow();
    expect(store.active().dock).toBe(before);
    const allowed = control.issueTask({ name: "Toolbar placement", workspaceId: store.active().id, scope: taskScopeSchema.parse({ operations: ["dock.apply"], surfaces: ["dashboard", "toolbar"] }) });
    control.executeFor(allowed, { method: "dock.apply", version: control.version(), params: { type: "move", panelId: "task-action", target: toolbar } });
    expect(panelSurface(store.active().dock, "task-action")).toBe("toolbar");
    expect(() => control.executeFor(allowed, { method: "dock.apply", version: control.version(), params: { type: "configureActionButton", panelId: "task-action", config: { label: "", targetId: "asset-browser" } } })).toThrow();
    expect(store.active().dock.panels["task-action"].actionButton).toBeUndefined();
    expect(() => control.executeFor(allowed, { method: "dock.apply", version: control.version(), params: { type: "configureActionButton", panelId: "task-action", config: { action: "assets.open", assetId: "greeting" } } })).toThrow();
    expect(actionButtonSchema.safeParse({ action: "scripts.run", inputJson: "invalid" }).success).toBe(false);
  } finally { control.dispose(); }
});

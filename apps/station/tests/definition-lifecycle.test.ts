import { expect, test } from "bun:test";
import { createStore } from "../src/features/workspace/application/store";
import { parseWidgetRecipe } from "../src/core/widget-definitions";
import { bindAuthoredSurface, BUILTIN_AUTHORED_SURFACES } from "../src/core/authored-surface";
import { reconcileDefinitionDefaults } from "../src/core/definition-snapshot";
import { createDockLayout, migrateDock, reduceDock } from "../src/core/docking";
import { editSurface, moveSurfaceNode } from "../src/core/surface-authoring";
import { createStationControl } from "../src/features/commands/application/runtime";
import { taskScopeSchema } from "@station/protocol";

const dashboard = { surface: "dashboard", intent: "append" } as const;
test("three converted sources bind data without execution and reject incompatible wiring", () => {
  for (const surface of Object.values(BUILTIN_AUTHORED_SURFACES).filter(surface => surface.controller !== "ai-chat")) {
    expect(JSON.parse(JSON.stringify(surface))).toEqual(surface);
    expect(() => bindAuthoredSurface(surface, {})).toThrow("Controller input unavailable");
  }
  expect(bindAuthoredSurface(BUILTIN_AUTHORED_SURFACES.clock, { date: "Today", time: "12:00", zone: "UTC", error: "" }).root.children?.[1].text).toBe("12:00");
  expect(() => parseWidgetRecipe(JSON.stringify({ version: 1, widget: "clock", title: "Wrong controller", defaults: { surface: BUILTIN_AUTHORED_SURFACES.weather } }))).toThrow("controller");
});

test("definition source changes stay inert; explicit updates reconcile overrides and survive source loss/reload", () => {
  const store = createStore({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
  const definitionId = store.forkWidgetDefinition("builtin:clock");
  let source = store.active().assets.find(a => a.id === definitionId)!;
  const recipe = parseWidgetRecipe(source.files!["widget.json"]);
  store.patchFiles(definitionId, source.revision, { "widget.json": JSON.stringify({ ...recipe, defaults: { ...recipe.defaults, displayName: "Source A", tone: "blue" } }) });
  const placed = store.dispatchDock({ type: "createWidget", widget: "clock", definitionId, target: dashboard });
  expect(placed.ok).toBe(true);
  const id = placed.panelId!;
  const original = store.active().dock.panels[id];
  store.dispatchDock({ type: "configurePanel", panelId: id, displayName: "My override" });
  source = store.active().assets.find(a => a.id === definitionId)!;
  store.patchFiles(definitionId, source.revision, { "widget.json": JSON.stringify({ ...recipe, defaults: { ...recipe.defaults, displayName: "Source B", tone: "mint" } }) });
  expect(store.active().dock.panels[id].definitionSnapshot).toEqual(original.definitionSnapshot);
  const update = store.dispatchDock({ type: "setWidgetDefinition", panelId: id, widget: "clock", definitionId });
  expect(update.ok).toBe(true);
  expect(store.active().dock.panels[id]).toMatchObject({ displayName: "My override", tone: "mint", id });
  const dock = migrateDock(JSON.parse(JSON.stringify(store.active().dock)));
  expect(dock.panels[id].definitionSnapshot).toEqual(store.active().dock.panels[id].definitionSnapshot);
  store.deleteAssets([definitionId]);
  expect(store.active().dock.panels[id].definitionSnapshot?.recipe.defaults.surface).toBeDefined();
  const failed = store.dispatchDock({ type: "setWidgetDefinition", panelId: id, widget: "clock", definitionId });
  expect(failed.ok).toBe(false);
  expect(store.active().dock.panels[id].id).toBe(id);
  const recoveredId = store.forkWidgetDefinition(definitionId);
  expect(parseWidgetRecipe(store.active().assets.find(asset => asset.id === recoveredId)!.files!["widget.json"]).defaults.surface).toEqual(store.active().dock.panels[id].definitionSnapshot?.recipe.defaults.surface);
});

test("virtual icon references expose source only to scoped readers and never permit writes to defaults", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const control = createStationControl(store);
  const task = control.issueTask({ name: "Icon author", workspaceId: store.active().id, scope: taskScopeSchema.parse({ operations: ["asset.read", "asset.fork", "asset.files.patch"], create: true, readableAssets: ["builtin:icon:Plus"], editableAssets: [], capabilities: [], surfaces: [] }) });
  const context = task;
  expect(() => control.executeFor(context, { method: "asset.read", params: { assetId: "builtin:icon:Plus" } })).not.toThrow();
  const fork = control.executeFor(context, { method: "asset.fork", version: control.version(), params: { assetId: "builtin:icon:Plus", name: "My icon" } }).result;
  expect(fork.id).not.toBe("builtin:icon:Plus");
  expect(() => control.executeFor(context, { method: "asset.read", params: { assetId: "builtin:icon:Check" } })).toThrow();
  expect(() => control.executeFor(context, { method: "asset.files.patch", params: { assetId: "builtin:icon:Plus", expectedAssetRevision: 0, patch: { "image.svg": "changed" } }, version: control.version() })).toThrow();
  expect(store.canEditSource("builtin:icon:Plus")).toBe(false);
  control.dispose();
});

test("nested override reconciliation advances untouched leaves and preserves deletions", () => {
  const old = { actionButton: { label: "Old", tooltip: "Old tip", action: "widgets.add" as const, icon: "Plus" as const, variant: "ghost" as const, fullWidth: false, inputJson: "{}" } };
  const current = structuredClone(old); current.actionButton.label = "Mine";
  const next = structuredClone(old); next.actionButton.tooltip = "New tip";
  expect(reconcileDefinitionDefaults(old, current, next).actionButton).toMatchObject({ label: "Mine", tooltip: "New tip" });
  expect(reconcileDefinitionDefaults({ displayName: "Old" }, {}, { displayName: "New" })).toEqual({});
});

test("invalid reference remapping returns exactly the original graph", () => {
  const dock = createDockLayout([]);
  const result = reduceDock(dock, { type: "createWidget", widget: "stack", target: dashboard, slots: [[{ widget: "navigation", targetRef: { key: "missing" } }]] });
  expect(result.ok).toBe(false);
  expect(result.layout).toBe(dock);
});

test("element edits and composition validate leaves, duplicate keys and cycle denial atomically", () => {
  const source = BUILTIN_AUTHORED_SURFACES.clock;
  expect(editSurface(source, "time", { label: "World clock" }).frame.root.children?.[1].label).toBe("World clock");
  expect(() => moveSurfaceNode(source, "date", "time")).toThrow();
  expect(() => moveSurfaceNode(source, "root", "date")).toThrow();
  expect(() => editSurface(source, "root", { children: [source.frame.root] })).toThrow();
  expect(source.frame.root.children?.[1].label).toBe("Local time");
});

test("compact, expanded and tabbed editor placement retains the same source owner and child selection", () => {
  let dock = createDockLayout([]);
  let result = reduceDock(dock, { type: "openAsset", assetId: "svg-source" });
  expect(result.ok).toBe(true); dock = result.layout;
  const panelId = result.panelId!, panel = dock.panels[panelId];
  for (const command of [{ type: "float", panelId, x: 20, y: 20 }, { type: "resizeFloat", panelId, width: 440, height: 480 }, { type: "dockFloat", panelId, target: { surface: "main", intent: "tab" } }] as const) {
    result = reduceDock(dock, command); expect(result.ok).toBe(true); dock = result.layout;
    expect(dock.panels[panelId]).toBe(panel);
  }
});

test("migration defaults never become false instance overrides during an explicit definition update", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const definitionId = store.forkWidgetDefinition("builtin:stack");
  const definition = store.active().assets.find(asset => asset.id === definitionId)!;
  const recipe = parseWidgetRecipe(definition.files!["widget.json"]);
  const placed = store.dispatchDock({ type: "createWidget", widget: "stack", definitionId, target: dashboard });
  const id = placed.panelId!;
  const restored = migrateDock(JSON.parse(JSON.stringify(store.active().dock)));
  const nextRecipe = { ...recipe, defaults: { chrome: "compact" as const, hideDisplayName: true, stackMode: "carousel" as const } };
  const updated = reduceDock(restored, { type: "setWidgetDefinition", panelId: id, widget: "stack", definitionId, defaults: nextRecipe.defaults, definitionSnapshot: { assetId: definitionId, revision: 1, recipe: nextRecipe } });
  expect(updated.ok).toBe(true);
  expect(updated.layout.panels[id]).toMatchObject(nextRecipe.defaults);
});

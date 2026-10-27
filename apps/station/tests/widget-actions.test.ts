import { expect, test } from "bun:test";
import { createStore } from "../src/features/workspace/application/store";
import { createDockLayout, reduceDock, panelSlot, findNode, migrateDock, descendants, type Command, type DockLayout } from "../src/core/docking";
import { widgetCloseCommand, widgetBulkCloseCommand } from "../src/core/widget-actions";
import { builtinWidgetAssets, forkWidgetRecipe, parseWidgetRecipe } from "../src/core/widget-definitions";

const target = { surface: "dashboard", intent: "append" } as const;
function apply(dock: DockLayout, command: Command) {
  const result = reduceDock(dock, command);
  if (!result.ok) throw new Error(result.reason);
  return result.layout;
}
function store() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { app: createStore(storage), storage };
}

test("Ctrl-close removes a sole slot, falls back for shared tabs and floats, and undoes together", () => {
  const { app } = store();
  app.dispatchDock({ type: "createWidget", id: "one", widget: "clock", target });
  const before = app.active().dock, slot = panelSlot(before, "one")!;
  expect(widgetCloseCommand(before, "one", { removeSlot: true }).type).toBe("closeAndRemoveSlot");
  app.dispatchDock(widgetCloseCommand(before, "one", { removeSlot: true }));
  expect(findNode(app.active().dock, slot.node.id)).toBeNull();
  app.undoLayout();
  expect(panelSlot(app.active().dock, "one")?.node.id).toBe(slot.node.id);
  let dock = apply(app.active().dock, { type: "createWidget", id: "two", widget: "clock", target: { ...slot.target, intent: "tab" } });
  expect(widgetCloseCommand(dock, "one", { removeSlot: true }).type).toBe("close");
  dock = apply(dock, widgetCloseCommand(dock, "one", { removeSlot: true }));
  expect(panelSlot(dock, "two")).toBeDefined();
  dock = apply(dock, { type: "float", panelId: "two" });
  expect(widgetCloseCommand(dock, "two", { removeSlot: true }).type).toBe("close");
});

test("bulk appearance is atomic, rejects an invalid member, and makes one undo entry", () => {
  const { app } = store();
  app.dispatchDock({ type: "createWidget", id: "one", widget: "clock", target });
  app.dispatchDock({ type: "createWidget", id: "two", widget: "weather", target });
  const before = app.active().dock;
  const rejected = app.dispatchDock({ type: "batch", commands: [{ type: "configurePanel", panelId: "one", chrome: "compact" }, { type: "configurePanel", panelId: "missing", chrome: "compact" }] });
  expect(rejected.ok).toBe(false);
  expect(app.active().dock).toBe(before);
  expect(app.dispatchDock({ type: "batch", commands: ["one", "two"].map(panelId => ({ type: "configurePanel", panelId, chrome: "compact" })) }).ok).toBe(true);
  app.undoLayout();
  expect(app.active().dock.panels.one.chrome).toBeUndefined();
  expect(app.active().dock.panels.two.chrome).toBeUndefined();
  expect(reduceDock(before, { type: "batch", commands: [{ type: "createContribution", definitionId: "uninstalled", target }] }).ok).toBe(false);
});

test("Layout row conversion retains children, row size and vertical tab preferences reload", () => {
  let dock = apply(createDockLayout([]), { type: "createWidget", id: "layout", widget: "stack", target });
  dock = apply(dock, { type: "createWidget", id: "child", widget: "clock", target: { ...target, ownerId: "layout" } });
  const child = dock.panels.child, slotId = panelSlot(dock, "child")!.node.id;
  dock = apply(dock, { type: "setLayoutArrangement", panelId: "layout", arrangement: "rows" });
  const root = dock.containers.layout;
  if (root.kind !== "grid") throw new Error("Expected row grid");
  dock = apply(dock, { type: "resizeRow", cellId: root.cells[0].id, height: 488 });
  dock = apply(dock, { type: "configureWidget", panelId: "layout", stackMode: "sidebar" });
  const restored = migrateDock(JSON.parse(JSON.stringify(dock)));
  expect(restored.containers.layout).toMatchObject({ cells: [{ height: 488 }] });
  expect(restored.panels.layout).toMatchObject({ stackMode: "sidebar" });
  dock = apply(dock, { type: "setLayoutArrangement", panelId: "layout", arrangement: "split" });
  expect(panelSlot(dock, "child")?.node.id).toBe(slotId);
  expect(dock.panels.child).toBe(child);
  expect(reduceDock(dock, { type: "resizeRow", cellId: "missing", height: NaN }).ok).toBe(false);
});

test("virtual definitions stay outside storage; forks instantiate snapshots and preserve compatible state", () => {
  const { app, storage } = store();
  const source = builtinWidgetAssets().find(asset => asset.id === "builtin:web-browser")!;
  expect(app.active().assets.some(asset => asset.id === source.id)).toBe(false);
  expect(app.dispatchDock({ type: "openAsset", assetId: source.id }).ok).toBe(true);
  const fork = app.forkWidgetDefinition(source.id);
  app.editFile(fork, "widget.json", JSON.stringify({ ...parseWidgetRecipe(source.files["widget.json"]), title: "Research browser", defaults: { stackMode: "sidebar", chrome: "compact", childWidget: "browser-tab" } }));
  expect(app.dispatchDock({ type: "createWidget", id: "research", widget: "web-browser", definitionId: fork, target }).ok).toBe(true);
  let dock = app.active().dock;
  expect(dock.panels.research).toMatchObject({ definitionId: fork, stackMode: "sidebar", chrome: "compact" });
  const childId = descendants(dock, "research")[0], child = dock.panels[childId];
  const roots = dock.containers;
  app.editFile(fork, "widget.json", JSON.stringify({ ...parseWidgetRecipe(source.files["widget.json"]), title: "Changed recipe", defaults: { chrome: "seamless" } }));
  expect(app.active().dock.panels.research.chrome).toBe("compact");
  expect(app.dispatchDock({ type: "setWidgetDefinition", panelId: "research", widget: "web-browser", definitionId: fork }).ok).toBe(true);
  dock = app.active().dock;
  expect(dock.panels[childId]).toBe(child);
  expect(dock.containers).toBe(roots);
  expect(app.dispatchDock({ type: "setWidgetDefinition", panelId: "research", widget: "clock", definitionId: "builtin:clock" }).ok).toBe(false);
  const restored = createStore(storage).active();
  expect(restored.dock.panels.research).toMatchObject({ definitionId: fork, chrome: "seamless" });
  expect(restored.assets.some(asset => asset.id === source.id)).toBe(false);
  expect(app.deleteAssets([source.id])).toBe(0);
  app.undoLayout();
  expect(Object.values(app.active().dock.panels).some(panel => panel.kind === "asset" && panel.assetId === source.id)).toBe(true);
});

test("recipes reject host code and incompatible defaults; a fork has fresh source identity", () => {
  const builtin = builtinWidgetAssets()[0], fork = forkWidgetRecipe(builtin);
  expect(fork.id).not.toBe(builtin.id);
  expect(fork.instanceId).not.toBe(builtin.instanceId);
  expect(fork.revision).toBe(0);
  expect(() => parseWidgetRecipe(JSON.stringify({ version: 1, widget: "clock", title: "Clock", code: "eval()" }))).toThrow();
  expect(() => parseWidgetRecipe(JSON.stringify({ version: 1, widget: "clock", title: "Clock", defaults: { childWidget: "clock" } }))).toThrow();
});


test("bulk removal drops a shared slot only after its final selected tab closes", () => {
  let dock = apply(createDockLayout([]), { type: "createWidget", id: "one", widget: "clock", target });
  const slot = panelSlot(dock, "one")!;
  dock = apply(dock, { type: "createWidget", id: "two", widget: "clock", target: { ...slot.target, intent: "tab" } });
  dock = apply(dock, widgetBulkCloseCommand(dock, ["one", "two"], { removeSlot: true }));
  expect(findNode(dock, slot.node.id)).toBeNull();
  expect(dock.panels.one).toBeUndefined();
  expect(dock.panels.two).toBeUndefined();
});

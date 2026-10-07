import { expect, test } from "bun:test";
import { createDockLayout, reduceDock, migrateDock, descendants, panelSlot, findNode, type DockLayout, type Command } from "../src/docking/core";
import { createStore } from "../src/model";

function apply(layout: DockLayout, command: Command) {
  const result = reduceDock(layout, command);
  if (!result.ok) throw new Error(result.reason);
  return result.layout;
}
const dashboard = { surface: "dashboard", intent: "append" } as const;
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

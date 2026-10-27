import { expect, test } from "bun:test";
import { createStore } from "../src/features/workspace/application/store";
import {
  findNode,
  panelSlot,
  reduceDock,
  validateDock,
  migrateDock,
} from "../src/core/docking";

test("combined widget/slot removal is one undoable operation and retains authored assets", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  store.dispatchDock({
    type: "createWidget",
    widget: "weather",
    id: "weather",
    target: { surface: "dashboard", intent: "append" },
  });
  const before = store.desk().dock,
    slot = panelSlot(before, "weather")!;
  expect(slot).not.toBeNull();
  store.dispatchDock({ type: "closeAndRemoveSlot", panelId: "weather" });
  expect(store.desk().dock.panels.weather).toBeUndefined();
  expect(findNode(store.desk().dock, slot.node.id)).toBeNull();
  expect(validateDock(store.desk().dock)).toBeNull();
  store.undoLayout();
  expect(store.desk().dock).toEqual(migrateDock(before));
  expect(store.active().assets.length).toBeGreaterThan(0);
});
test("combined removal rejects another tab or a shell panel without changing the document", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  store.dispatchDock({
    type: "createWidget",
    widget: "weather",
    id: "weather",
    target: { surface: "dashboard", intent: "append" },
  });
  const slot = panelSlot(store.desk().dock, "weather")!;
  store.dispatchDock({
    type: "createWidget",
    widget: "clock",
    id: "second",
    target: slot.target,
  });
  store.dispatchDock({
    type: "createWidget",
    widget: "weather",
    id: "weather",
    target: { surface: "dashboard", intent: "append" },
  });
  const before = store.desk().dock,
    result = reduceDock(before, {
      type: "closeAndRemoveSlot",
      panelId: "weather",
    });
  expect(result.ok).toBe(false);
  expect(result.layout).toBe(before);
  expect(
    reduceDock(before, {
      type: "closeAndRemoveSlot",
      panelId: "workspace-home",
    }).ok,
  ).toBe(false);
});

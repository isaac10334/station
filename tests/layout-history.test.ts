import { expect, test } from "bun:test";
import { createStore } from "../src/model";
import { panelSurface, surfacePanels } from "../src/docking/core";

const memory = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test("layout undo/redo restores panel identity and active tab; source edits are separate", () => {
  const store = createStore(memory());
  const id = store.createUnit("History test");
  store.dispatchDock({ type: "openUnit", unitId: id });
  const panelId = `unit-view:${id}`;
  store.dispatchDock({ type: "close", panelId });
  expect(panelSurface(store.active().dock, panelId)).toBeNull();
  expect(store.undoLayout()).toBe(true);
  expect(panelSurface(store.active().dock, panelId)).toBe("main");
  expect(surfacePanels(store.active().dock, "main")).toContain(panelId);
  store.editFile(id, "src/lib.rs", "edited");
  expect(store.selected()?.files["src/lib.rs"]).toBe("edited");
  expect(store.redoLayout()).toBe(true);
  expect(panelSurface(store.active().dock, panelId)).toBeNull();
  expect(store.selected()?.files["src/lib.rs"]).toBe("edited");
});

test("history is per workspace and deleted units cannot return through undo", () => {
  const store = createStore(memory());
  const id = store.createUnit("Gone");
  store.dispatchDock({ type: "openUnit", unitId: id });
  const first = store.active().id;
  store.createWorkspace("Other");
  expect(store.layoutHistory().canUndo).toBe(false);
  store.selectWorkspace(first);
  expect(store.layoutHistory().canUndo).toBe(true);
  store.deleteUnits([id]);
  expect(store.layoutHistory().canUndo).toBe(false);
});

import { expect, test } from "bun:test";
import { createStore } from "../src/features/workspace/application/store";
import { cloneDesk } from "../src/core/desks";
import { reduceDock, validateDock } from "../src/core/docking";
import { shortcutEntrySchema } from "../src/core/shortcuts";
import { widgetFocusBounds } from "../src/ui/docking/focus-bounds";

test("desk controls migrate once into real movable instances and removal survives reload", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createStore(storage), desk = store.desk(), id = desk.toolbarWidgetId!;
  expect(desk.dock.panels[id]).toMatchObject({ kind: "widget", widget: "desk-controls" });
  expect(desk.dock.floating[id].height).toBe(48);
  expect(validateDock(desk.dock)).toBeNull();
  const moved = store.dispatchDock({ type: "moveFloat", panelId: id, x: 340, y: 80 });
  expect(moved.ok).toBe(true);
  expect(createStore(storage).desk().dock.floating[id]).toMatchObject({ x: 340, y: 80, height: 48 });
  const clone = cloneDesk(store.desk(), "Another desk");
  expect(clone.toolbarWidgetId).not.toBe(id);
  expect(clone.dock.panels[clone.toolbarWidgetId!].widget).toBe("desk-controls");
  expect(store.dispatchDock({ type: "close", panelId: id }).ok).toBe(true);
  expect(createStore(storage).desk().dock.panels[id]).toBeUndefined();
  expect(reduceDock(desk.dock, { type: "moveFloat", panelId: id, x: NaN, y: 1 }).ok).toBe(false);
});

test("shortcut presentation remains typed configuration and quick access is bounded on narrow viewports", () => {
  const entry = shortcutEntrySchema.parse({ id: "inspect", label: "Inspect", keys: "mod+alt+i", scope: "workspace", presentation: "quick-access", action: { kind: "widget", assetId: "builtin:docking-inspector" } });
  expect(entry.presentation).toBe("quick-access");
  expect(() => shortcutEntrySchema.parse({ ...entry, presentation: "arbitrary-dom" })).toThrow();
  for (const width of [375, 768, 1440]) {
    const bounds = widgetFocusBounds({ width, height: 812 }, "quick-access");
    expect(bounds.width).toBeLessThanOrEqual(720);
    expect(bounds.x).toBeGreaterThanOrEqual(12);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 12);
  }
});

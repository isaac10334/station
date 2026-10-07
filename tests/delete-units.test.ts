import { expect, test } from "bun:test";
import { createStore } from "../src/model";
import { panelSurface } from "../src/docking/core";

test("deleting selected Components removes their data and open views together", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createStore(storage);
  const first = store.createUnit("First");
  const second = store.createUnit("Second");
  store.dispatchDock({ type: "openUnit", unitId: first });
  store.dispatchDock({ type: "openUnit", unitId: second });
  store.dispatchDock({ type: "maximize", panelId: `unit-view:${second}` });

  expect(store.deleteUnits([first, second, first, "missing"])).toBe(2);
  const active = store.active();
  expect(active.units.map((unit) => unit.id)).toEqual(["greeting"]);
  expect(active.selectedUnitId).toBe("greeting");
  expect(panelSurface(active.dock, `unit-view:${first}`)).toBeNull();
  expect(panelSurface(active.dock, `unit-view:${second}`)).toBeNull();
  expect(active.dock.panels[`unit-view:${first}`]).toBeUndefined();
  expect(active.dock.panels[`unit-view:${second}`]).toBeUndefined();
  expect(active.dock.maximized).toBeNull();
  expect(createStore(storage).active().units.map((unit) => unit.id)).toEqual(["greeting"]);
});

test("the bundled sample can be deleted, leaving an empty workspace", () => {
  const storage = { getItem: () => null, setItem: () => {} };
  const store = createStore(storage);
  expect(store.deleteUnits(["greeting"])).toBe(1);
  expect(store.active().units).toEqual([]);
  expect(store.active().selectedUnitId).toBeNull();
  expect(store.deleteUnits(["greeting"])).toBe(0);
});

test("a completed build cannot attach to a recreated Component with the same source", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const id = store.createUnit("Repeat");
  const original = store.selected()!;
  const source = { id, revision: original.revision, files: { ...original.files } };
  store.deleteUnits([id]);
  expect(store.createUnit("Repeat")).toBe(id);
  const artifact = { id, revision: source.revision, sourceSha256: "a".repeat(64), sha256: "b".repeat(64), bytes: 10, builtBy: "vercel-sandbox" as const };
  expect(store.installArtifact(store.active().id, source, artifact, original.instanceId)).toBe(false);
  expect(store.selected()?.artifact).toBeNull();
});

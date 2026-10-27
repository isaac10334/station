import { expect, test } from "bun:test";
import { createStore } from "../src/features/workspace/application/store";
import { createComposition } from "../src/application";

function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  return { store: createStore(storage), storage };
}

test("workspace deletion requires exact current confirmation and protects the last workspace", () => {
  const { store } = fixture();
  const first = store.active();
  expect(() => store.deleteWorkspace(first.id, first.name)).toThrow("last one");
  store.createWorkspace("Disposable");
  const id = store.active().id;
  expect(() => store.deleteWorkspace(id, "disposable")).toThrow("exactly");
  store.renameWorkspace("Renamed");
  expect(() => store.deleteWorkspace(id, "Disposable")).toThrow("exactly");
  expect(store.get().workspaces).toHaveLength(2);
  expect(() => store.deleteWorkspace("missing", "Renamed")).toThrow("no longer exists");
});

test("deleting the active workspace persists removal and selects a survivor", () => {
  const { store, storage } = fixture();
  const survivor = store.active().id;
  store.createWorkspace("Delete me");
  const deleted = store.active().id;
  store.createAsset("Private source");
  store.deleteWorkspace(deleted, "Delete me");
  expect(store.active().id).toBe(survivor);
  const restored = createStore(storage);
  expect(restored.get().workspaces.map(item => item.id)).toEqual([survivor]);
  expect(restored.active().id).toBe(survivor);
  expect(restored.active().assets.some(item => item.name === "Private source")).toBe(false);
});

test("deleting an inactive workspace preserves the active workspace and its data", () => {
  const { store } = fixture();
  const removed = store.active();
  store.createWorkspace("Keep me");
  const survivor = store.active();
  store.deleteWorkspace(removed.id, removed.name);
  expect(store.active()).toEqual(survivor);
  expect(store.get().workspaces).toHaveLength(1);
});

test("failed persistence leaves workspace deletion unapplied", () => {
  let fail = false;
  const store = createStore({ getItem: () => null, setItem: () => { if (fail) throw new Error("Storage full"); } });
  store.createWorkspace("Keep on failure");
  const before = store.get();
  fail = true;
  expect(() => store.deleteWorkspace(store.active().id, "Keep on failure")).toThrow("Storage full");
  expect(store.get()).toBe(before);
});

test("deleting a workspace revokes its runtime scope and rejects stale tasks", async () => {
  const deps = createComposition({ getItem: () => null, setItem: () => {} });
  try {
    deps.store.createWorkspace("Runtime owner");
    const target = deps.store.active();
    const scope = deps.openScope(target.id, "Deletion test");
    expect(scope.signal.aborted).toBe(false);
    deps.store.deleteWorkspace(target.id, target.name);
    await Promise.resolve();
    expect(scope.signal.aborted).toBe(true);
    expect(() => deps.openScope(target.id, "Stale task")).toThrow("no longer exists");
  } finally {
    await deps.dispose();
  }
});

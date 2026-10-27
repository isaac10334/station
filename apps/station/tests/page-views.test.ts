import { expect, test } from "bun:test";
import {
  viewConfigurationSchema,
  orderRecords,
  moveRecord,
} from "../src/core/data-sources";
import { createStore } from "../src/features/workspace/application/store";
import { createStationControl } from "../src/features/commands/application/runtime";
import { migrateDock, validateDock } from "../src/core/docking";
import { taskScopeSchema } from "@station/protocol";
test("manual order is stable, per-view, and retains newly discovered records", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  expect(orderRecords(rows, ["b", "a"]).map((r) => r.id)).toEqual([
    "b",
    "a",
    "c",
  ]);
  expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  expect(moveRecord(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  expect(moveRecord(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  expect(viewConfigurationSchema.parse({}).sortBy).toBeUndefined();
});
test("page hierarchy validates cycles, duplicates and dangling parents while retaining missing source references", () => {
  const base = { collection: "notes", presentation: "tree" };
  expect(
    viewConfigurationSchema.parse({
      ...base,
      pages: [
        { id: "a", assetId: "missing-source" },
        { id: "b", assetId: "note", parentId: "a" },
      ],
    }).pages?.[0].assetId,
  ).toBe("missing-source");
  for (const pages of [
    [{ id: "a", assetId: "x", parentId: "a" }],
    [
      { id: "a", assetId: "x", parentId: "b" },
      { id: "b", assetId: "x", parentId: "a" },
    ],
    [{ id: "a", assetId: "x", parentId: "missing" }],
    [
      { id: "a", assetId: "x" },
      { id: "a", assetId: "y" },
    ],
  ])
    expect(viewConfigurationSchema.safeParse({ ...base, pages }).success).toBe(
      false,
    );
});
test("Navigation initialization is atomic, idempotent, persisted and surface-authorized", () => {
  const values = new Map<string, string>();
  const persistence = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const store = createStore(persistence),
    control = createStationControl(store);
  try {
    const panel = Object.values(store.active().dock.panels).find(
      (p) => p.kind === "navigation",
    )!;
    const denied = control.issueTask({
      name: "No sidebar",
      workspaceId: store.active().id,
      scope: taskScopeSchema.parse({
        operations: ["navigation.initialize"],
        surfaces: ["main"],
      }),
    });
    expect(() =>
      control.executeFor(denied, {
        method: "navigation.initialize",
        version: control.version(),
        params: { panelId: panel.id },
      }),
    ).toThrow();
    expect(store.active().dock.containers[panel.id]).toBeUndefined();
    control.execute({
      method: "navigation.initialize",
      version: control.version(),
      params: { panelId: panel.id },
    });
    const layout = store.active().dock,
      ids = Object.keys(layout.panels);
    expect(layout.panels[panel.id].navigation?.areasInitialized).toBe(true);
    expect(
      Object.values(layout.panels).some(
        (p) =>
          p.kind === "widget" &&
          p.widget === "data-view" &&
          p.dataView?.collection === "notes",
      ),
    ).toBe(true);
    expect(layout.surfaces.sidebar?.kind === "stack" && layout.surfaces.sidebar.presentation).toBe("plain");
    const reloaded = migrateDock(JSON.parse(JSON.stringify(layout)));
    expect(reloaded.containers[panel.id]?.kind === "stack" && reloaded.containers[panel.id].presentation).toBe("plain");
    expect(validateDock(layout)).toBeNull();
    control.execute({
      method: "navigation.initialize",
      version: control.version(),
      params: { panelId: panel.id },
    });
    expect(Object.keys(store.active().dock.panels)).toEqual(ids);
    const pagesPanel = Object.values(layout.panels).find(
      (p) => p.kind === "widget" && p.widget === "data-view",
    )!;
    const stale = control.version();
    expect(
      store.dispatchDock({ type: "close", panelId: pagesPanel.id }).ok,
    ).toBe(true);
    expect(() =>
      control.execute({
        method: "navigation.initialize",
        version: stale,
        params: { panelId: panel.id },
      }),
    ).toThrow();
    control.execute({
      method: "navigation.initialize",
      version: control.version(),
      params: { panelId: panel.id },
    });
    expect(store.active().dock.panels[pagesPanel.id]).toBeUndefined();
    const migrated = migrateDock(layout);
    expect(migrated.panels[panel.id].navigation?.areasInitialized).toBe(true);
    expect(migrated.containers[panel.id]).toBeDefined();
  } finally {
    control.dispose();
  }
});

test('root presentation switches preserve current slots instead of reapplying prefab children', () => {
  const store=createStore({getItem:()=>null,setItem:()=>{}});
  const navigation=Object.values(store.active().dock.panels).find(p=>p.kind==='navigation')!;
  store.initializeNavigation(navigation.id);
  const before=store.active().dock;
  for (const widget of ['desktop-shell','app-shell'] as const) expect(store.dispatchDock({type:'setRootWidget',widget,slots:[]}).ok).toBe(true);
  const after=store.active().dock;
  expect(after.surfaces).toEqual(before.surfaces);
  expect(after.containers).toEqual(before.containers);
  for (const panel of Object.values(before.panels)) if(panel.id!==before.rootId) expect(after.panels[panel.id]).toEqual(panel);
  expect(validateDock(after)).toBeNull();
});

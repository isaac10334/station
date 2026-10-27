import { expect, test } from "bun:test";
import {
  surfacePanels,
  createDockLayout,
  reduceDock,
  migrateDock,
  validateDock,
  descendants,
} from "../src/core/docking";
import {
  builtinDeskTemplates,
  parseDeskTemplate,
  templateSetup,
} from "../src/core/desk-templates";
import { cloneDesk, createDesk } from "../src/core/desks";
import { parseWidgetRecipe } from "../src/core/widget-definitions";
import { createStore } from "../src/features/workspace/application/store";
import { parseTheme } from "../src/core/theme-assets";
import { dataDocumentSchema } from "../src/core/data-sources";

test("starter desk composes editable source assets and survives reload without reseeding edits", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const store = createStore(storage);
  const workspace = store.active();
  expect(validateDock(workspace.dock)).toBeNull();
  expect(surfacePanels(workspace.dock, "dashboard")).toHaveLength(3);
  for (const id of surfacePanels(workspace.dock, "dashboard")) expect(workspace.dock.panels[id].definitionSnapshot?.assetId).toMatch(/^builtin:/);
  const theme = workspace.assets.find(asset => asset.id === workspace.themeId)!;
  expect(parseTheme(theme.files!["theme.json"]).layout?.pageGutter).toBe(48);
  const source = workspace.assets.find(asset => asset.id === "references")!;
  const document = dataDocumentSchema.parse(JSON.parse(source.files!["data.json"]));
  document.records[0].values.name = "My own reference";
  store.editFile(source.id, "data.json", JSON.stringify(document));
  const restored = createStore(storage).active();
  expect(restored.assets.find(asset => asset.id === source.id)?.files!["data.json"]).toContain("My own reference");
  expect(validateDock(restored.dock)).toBeNull();
  store.createDesk("Another app desk", false, "builtin:desk-app");
  expect(store.active().assets.filter(asset => asset.id === source.id)).toHaveLength(1);
});

test("root shells migrate without becoming dashboard children and reject relocation/removal", () => {
  const old = createDockLayout();
  delete old.panels[old.rootId!];
  delete old.rootId;
  const dock = migrateDock(old);
  expect(dock.panels[dock.rootId!]).toMatchObject({ widget: "app-shell" });
  expect(validateDock(dock)).toBeNull();
  for (const type of ["close", "float", "activate"] as const)
    expect(reduceDock(dock, { type, panelId: dock.rootId! }).ok).toBe(false);
  expect(
    reduceDock(dock, {
      type: "createWidget",
      widget: "desktop-shell",
      target: { surface: "dashboard", intent: "append" },
    }).ok,
  ).toBe(false);
  expect(migrateDock(dock)).toEqual(dock);
});

test("templates preserve root configuration, fresh identities, floats and source-only snapshots", () => {
  for (const asset of builtinDeskTemplates()) {
    const { setup } = parseDeskTemplate(asset.files["desk.json"]);
    expect(validateDock(setup.dock)).toBeNull();
    const a = cloneDesk(setup, "A"),
      b = cloneDesk(setup, "B");
    expect(a.dock.rootId).not.toBe(b.dock.rootId);
    expect(validateDock(a.dock)).toBeNull();
    expect(Object.keys(a.dock.floating).length).toBe(
      Object.keys(setup.dock.floating).length,
    );
  }
  const desk = createDesk("Test", createDockLayout());
  Object.assign(desk.dock.panels[desk.dock.rootId!], {
    taskGrant: "secret",
    runtimeOutput: "private",
  });
  expect(JSON.stringify(templateSetup(desk))).not.toContain("secret");
  expect(JSON.stringify(templateSetup(desk))).not.toContain("private");
});

test("nested slot defaults allocate independent children atomically and reject invalid compositions", () => {
  const recipe = parseWidgetRecipe(
    JSON.stringify({
      version: 1,
      title: "Research",
      widget: "stack",
      defaults: { flippable: false },
      slots: [
        [{ widget: "clock", defaults: { displayName: "Time" } }],
        [{ widget: "stack", slots: [[{ widget: "snake" }]] }],
      ],
    }),
  );
  let dock = createDockLayout([]);
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const result = reduceDock(dock, {
      type: "createWidget",
      widget: recipe.widget,
      defaults: recipe.defaults,
      slots: recipe.slots,
      target: { surface: "dashboard", intent: "append" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.reason);
    dock = result.layout;
    ids.push(result.panelId!);
    expect(descendants(dock, result.panelId!)).toHaveLength(3);
  }
  expect(
    descendants(dock, ids[0]).some((id) =>
      descendants(dock, ids[1]).includes(id),
    ),
  ).toBe(false);
  expect(validateDock(migrateDock(dock, []))).toBeNull();
  const bad = reduceDock(dock, {
    type: "createWidget",
    widget: "clock",
    slots: recipe.slots,
    target: { surface: "dashboard", intent: "append" },
  });
  expect(bad.ok).toBe(false);
  expect(bad.layout).toBe(dock);
  expect(() =>
    parseWidgetRecipe(
      JSON.stringify({
        ...recipe,
        slots: [[{ widget: "clock", defaults: { grant: true } }]],
      }),
    ),
  ).toThrow();
});

test("window minimization persists without deleting identity and flip is opt-in", () => {
  const desktop = parseDeskTemplate(
    builtinDeskTemplates()[1].files["desk.json"],
  ).setup.dock;
  const id = Object.keys(desktop.floating)[0];
  const hidden = reduceDock(desktop, {
    type: "windowVisibility",
    panelId: id,
    hidden: true,
  });
  expect(hidden.ok).toBe(true);
  if (!hidden.ok) return;
  const restored = migrateDock(hidden.layout, []);
  expect(restored.floating[id].hidden).toBe(true);
  expect(restored.panels[id]).toMatchObject({ id });
  const activated = reduceDock(restored, { type: "activate", panelId: id });
  expect(activated.ok && activated.layout.floating[id].hidden).toBe(false);
  const shown = reduceDock(restored, {
    type: "windowVisibility",
    panelId: id,
    hidden: false,
  });
  expect(shown.ok).toBe(true);
  expect(desktop.panels[id].flippable).not.toBe(true);
  expect(
    reduceDock(desktop, {
      type: "configurePanel",
      panelId: id,
      flippable: true,
    }).ok,
  ).toBe(true);
  expect(
    reduceDock(desktop, {
      type: "configureShell",
      background: "url(https://example.com)",
    }).ok,
  ).toBe(false);
});

test("template assets drive desk defaults and definition source snapshots survive reload", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const app = createStore(storage);
  app.createDesk("Desktop", false, "builtin:desk-desktop");
  app.saveDeskDefault();
  const templateId = app.active().defaultTemplateId!;
  expect(
    app.active().assets.find((asset) => asset.id === templateId)?.kind,
  ).toBe("desk-template");
  app.createDesk("Next");
  const dock = app.active().dock;
  expect(dock.panels[dock.rootId!]).toMatchObject({ widget: "desktop-shell" });
  const definitionId = app.createWidgetDefinition("Research");
  const asset = app.active().assets.find((asset) => asset.id === definitionId)!;
  const recipe = {
    ...parseWidgetRecipe(asset.files!["widget.json"]),
    slots: [[{ widget: "clock" as const }]],
  };
  app.patchFiles(asset.id, asset.revision, {
    "widget.json": JSON.stringify(recipe),
  });
  const result = app.dispatchDock({
    type: "createWidget",
    widget: "stack",
    definitionId,
    target: { surface: "dashboard", intent: "append" },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.reason);
  expect(result.layout.floating[result.panelId!]).toBeDefined();
  expect(descendants(result.layout, result.panelId!)).toHaveLength(1);
  const restored = createStore(storage);
  expect(restored.active().defaultTemplateId).toBe(templateId);
  expect(descendants(restored.active().dock, result.panelId!)).toHaveLength(1);
  expect(validateDock(restored.active().dock)).toBeNull();
  expect(
    restored.active().assets.find((asset) => asset.id === definitionId)
      ?.revision,
  ).toBe(1);
});

test("shell definitions populate named slots atomically and retain existing instances", () => {
  const dock = createDockLayout([]);
  const result = reduceDock(dock, {
    type: "setRootWidget",
    widget: "app-shell",
    slots: [
      [{ widget: "navigation" }],
      [{ widget: "stack", slots: [[{ widget: "clock" }]] }],
      [],
      [],
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.reason);
  expect(validateDock(result.layout)).toBeNull();
  expect(Object.keys(result.layout.panels).length).toBe(
    Object.keys(dock.panels).length + 3,
  );
  expect(result.layout.panels["workspace-navigation"]).toEqual(
    dock.panels["workspace-navigation"],
  );
  const bad = reduceDock(dock, {
    type: "setRootWidget",
    widget: "desktop-shell",
    slots: [[{ widget: "navigation" }], [{ widget: "desktop-shell" }]],
  });
  expect(bad.ok).toBe(false);
  expect(bad.layout).toBe(dock);
});

import { z } from "zod";
import { createDesk, type DeskSetup } from "./desks";
import {
  createDockLayout,
  migrateDock,
  reduceDock,
  validateDock,
  type DockLayout,
  type Panel,
} from "./docking";
import { normalizeNavigation } from "./navigation-filter";
import type { Asset, DataAsset } from "./asset-state";
import { widgetDefinitionAsset, parseWidgetRecipe } from "./widget-definitions";

const templateSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(120),
    setup: z
      .object({
        dock: z.record(z.string(), z.unknown()),
        navigation: z.unknown().optional(),
        hiddenDefinitions: z.array(z.string()).default([]),
        disabledContributions: z.array(z.string()).default([]),
        editorDefaults: z.record(z.string(), z.string()).default({}),
        themeId: z.string().nullable().default(null),
        toolbarWidgetId: z.string().optional(),
        toolbar: z
          .object({
            anchor: z.enum([
              "bottom-left",
              "bottom-center",
              "bottom-right",
              "top-left",
              "top-center",
              "top-right",
            ]),
            inset: z.number().min(0).max(200),
          })
          .optional(),
      })
      .strict(),
  })
  .strict();

/** Templates contain layout/source references only. Allowlisted panel fields keep
 * transient services, task bindings, grants and runtime output out of exports. */
export function templateSetup(desk: DeskSetup): DeskSetup {
  const keys = [
    "id",
    "kind",
    "widget",
    "size",
    "tone",
    "stackMode",
    "childWidget",
    "instanceShell",
    "targetRef", "dataView", "actionButton",
    "listMode",
    "browser",
    "tags",
    "displayName",
    "hideDisplayName",
    "flippable",
    "chrome",
    "background",
    "ownerId",
    "definitionId",
    "slotId",
    "assetId",
    "part",
  ] as const;
  const panels = Object.fromEntries(
    Object.entries(desk.dock.panels).map(([id, panel]) => [
      id,
      Object.fromEntries(
        keys
          .filter((key) => key in panel)
          .map((key) => [
            key,
            (panel as unknown as Record<string, unknown>)[key],
          ]),
      ) as Panel,
    ]),
  );
  return structuredClone({
    dock: {
      version: 5,
      rootId: desk.dock.rootId,
      panels,
      surfaces: desk.dock.surfaces,
      containers: desk.dock.containers,
      floating: desk.dock.floating,
      hidden: desk.dock.hidden,
      sidebarSide: desk.dock.sidebarSide,
      sidebarWidth: desk.dock.sidebarWidth,
      dashboardWidth: desk.dock.dashboardWidth,
      bottomSize: desk.dock.bottomSize,
      browserView: desk.dock.browserView,
      maximized: null,
    },
    navigation: normalizeNavigation(desk.navigation),
    hiddenDefinitions: desk.hiddenDefinitions,
    disabledContributions: desk.disabledContributions,
    editorDefaults: desk.editorDefaults,
    themeId: desk.themeId,
    toolbar: desk.toolbar,
    toolbarWidgetId: desk.toolbarWidgetId,
  });
}
export function parseDeskTemplate(source: string): {
  title: string;
  setup: DeskSetup;
} {
  if (source.length > 1048576) throw new Error("Desk template exceeds 1 MiB");
  const parsed = templateSchema.parse(JSON.parse(source));
  // Validate before migration: malformed authored templates must not silently reset.
  const raw = parsed.setup.dock as unknown as DockLayout;
  if (
    ![4, 5].includes(raw.version) ||
    !raw.panels ||
    !raw.surfaces ||
    !raw.containers ||
    !raw.floating
  )
    throw new Error("Invalid desk layout");
  const reason = validateDock((raw.version as number) === 4 ? { ...raw, version: 5, surfaces: { ...raw.surfaces, toolbar: createDockLayout([]).surfaces.toolbar } } : raw);
  if (reason) throw new Error(reason);
  return {
    title: parsed.title,
    setup: templateSetup({
      ...parsed.setup,
      dock: migrateDock(raw, []),
      navigation: normalizeNavigation(
        parsed.setup.navigation as Parameters<typeof normalizeNavigation>[0],
      ),
    }),
  };
}
export function deskTemplateAsset(
  title: string,
  setup: DeskSetup,
  id = `desk-template-${crypto.randomUUID()}`,
): DataAsset {
  return {
    id,
    instanceId: crypto.randomUUID(),
    kind: "desk-template",
    name: title,
    description: "Saved desk layout and widget configuration",
    revision: 0,
    files: {
      "desk.json": JSON.stringify(
        { version: 1, title, setup: templateSetup(setup) },
        null,
        2,
      ),
    },
  };
}
export const isBuiltinDeskTemplate = (id: string) =>
  ["builtin:desk-app", "builtin:desk-desktop"].includes(id);
let builtins: DataAsset[] | undefined;
/** Product defaults are ordinary view configuration. Workspace creation supplies
 * the matching local Inbox asset; authored templates may replace either part. */
export function createDefaultAppDock(): DockLayout {
  let dock = createDockLayout([]);
  dock.sidebarWidth = 244;
  dock.hidden.bottom = true;
  const widgets = [
    { widget: "data-view" as const, defaults: { displayName: "References", chrome: "compact" as const, dataView: { sourceId: "references", presentation: "table" as const, search: "", descending: false, hiddenColumns: [] } } },
    { widget: "note" as const, defaults: { displayName: "A little direction", chrome: "compact" as const, sourceAssetId: "a-little-direction" } },
    { widget: "note" as const, defaults: { displayName: "Room to explore", chrome: "compact" as const, sourceAssetId: "room-to-explore" } },
  ];
  for (const recipe of widgets) {
    const definition = widgetDefinitionAsset([], `builtin:${recipe.widget}`)!;
    const definitionRecipe = parseWidgetRecipe(definition.files["widget.json"]);
    const result = reduceDock(dock, { type: "createWidget", ...recipe, definitionId: definition.id, definitionSnapshot: { assetId: definition.id, revision: definition.revision, recipe: definitionRecipe }, defaults: { ...definitionRecipe.defaults, ...recipe.defaults }, target: { surface: "dashboard", intent: "append" } });
    if (!result.ok) throw new Error(result.reason);
    dock = result.layout;
  }
  const grid = dock.surfaces.dashboard;
  if (grid?.kind === "grid") {
    const [data, first, second] = grid.cells;
    grid.cells = [ { ...data, height: 360 }, { id: first.id, height: 280, node: { kind: "split", id: "split:starter-notes", axis: "horizontal", ratio: 0.5, first: first.node, second: second.node } } ];
  }
  return dock;
}
export function builtinDeskTemplates(): DataAsset[] {
  if (builtins) return builtins;
  const standard = createDesk("App desk", createDefaultAppDock());
  standard.themeId = "workspace-theme";
  let desktop = createDockLayout(["clock", "stack"]);
  const shell = reduceDock(desktop, {
    type: "setRootWidget",
    widget: "desktop-shell",
    defaults: {},
  });
  if (shell.ok) desktop = shell.layout;
  for (const [i, panel] of Object.values(desktop.panels)
    .filter((panel) => panel.kind === "widget" && panel.id !== desktop.rootId)
    .entries()) {
    const result = reduceDock(desktop, {
      type: "float",
      panelId: panel.id,
      x: 72 + i * 400,
      y: 104 + i * 50,
    });
    if (result.ok) desktop = result.layout;
  }
  desktop.hidden = { sidebar: true, bottom: true };
  return (builtins = [
    deskTemplateAsset("App desk", standard, "builtin:desk-app"),
    deskTemplateAsset(
      "Desktop",
      createDesk("Desktop", desktop),
      "builtin:desk-desktop",
    ),
  ]);
}
export function availableDeskTemplates(assets: readonly Asset[]) {
  return [
    ...builtinDeskTemplates(),
    ...assets.filter(
      (asset): asset is DataAsset => asset.kind === "desk-template",
    ),
  ];
}

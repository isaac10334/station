import { describe, expect, test } from "bun:test";
import { BROWSER_ID, NAVIGATION_ID, DEFAULT_DOCK_POLICY, createDockLayout, dropReason, leafStacks, migrateDock, panelSurface, placementReason, reduceDock, surfacePanels, visitNode } from "../src/docking/core";
import { resolveIntent } from "../src/docking/drag";

const apply = (layout: ReturnType<typeof createDockLayout>, command: Parameters<typeof reduceDock>[1]) => {
  const result = reduceDock(layout, command);
  if (!result.ok) throw new Error(result.reason);
  return result.layout;
};

describe("dock document", () => {
  test("migrates flat placements, sizes, browser preference, and deduplicates the browser", () => {
    const dock = migrateDock({ sidebar: ["unit-browser", "widget:snake", "unit-browser"], bottom: ["widget:components"], widgetSizes: { snake: "compact" }, bottomSize: 99, browserView: "list" }, ["welcome"]);
    expect(surfacePanels(dock, "sidebar")).toContain(BROWSER_ID);
    expect(surfacePanels(dock, "sidebar")).toContain("widget:snake:legacy-0");
    expect(Object.values(dock.panels).some((panel) => panel.kind === "widget" && (panel.widget as string) === "components")).toBe(false);
    expect(Object.values(dock.panels).find((panel) => panel.kind === "widget" && panel.widget === "snake")).toMatchObject({ size: "compact" });
    expect(dock.browserView).toBe("list");
    expect(dock.bottomSize).toBe(60);
    expect(Object.values(dock.surfaces).flatMap((root) => { const ids: string[] = []; visitNode(root, (node) => { if (node.kind === "stack") ids.push(...node.tabs); }); return ids; }).filter((id) => id === BROWSER_ID)).toHaveLength(1);
  });

  test("creates separate widget instances of the same type and preserves them after reload", () => {
    const first = reduceDock(createDockLayout([]), { type: "createWidget", id: "widget:one", widget: "stack", target: { surface: "dashboard", intent: "append" } });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = reduceDock(first.layout, { type: "createWidget", id: "widget:two", widget: "stack", target: { surface: "dashboard", intent: "append" } });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(surfacePanels(second.layout, "dashboard")).toEqual(["widget:one", "widget:two"]);
    expect(surfacePanels(migrateDock(JSON.parse(JSON.stringify(second.layout))), "dashboard")).toEqual(["widget:one", "widget:two"]);
  });

  test("moves panels across docks, tabs, and nested splits without duplication", () => {
    let dock = apply(createDockLayout([]), { type: "openUnit", unitId: "alpha" });
    const main = dock.surfaces.main!;
    expect(main.kind).toBe("stack");
    dock = apply(dock, { type: "openUnit", unitId: "beta", target: { surface: "main", nodeId: main.id, intent: "right" } });
    expect(dock.surfaces.main?.kind).toBe("split");
    const split = dock.surfaces.main;
    if (split?.kind !== "split") return;
    dock = apply(dock, { type: "move", panelId: "unit-view:alpha", target: { surface: "main", nodeId: split.second.id, intent: "tab" } });
    expect(surfacePanels(dock, "main").filter((id) => id === "unit-view:alpha")).toHaveLength(1);
    expect(surfacePanels(dock, "main")).toContain("unit-view:beta");
    dock = apply(dock, { type: "move", panelId: BROWSER_ID, target: { surface: "sidebar", intent: "append" } });
    expect(panelSurface(dock, BROWSER_ID)).toBe("sidebar");
    expect(surfacePanels(dock, "bottom")).toEqual([]);
  });

  test("inserts tabs at visible boundaries when reordering within a stack", () => {
    let dock = apply(createDockLayout([]), { type: "openUnit", unitId: "alpha" });
    dock = apply(dock, { type: "openUnit", unitId: "beta" });
    const stack = dock.surfaces.main;
    if (stack?.kind !== "stack") throw new Error("Expected main tab stack");
    dock = apply(dock, { type: "move", panelId: "unit-view:alpha", target: { surface: "main", nodeId: stack.id, intent: "tab", index: 3 } });
    expect((dock.surfaces.main as typeof stack).tabs).toEqual(["workspace-home", "unit-view:beta", "unit-view:alpha"]);
    dock = apply(dock, { type: "move", panelId: "unit-view:beta", target: { surface: "main", nodeId: stack.id, intent: "tab", index: 0 } });
    expect((dock.surfaces.main as typeof stack).tabs).toEqual(["unit-view:beta", "workspace-home", "unit-view:alpha"]);
    const same = reduceDock(dock, { type: "move", panelId: "unit-view:beta", target: { surface: "main", nodeId: stack.id, intent: "tab", index: 1 } });
    expect(same.ok).toBe(true);
    expect(same.layout).toBe(dock);
  });

  test("rejects invalid drops atomically, including self target and reserved surfaces", () => {
    const dock = createDockLayout([]);
    const forbidden = reduceDock(dock, { type: "move", panelId: BROWSER_ID, target: { surface: "dashboard", intent: "append" } });
    expect(forbidden).toMatchObject({ ok: false, layout: dock });
    const self = reduceDock(dock, { type: "move", panelId: BROWSER_ID, target: { surface: "bottom", nodeId: "stack:bottom", intent: "tab" } });
    expect(self.ok).toBe(false);
    expect(self.layout).toBe(dock);
    expect(placementReason(dock.panels[BROWSER_ID], { surface: "main", intent: "tab" })).toMatch(/dock/);
    expect(dropReason(dock, dock.panels[BROWSER_ID], { surface: "bottom", nodeId: "stack:bottom", intent: "tab" })).toMatch(/panel being moved/);
    expect(placementReason(dock.panels[BROWSER_ID], { surface: "bottom", intent: "append", allowedTags: ["widget"] })).toMatch(/slot/);
  });

  test("opening a Component focuses its existing panel and finds a stack after splitting", () => {
    let dock = apply(createDockLayout([]), { type: "openUnit", unitId: "alpha" });
    dock = apply(dock, { type: "move", panelId: "workspace-home", target: { surface: "main", nodeId: "stack:main", intent: "right" } });
    expect(dock.surfaces.main?.kind).toBe("split");
    dock = apply(dock, { type: "openUnit", unitId: "beta" });
    expect(surfacePanels(dock, "main")).toContain("unit-view:beta");
    dock = apply(dock, { type: "move", panelId: "unit-view:alpha", target: { surface: "sidebar", intent: "append" } });
    dock = apply(dock, { type: "openUnit", unitId: "alpha" });
    expect(panelSurface(dock, "unit-view:alpha")).toBe("sidebar");
  });

  test("resize, activation, and maximize are persistent commands", () => {
    let dock = apply(createDockLayout([]), { type: "openUnit", unitId: "a" });
    dock = apply(dock, { type: "activate", panelId: "workspace-home" });
    expect((dock.surfaces.main as { active: string }).active).toBe("workspace-home");
    dock = apply(dock, { type: "resizeBottom", size: 52 });
    dock = apply(dock, { type: "maximize", panelId: "unit-view:a" });
    const restored = migrateDock(JSON.parse(JSON.stringify(dock)));
    expect(restored.bottomSize).toBe(52);
    expect(restored.maximized).toBe("unit-view:a");
  });
});

test("Alt wins over Shift; Shift chooses the nearest split edge", () => {
  const point = { x: 4, y: 45, width: 200, height: 100 };
  expect(resolveIntent("tab", { alt: false, shift: true }, point)).toBe("left");
  expect(resolveIntent("left", { alt: true, shift: true }, point)).toBe("tab");
  expect(resolveIntent("top", { alt: false, shift: false }, point)).toBe("top");
});

describe("host surface policy and recovery", () => {
  test("sidebar and bottom reject splits; main stops at four leaves", () => {
    let dock = createDockLayout([]);
    expect(surfacePanels(dock, "sidebar")).toEqual([NAVIGATION_ID]);
    const sidebar = reduceDock(dock, { type: "openUnit", unitId: "a", target: { surface: "sidebar", intent: "right", nodeId: "stack:sidebar" } });
    expect(sidebar).toMatchObject({ ok: false, layout: dock });
    for (let n = 1; n <= 3; n++) {
      const root = dock.surfaces.main!;
      const result = reduceDock(dock, { type: "openUnit", unitId: `split-${n}`, target: { surface: "main", intent: "right", nodeId: root.id } });
      expect(result.ok).toBe(true);
      dock = result.layout;
    }
    expect(leafStacks(dock.surfaces.main)).toBe(4);
    const rejected = reduceDock(dock, { type: "openUnit", unitId: "fifth", target: { surface: "main", intent: "right", nodeId: dock.surfaces.main!.id } });
    expect(rejected).toMatchObject({ ok: false, layout: dock });
    expect(DEFAULT_DOCK_POLICY.sidebar.maxLeafStacks).toBe(1);
    expect(reduceDock(dock, { type: "visibility", surface: "dashboard", hidden: true }).ok).toBe(false);
  });

  test("a host can lower the main leaf limit for commands and migration", () => {
    const policy = { ...DEFAULT_DOCK_POLICY, main: { ...DEFAULT_DOCK_POLICY.main, maxLeafStacks: 1 } };
    const base = createDockLayout([]);
    expect(reduceDock(base, { type: "openUnit", unitId: "a", target: { surface: "main", intent: "right", nodeId: "stack:main" } }, policy).ok).toBe(false);
    const old = apply(base, { type: "openUnit", unitId: "a", target: { surface: "main", intent: "right", nodeId: "stack:main" } });
    const repaired = migrateDock(old, [], policy);
    expect(leafStacks(repaired.surfaces.main)).toBe(1);
    expect(surfacePanels(repaired, "main")).toEqual(["workspace-home", "unit-view:a"]);
  });

  test("migration merges old sidebar splits without losing tab order or identities", () => {
    let dock = createDockLayout([]);
    dock = apply(dock, { type: "openUnit", unitId: "a", target: { surface: "sidebar", intent: "tab" } });
    dock = apply(dock, { type: "openUnit", unitId: "b", target: { surface: "sidebar", intent: "tab" } });
    const saved = structuredClone(dock);
    saved.surfaces.sidebar = { kind: "split", id: "old-split", axis: "horizontal", ratio: .5,
      first: { kind: "stack", id: "old-first", tabs: [NAVIGATION_ID, "unit-view:a"], active: "unit-view:a" },
      second: { kind: "stack", id: "old-second", tabs: ["unit-view:b"], active: "unit-view:b" } };
    const restored = migrateDock(saved);
    expect(leafStacks(restored.surfaces.sidebar)).toBe(1);
    expect(surfacePanels(restored, "sidebar")).toEqual([NAVIGATION_ID, "unit-view:a", "unit-view:b"]);
  });

  test("migration relocates incompatible panels without replacing other main tabs", () => {
    let dock = apply(createDockLayout([]), { type: "openUnit", unitId: "keep" });
    const saved = structuredClone(dock);
    saved.surfaces.main = { kind: "stack", id: "stack:main", tabs: ["unit-view:keep"], active: "unit-view:keep" };
    saved.surfaces.sidebar = { kind: "stack", id: "stack:sidebar", tabs: ["workspace-navigation", "workspace-home"], active: "workspace-navigation" };
    dock = migrateDock(saved, []);
    expect(surfacePanels(dock, "main")).toEqual(["workspace-home", "unit-view:keep"]);
    expect(surfacePanels(dock, "sidebar")).toEqual(["workspace-navigation"]);
  });

  test("visibility retains trees and floating widgets return with the same ID", () => {
    let dock = createDockLayout([]);
    dock = apply(dock, { type: "visibility", surface: "main", hidden: true });
    expect(dock.hidden.main).toBe(true);
    expect(surfacePanels(dock, "main")).toEqual(["workspace-home"]);
    dock = apply(dock, { type: "createWidget", id: "widget:float-me", widget: "stack", target: { surface: "sidebar", intent: "tab" } });
    dock = apply(dock, { type: "float", panelId: "widget:float-me" });
    expect(panelSurface(dock, "widget:float-me")).toBeNull();
    expect(dock.floating["widget:float-me"]).toBeDefined();
    expect(reduceDock(dock, { type: "float", panelId: BROWSER_ID }).ok).toBe(false);
    dock = migrateDock(JSON.parse(JSON.stringify(dock)));
    dock = apply(dock, { type: "dockFloat", panelId: "widget:float-me" });
    expect(panelSurface(dock, "widget:float-me")).toBe("sidebar");
    expect(Object.keys(dock.floating)).toHaveLength(0);
  });
});

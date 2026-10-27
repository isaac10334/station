import { expect, test } from "bun:test";
import { createDockLayout, descendants, migrateDock, panelSlot, reduceDock, validateDock, type Command, type DockLayout } from "../src/core/docking";

const dashboard = { surface: "dashboard", intent: "append" } as const;
function apply(layout: DockLayout, command: Command) {
  const result = reduceDock(layout, command);
  if (!result.ok) throw new Error(result.reason);
  return result.layout;
}

test("browser tabs are ordinary stable instances that move between browser and general Layout owners", () => {
  let dock = apply(createDockLayout([]), { type: "createWidget", widget: "web-browser", id: "browser-a", target: dashboard });
  dock = apply(dock, { type: "createWidget", widget: "web-browser", id: "browser-b", target: dashboard });
  dock = apply(dock, { type: "createWidget", widget: "stack", id: "layout", chrome: "seamless", childWidget: "browser-tab", target: dashboard });
  const tabId = descendants(dock, "browser-a")[0];
  const tab = dock.panels[tabId];
  expect(tab).toMatchObject({ kind: "widget", widget: "browser-tab", chrome: "seamless" });
  for (const ownerId of ["browser-b", "layout", "browser-a"]) {
    dock = apply(dock, { type: "move", panelId: tabId, target: { ...dashboard, ownerId, intent: "tab" } });
    expect(dock.panels[tabId]).toBe(tab);
    expect(panelSlot(dock, tabId)?.target.ownerId).toBe(ownerId);
    expect(validateDock(dock)).toBeNull();
  }
  const restored = migrateDock(JSON.parse(JSON.stringify(dock)));
  expect(descendants(restored, "browser-a")).toEqual([tabId]);
  expect(restored.panels.layout).toMatchObject({ chrome: "seamless", childWidget: "browser-tab" });
  dock = apply(dock, { type: "close", panelId: "browser-a" });
  expect(dock.panels[tabId]).toBe(tab);
  expect(panelSlot(dock, tabId)?.target.ownerId).toBeUndefined();
  expect(validateDock(dock)).toBeNull();
});

test("legacy browser bookmark arrays migrate once into movable child instances, preserving the active page", () => {
  const dock = createDockLayout([]);
  const legacy = {
    ...dock,
    panels: { ...dock.panels, legacy: { id: "legacy", kind: "widget", widget: "web-browser", size: "standard", tags: ["widget"], browser: {
      tabs: [{ id: "one", url: "https://example.com/a?secret=omitted" }, { id: "two", url: "https://example.org/b" }], activeTab: "two",
    } } },
    surfaces: { ...dock.surfaces, dashboard: { kind: "stack", id: "old-browser-slot", tabs: ["legacy"], active: "legacy" } },
  };
  const restored = migrateDock(legacy);
  expect(descendants(restored, "legacy")).toHaveLength(2);
  expect(restored.containers.legacy).toMatchObject({ active: "legacy:browser:two" });
  expect(restored.panels["legacy:browser:one"]).toMatchObject({ browser: { tabs: [{ id: "one", url: "https://example.com/a" }] } });
  expect(migrateDock(JSON.parse(JSON.stringify(restored)))).toEqual(restored);
  expect(validateDock(restored)).toBeNull();
});

test("seamless chrome remains removable and invalid creation settings are rejected atomically", () => {
  let dock = apply(createDockLayout([]), { type: "createWidget", widget: "clock", id: "clock", chrome: "seamless", target: dashboard });
  dock = apply(dock, { type: "configurePanel", panelId: "clock", chrome: "compact", displayName: "Desk clock" });
  expect(migrateDock(dock).panels.clock).toMatchObject({ chrome: "compact", displayName: "Desk clock" });
  expect(reduceDock(dock, { type: "createWidget", widget: "clock", childWidget: "clock", target: dashboard }).ok).toBe(false);
  dock = apply(dock, { type: "close", panelId: "clock" });
  expect(dock.panels.clock).toBeUndefined();
});

import { expect, test } from "bun:test";
import { createStore } from "../src/model";
import { panelSurface, surfacePanels } from "../src/docking/core";

test("workspace store persists duplicate widget instances and migrates old layouts without losing assets", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const store = createStore(storage);
  store.createAsset("Extra");
  const first = store.dispatchDock({ type: "createWidget", widget: "snake", target: { surface: "dashboard", intent: "append" } });
  const second = store.dispatchDock({ type: "createWidget", widget: "snake", target: { surface: "dashboard", intent: "append" } });
  expect(first.ok && second.ok).toBe(true);
  const reloaded = createStore(storage).active();
  expect(reloaded.assets.map((asset) => asset.name)).toContain("Extra");
  expect(surfacePanels(reloaded.dock, "dashboard").filter((id) => reloaded.dock.panels[id]?.kind === "widget" && reloaded.dock.panels[id].widget === "snake")).toHaveLength(2);

  const prior = JSON.parse(values.get("unit-workspace.v4")!);
  prior.workspaces[0].layout = { sidebar: ["asset-browser"], bottom: ["widget:snake"], widgetSizes: { snake: "wide" } };
  prior.workspaces[0].widgets = ["welcome"];
  delete prior.workspaces[0].dock;
  values.set("unit-workspace.v4", JSON.stringify(prior));
  const migrated = createStore(storage).active();
  expect(migrated.assets.map((asset) => asset.name)).toContain("Extra");
  expect(panelSurface(migrated.dock, "asset-browser")).toBe("sidebar");
  expect(Object.values(migrated.dock.panels).some((panel) => panel.kind === "widget" && panel.widget === "snake" && panel.size === "wide")).toBe(true);
});

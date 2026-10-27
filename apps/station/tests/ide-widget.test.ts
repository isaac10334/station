import { expect, test } from "bun:test";
import { createDockLayout, reduceDock, validateDock } from "../src/core/docking";
import { createStore } from "../src/features/workspace/application/store";
import { createStationControl } from "../src/features/commands/application/runtime";
import { taskScopeSchema } from "@station/protocol";

test("IDE retarget retires its old pane subtree and preserves the widget identity", () => {
  let layout = createDockLayout([]);
  const apply = (command: Parameters<typeof reduceDock>[1]) => {
    const result = reduceDock(layout, command); if (!result.ok) throw new Error(result.reason); layout = result.layout;
  };
  apply({ type: "createWidget", id: "ide", widget: "ide", target: { surface: "main", intent: "tab" } });
  apply({ type: "configureIde", panelId: "ide", assetId: "first" });
  apply({ type: "compose", ownerId: "ide", panels: [{ id: "code", kind: "editor-part", part: "code", assetId: "first", ownerId: "ide", tags: ["widget"] }], root: { kind: "stack", id: "code-slot", tabs: ["code"], active: "code" } });
  apply({ type: "configureIde", panelId: "ide", assetId: "second" });
  expect(layout.panels.ide.sourceAssetId).toBe("second");
  expect(layout.panels.code).toBeUndefined(); expect(layout.containers.ide).toBeUndefined();
  expect(validateDock(layout)).toBeNull();
});

test("task IDE retarget requires target asset read authority and exact layout revision", () => {
  const memory = new Map<string, string>();
  const store = createStore({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } });
  const control = createStationControl(store);
  try {
    store.dispatchDock({ type: "createWidget", id: "ide", widget: "ide", target: { surface: "main", intent: "tab" } });
    const task = (assets: string[]) => control.issueTask({ name: "IDE inspection", workspaceId: store.active().id, scope: taskScopeSchema.parse({ operations: ["dock.apply"], surfaces: ["main"], readableAssets: assets }) });
    const denied = task([]), allowed = task(["greeting"]);
    const request = { method: "dock.apply", params: { type: "configureIde", panelId: "ide", assetId: "greeting" } };
    expect(() => control.executeFor(denied, { ...request, version: control.version() })).toThrow();
    const old = control.version();
    control.executeFor(allowed, { ...request, version: old });
    expect(store.active().dock.panels.ide.sourceAssetId).toBe("greeting");
    expect(() => control.executeFor(allowed, { ...request, version: old })).toThrow();
  } finally { control.dispose(); }
});

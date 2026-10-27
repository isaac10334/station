import { test, expect } from "bun:test";
import { createComposition } from "../src/application";
import { migrateDock, validateDock, visitNode, type Stack } from "../src/core/docking";
import { resolveSlotReference } from "../src/core/docking";
import { embedWidgetRecipe, parseWidgetRecipe } from "../src/core/widget-definitions";
import { taskScopeSchema } from "@station/protocol";
import { cloneDesk, createDesk } from "../src/core/desks";
import { templateSetup } from "../src/core/desk-templates";

const setup = () => createComposition({ getItem: () => null, setItem: () => {} }, () => ({ run: async () => { throw new Error("No runner"); } }));
test("two shell prefabs resolve local references to fresh sibling instances, retain identity on reload, and reject broken bindings atomically", async () => {
  const app = setup();
  try {
    const spawn = () => app.store.dispatchDock({ type: "createWidget", widget: "app-shell", target: { surface: "dashboard", intent: "append" } });
    const a = spawn(), b = spawn(); expect(a.ok).toBe(true); expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error(JSON.stringify([a, b]));
    const layout = app.store.active().dock;
    const navFor = (rootId: string) => { const children: string[] = []; visitNode(layout.containers[rootId], n => { if (n.kind === "stack") children.push(...n.tabs); }); return children.map(id => layout.panels[id]).find(p => p.kind === "widget" && p.widget === "navigation")!; };
    const navA = navFor(a.panelId!), navB = navFor(b.panelId!);
    expect(navA.targetRef?.ownerId).not.toBe(navB.targetRef?.ownerId);
    expect(navA.targetRef?.nodeId).not.toBe(navB.targetRef?.nodeId);
    expect(resolveSlotReference(layout, navA.targetRef!)?.kind).toBe("stack");
    expect(validateDock(layout)).toBeNull();
    const loaded = migrateDock(JSON.parse(JSON.stringify(layout)));
    expect(loaded.panels[navA.id].targetRef).toEqual(navA.targetRef);
    expect(resolveSlotReference(loaded, navB.targetRef!)?.id).toBe(navB.targetRef!.nodeId);
    const cloned = cloneDesk(templateSetup(createDesk("Original", layout)), "Clone");
    const cloneRefs = Object.values(cloned.dock.panels).filter(p => !!p.targetRef);
    expect(cloneRefs.length).toBe(2);
    expect(cloneRefs.every(p => !!resolveSlotReference(cloned.dock, p.targetRef!))).toBe(true);
    expect(cloneRefs.every(p => p.targetRef!.nodeId !== navA.targetRef!.nodeId && p.targetRef!.nodeId !== navB.targetRef!.nodeId)).toBe(true);
    const before = app.store.active().dock;
    const broken = app.store.dispatchDock({ type: "createWidget", widget: "stack", target: { surface: "dashboard", intent: "append" }, slots: [[{ widget: "navigation", targetRef: { key: "foreign" } }]] });
    expect(broken.ok).toBe(false); expect(app.store.active().dock).toBe(before);
    const duplicate = app.store.dispatchDock({ type: "createWidget", widget: "stack", target: { surface: "dashboard", intent: "append" }, slots: [[{ widget: "clock", key: "same" }, { widget: "clock", key: "same" }]] });
    expect(duplicate.ok).toBe(false);
    const embedded = embedWidgetRecipe(parseWidgetRecipe(JSON.stringify({ version: 1, widget: "stack", title: "Compose", key: "root", slots: [[{ widget: "navigation", targetRef: { key: "main" } }], [{ widget: "main-surface", key: "main" }]] })));
    expect(embedded.slots![0][0].targetRef?.key).toBe(embedded.slots![1][0].key);
    expect(embedded.key).not.toBe("root");
  } finally { await app.dispose(); }
});

test("group membership and instance target operations enforce scoped writes and reject virtual destinations", async () => {
  const app = setup();
  try {
    const id = app.store.createWebAsset("Grouped");
    app.store.setAssetGroups([{ id: "editable", name: "Editable", parentId: null, assetIds: [] }]);
    const task = app.control.issueTask({ name: "Read only", workspaceId: app.store.active().id, scope: taskScopeSchema.parse({ operations: ["assets.group.move", "dock.apply"], readableAssets: [id], surfaces: ["bottom"] }) });
    expect(() => app.control.executeFor(task, { method: "assets.group.move", version: app.control.version(), params: { assetIds: [id], groupId: "editable" } })).toThrow();
    expect(() => app.control.execute({ method: "assets.group.move", params: { assetIds: [id], groupId: "station:builtins" } })).toThrow();
    app.control.execute({ method: "assets.group.move", params: { assetIds: [id], groupId: "editable" } });
    expect(app.store.active().assetGroups?.[0].assetIds).toEqual([id]);
    const navigation = app.store.dispatchDock({ type: "createWidget", widget: "navigation", target: { surface: "bottom", intent: "tab" } });
    if (!navigation.ok) throw new Error(navigation.reason);
    let slot: Stack | undefined; visitNode(app.store.active().dock.surfaces.main, n => { if (n.kind === "stack") slot = n; });
    expect(() => app.control.executeFor(task, { method: "dock.apply", version: app.control.version(), params: { type: "setWidgetTarget", panelId: navigation.panelId, reference: { surface: "main", nodeId: slot!.id } } })).toThrow();
    const list = app.store.dispatchDock({ type: "createWidget", widget: "widget-list", target: { surface: "bottom", intent: "tab" }, slots: [[{ widget: "clock", defaults: { listMode: "tab" } }]] });
    expect(list.ok).toBe(true); expect(validateDock(app.store.active().dock)).toBeNull();
  } finally { await app.dispose(); }
});

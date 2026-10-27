import { expect, test } from "bun:test";
import { createDockLayout, findNode, migrateDock, panelSlot, reduceDock, validateDock, type Command, type DockLayout } from "../src/core/docking";
import { createSvgViewportFit } from "../src/ui/lib/svg-viewport";
import { parseWidgetRecipe } from "../src/core/widget-definitions";

const target = { surface: "dashboard", intent: "append" } as const;
function apply(layout: DockLayout, command: Command) {
  const result = reduceDock(layout, command);
  if (!result.ok) throw new Error(result.reason);
  return result.layout;
}

test("SVG resize feedback is idempotent, ignores hidden/invalid sizes and refits a new document", () => {
  const writes: number[][] = [];
  const fit = createSvgViewportFit((...geometry) => writes.push(geometry));
  expect(fit(640.6, 480.9, 24, 24)).toBe(true);
  for (let i = 0; i < 100; i++) expect(fit(640.1, 480.2, 24, 24)).toBe(false);
  expect(writes).toEqual([[640, 480, 448 / 24]]);
  expect(fit(0, 0, 24, 24)).toBe(false);
  expect(fit(640, 480, 0, 0)).toBe(false);
  expect(fit(640, 480, NaN, 24)).toBe(false);
  expect(fit(640, 480, 24, 24, true)).toBe(true);
  expect(fit(375, 320, 24, 24)).toBe(true);
  expect(writes.at(-1)).toEqual([375, 320, 12]);
});

test("last-tab close, move and float preserve slots until explicit removal, including legacy autoClose", () => {
  for (const action of ["close", "move", "float"] as const) {
    let layout = apply(createDockLayout([]), { type: "createWidget", widget: "clock", id: "moving", target });
    layout = apply(layout, { type: "createWidget", widget: "weather", id: "destination", target });
    const source = panelSlot(layout, "moving")!.node.id;
    const destination = panelSlot(layout, "destination")!.node.id;
    layout = apply(layout, { type: "configureSlot", nodeId: source, autoClose: true });
    layout = apply(layout, action === "move" ? { type: "move", panelId: "moving", target: { ...target, intent: "tab", nodeId: destination } } : { type: action, panelId: "moving" });
    expect(findNode(layout, source)).toMatchObject({ tabs: [], keepEmpty: true });
    layout = migrateDock(JSON.parse(JSON.stringify(layout)));
    expect(findNode(layout, source)).toMatchObject({ tabs: [] });
    expect(validateDock(layout)).toBeNull();
    layout = apply(layout, { type: "removeSlot", nodeId: source });
    expect(findNode(layout, source)).toBeNull();
    expect(validateDock(layout)).toBeNull();
  }
});

test("slot opt-out and content sizing serialize; invalid configuration and occupied removal are atomic denials", () => {
  let layout = apply(createDockLayout([]), { type: "createWidget", widget: "clock", id: "sized", target });
  const slot = panelSlot(layout, "sized")!.node.id;
  layout = apply(layout, { type: "configureSlot", nodeId: slot, autoClose: false });
  layout = apply(layout, { type: "configurePanel", panelId: "sized", contentSizing: "scroll" });
  const restored = migrateDock(JSON.parse(JSON.stringify(layout)));
  expect(findNode(restored, slot)).toMatchObject({ autoClose: false });
  expect(restored.panels.sized).toMatchObject({ contentSizing: "scroll" });
  for (const command of [{ type: "removeSlot", nodeId: slot }, { type: "configureSlot", nodeId: "missing", autoClose: true }, { type: "configureSlot", nodeId: slot, autoClose: "yes" }, { type: "configurePanel", panelId: "sized", contentSizing: "unbounded" }] as Command[]) {
    const result = reduceDock(restored, command);
    expect(result.ok).toBe(false); expect(result.layout).toBe(restored);
  }
  expect(parseWidgetRecipe(JSON.stringify({ version: 1, widget: "clock", title: "Scrollable", defaults: { contentSizing: "scroll" } })).defaults.contentSizing).toBe("scroll");

});

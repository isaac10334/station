import { expect, test } from "bun:test";
import { parseWidgetDefinitionDrag } from "../src/ui/lib/widget-definition-drag";

test("definition child paths cannot be interpreted in another editor", () => {
  const drag = JSON.stringify({ widget: "clock", path: [0, 1], scope: "first-editor" });
  expect(parseWidgetDefinitionDrag(drag, "first-editor").path).toEqual([0, 1]);
  expect(() => parseWidgetDefinitionDrag(drag, "second-editor")).toThrow("within this editor");
  expect(() => parseWidgetDefinitionDrag(JSON.stringify({ widget: "clock", path: [0, 1] }), "first-editor")).toThrow("within this editor");
});

test("catalog copies are portable but malformed and root moves are rejected", () => {
  expect(parseWidgetDefinitionDrag(JSON.stringify({ widget: "clock", definitionId: "builtin:clock" }), "another-editor")).toEqual({ widget: "clock", definitionId: "builtin:clock", path: undefined });
  for (const path of [[], [0], [-1, 0], [0, 0.5], Array(34).fill(0)]) {
    expect(() => parseWidgetDefinitionDrag(JSON.stringify({ widget: "clock", path, scope: "editor" }), "editor")).toThrow("Invalid widget path");
  }
  for (const source of ["null", "[]", "{}", '{"widget":"unknown"}', '{"widget":"clock","definitionId":{}}']) {
    expect(() => parseWidgetDefinitionDrag(source, "editor")).toThrow();
  }
});

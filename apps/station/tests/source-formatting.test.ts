import { test, expect } from "bun:test";
import { formatSource } from "../src/ui/lib/format-source";
test("formatting parses supported source and preserves invalid input for recovery", async () => {
  expect(await formatSource("export const value={x:1}", "main.ts")).toBe("export const value = { x: 1 };\n");
  expect(await formatSource('{"x":1}', "data.json")).toBe('{ "x": 1 }\n');
  expect(await formatSource("return {x:1}", "main.js")).toContain("return { x: 1 }");
  await expect(formatSource("const = broken", "main.ts")).rejects.toThrow();
  await expect(formatSource("fn main() {}", "main.rs")).rejects.toThrow("unavailable");
});

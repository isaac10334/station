import { expect, test } from "bun:test";
import { join } from "node:path";

// DOM globals and React's browser-module cache stay inside an isolated process.
test("capture save presentation respects success, failure and exact instance identity", () => {
  const child = Bun.spawnSync([process.execPath, "test", join(import.meta.dir, "../test-fixtures/capture-presentation.tsx")], { stdout: "pipe", stderr: "pipe" });
  if (child.exitCode) throw new Error(new TextDecoder().decode(child.stderr));
  expect(child.exitCode).toBe(0);
});

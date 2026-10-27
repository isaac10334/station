/** Exercise machine-readable agent context and real CLI reverse dependency selection. */
import { test, expect } from "bun:test";
import { root } from "./local-loop";
function command(...args: string[]) {
  const child = Bun.spawnSync(["bun", "tooling/repo.ts", ...args, "--json"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: child.exitCode,
    value: JSON.parse(new TextDecoder().decode(child.stdout)),
  };
}
test("changed public contract selects its actual transitive Station consumers", () => {
  const { code, value } = command(
    "affected",
    "--files",
    "packages/capabilities/src/index.ts",
  );
  expect(code).toBe(0);
  expect(value.changed).toEqual(["@station/capabilities"]);
  expect(value.affected).toEqual([
    "@station/capabilities",
    "@station/sdk",
    "@station/ui",
    "@station/app",
    "@station/site",
  ]);
  expect(
    command("affected", "--files", "docs/README.md").value.affected,
  ).toEqual([]);
});
test("SDK context is compact, public and sufficient to run focused verification", () => {
  const { code, value } = command("context", "@station/sdk");
  expect(code).toBe(0);
  expect(value.exports["."].import).toBe("./dist/index.js");
  expect(value.dependencies).toEqual(["@station/capabilities"]);
  expect(value.verify).toBe("bun run repo verify @station/sdk");
  expect(value.owner).toBe("Station guest SDK");
  expect(command("context", "missing-package").code).toBe(2);
  expect(command("context", "capabilities").code).toBe(2);
});

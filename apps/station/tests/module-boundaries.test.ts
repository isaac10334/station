import { test, expect } from "bun:test";
import { readdir, readFile } from "node:fs/promises";

test("Station core depends on domain contracts, never presentation, providers, or service implementations", async () => {
  const core = new URL("../src/core/", import.meta.url);
  for (const name of await readdir(core)) {
    if (!name.endsWith(".ts")) continue;
    const source = await readFile(new URL(name, core), "utf8");
    expect(source).not.toMatch(/(?:from|import\s*\()\s*["'][^"']*(?:\/ui\/|\/services\/|\/providers\/|composition|react)["']/);
  }
});

import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { publishStagedOutputs } from "./staged-typescript-build";

test("staged package publication preserves unchanged mtimes and exposes complete changed modules", async () => {
  const directory = await mkdtemp(join(tmpdir(), "station-staged-build-"));
  const stage = join(directory, "stage"), output = join(directory, "dist");
  await mkdir(join(stage, "nested"), { recursive: true });
  await writeFile(join(stage, "nested/icons.js"), "export const Icon = 'complete';\n");
  try {
    expect(await publishStagedOutputs(stage, output)).toEqual({ written: 1, unchanged: 0 });
    const before = (await stat(join(output, "nested/icons.js"))).mtimeMs;
    expect(await publishStagedOutputs(stage, output)).toEqual({ written: 0, unchanged: 1 });
    expect((await stat(join(output, "nested/icons.js"))).mtimeMs).toBe(before);
    await writeFile(join(stage, "nested/icons.js"), "export const Icon = 'replacement';\n");
    expect(await publishStagedOutputs(stage, output)).toEqual({ written: 1, unchanged: 0 });
    expect(await readFile(join(output, "nested/icons.js"), "utf8")).toBe("export const Icon = 'replacement';\n");
  } finally {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep) || !directory.includes("station-staged-build-")) throw new Error("Unsafe test cleanup path");
    await rm(directory, { recursive: true, force: true });
  }
});

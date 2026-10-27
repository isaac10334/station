import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve, sep } from "node:path";

/** Publish complete compiler outputs without touching identical files. A live
 * frontend must never observe tsc truncating an imported module before rewriting
 * it. Failed compilation leaves the previous package outputs intact.
 * @example From a package: bun ../../tooling/staged-typescript-build.ts tsconfig.build.json
 */
export async function publishStagedOutputs(stage: string, output: string) {
  let written = 0, unchanged = 0;
  async function visit(relative = "") {
    for (const entry of await readdir(join(stage, relative), { withFileTypes: true })) {
      const path = join(relative, entry.name);
      if (entry.isDirectory()) { await visit(path); continue; }
      if (!entry.isFile()) throw new Error("Compiler outputs must be regular files");
      const bytes = await readFile(join(stage, path)), destination = join(output, path);
      const previous = await readFile(destination).catch(error => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      });
      if (previous?.equals(bytes)) { unchanged++; continue; }
      await mkdir(resolve(destination, ".."), { recursive: true });
      const temporary = `${destination}.station-write-${crypto.randomUUID()}.tmp`;
      try { await Bun.write(temporary, bytes); await rename(temporary, destination); written++; }
      finally { await rm(temporary, { force: true }); }
    }
  }
  await visit();
  return { written, unchanged };
}

export async function buildTypeScriptPackage(config = "tsconfig.build.json") {
  const cwd = resolve(process.cwd()), output = join(cwd, "dist");
  // A sibling of dist preserves source/declaration-map relative path depth.
  const stage = join(cwd, `.dist-stage-${crypto.randomUUID()}`);
  if (!stage.startsWith(cwd + sep)) throw new Error("Build staging escaped its package");
  const require = createRequire(join(cwd, "package.json"));
  const compiler = require.resolve("typescript/bin/tsc");
  try {
    const child = Bun.spawn([process.execPath, compiler, "-p", config, "--outDir", stage], { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    const code = await child.exited;
    if (code !== 0) throw new Error(`TypeScript package build failed (${code})`);
    const result = await publishStagedOutputs(stage, output);
    console.info(`Package outputs: ${result.written} changed, ${result.unchanged} unchanged`);
    return result;
  } finally {
    // This is the verified, unique package-local staging directory created above.
    await rm(stage, { recursive: true, force: true });
  }
}
if (import.meta.main) await buildTypeScriptPackage(process.argv[2]);

/** Resolve installed public entrypoints, then verify the owning manifest.
 * Build tools follow optional development links without hardcoded checkout paths.
 */
import { dirname, join } from "node:path";
import { readFileSync, realpathSync, existsSync } from "node:fs";
export function resolvedPackageRoot(
  name: string,
  from = import.meta.dir,
): string {
  let directory = dirname(realpathSync(Bun.resolveSync(name, from)));
  while (dirname(directory) !== directory) {
    const manifest = join(directory, "package.json");
    if (
      existsSync(manifest) &&
      JSON.parse(readFileSync(manifest, "utf8")).name === name
    )
      return directory;
    directory = dirname(directory);
  }
  throw new Error(`No owning manifest for ${name}`);
}

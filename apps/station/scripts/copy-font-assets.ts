import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Tailwind inlines Fontsource CSS but leaves its relative font URLs in generated.css.
const css = (await readFile("src/ui/generated.css", "utf8")).replaceAll("format('woff2-variations')", "format('woff2')");
await writeFile("src/ui/generated.css", css);
const names = [...new Set([...css.matchAll(/url\(\.\/files\/([^)]*\.(?:woff2?|ttf))\)/g)].map((match) => match[1]))];
await mkdir("src/ui/files", { recursive: true });
for (const name of names) {
  const packagePath = name.startsWith("ibm-plex-sans-")
    ? join(dirname(require.resolve("@fontsource-variable/ibm-plex-sans/package.json")), "files")
    : name.startsWith("ibm-plex-mono-")
      ? join(dirname(require.resolve("@fontsource/ibm-plex-mono/package.json")), "files")
      : null;
  if (!packagePath) throw new Error(`Unknown generated font asset: ${name}`);
  await copyFile(join(packagePath, name), join("src/ui/files", name));
}
console.log(`Copied ${names.length} Fonttrio assets`);

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Tailwind inlines Fontsource CSS but leaves its relative font URLs in generated.css.
const css = (await readFile("src/generated.css", "utf8")).replaceAll("format('woff2-variations')", "format('woff2')");
await writeFile("src/generated.css", css);
const names = [...new Set([...css.matchAll(/url\(\.\/files\/([^)]*\.(?:woff2?|ttf))\)/g)].map((match) => match[1]))];
await mkdir("src/files", { recursive: true });
for (const name of names) {
  const packagePath = name.startsWith("ibm-plex-sans-")
    ? "node_modules/@fontsource-variable/ibm-plex-sans/files"
    : name.startsWith("ibm-plex-mono-")
      ? "node_modules/@fontsource/ibm-plex-mono/files"
      : null;
  if (!packagePath) throw new Error(`Unknown generated font asset: ${name}`);
  await copyFile(join(packagePath, name), join("src/files", name));
}
console.log(`Copied ${names.length} Fonttrio assets`);

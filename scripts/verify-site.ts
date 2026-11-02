import { join, resolve } from "node:path";

/** Check static deployment paths and the production JSX contract in the actual output. */
export async function verifySite(directory = "apps/site/dist") {
  const html = await Bun.file(join(directory, "index.html")).text();
  const references = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]);
  for (const reference of references) {
    if (/^https?:\/\//.test(reference)) continue;
    if (!reference.startsWith("./")) throw new Error(`Site asset must support a Pages subpath: ${reference}`);
    const file = Bun.file(resolve(directory, reference));
    if (!(await file.exists())) throw new Error(`Missing site asset: ${reference}`);
    if (reference.endsWith(".js") && /\bjsxDEV\b/.test(await file.text()))
      throw new Error("Production site uses the unavailable React development JSX runtime");
  }
  if (!html.includes('href="https://github.com/isaac10334/station/releases/download/canary/canary-win-x64-Station-Setup-canary.exe"'))
    throw new Error("Static canary download fallback is missing");
  console.log("Verified production JSX, relative assets and JavaScript-free canary download");
}

if (import.meta.main) await verifySite(process.argv[2]);

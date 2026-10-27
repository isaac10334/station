import type { Asset } from "./asset-state";

/** Shared authored-file contract. Runtime artifacts and permission ledgers are separate. */
export interface SourceProject {
  id: string;
  instanceId: string;
  revision: number;
  files: Record<string, string>;
}
export function assetFiles(asset: Asset): Record<string, string> {
  return asset.kind === "web-content"
    ? (asset.files ?? { "index.html": asset.html })
    : asset.files;
}
/** Paths are relative, normalized, and never escape the virtual project. */
export function validSourcePath(path: string): boolean {
  return (
    path.length <= 240 &&
    /^[\w./-]+$/.test(path) &&
    !path.startsWith("/") &&
    path
      .split("/")
      .every((part) => part !== ".." && part !== "." && part !== "")
  );
}

export const WEB_PROJECT_STARTER = {
  "index.html":
    '<div id="app"></div><script type="module" src="./src/main.ts"></script><link rel="stylesheet" href="./src/styles.css">',
  "src/main.ts":
    'import { connect } from "@station/sdk";\nconst station = await connect();\ndocument.querySelector<HTMLDivElement>("#app")!.textContent = "Hello from Station";\nstation.theme.subscribe(theme => { document.documentElement.style.colorScheme = theme.mode; });\n',
  "src/styles.css":
    "body { margin: 0; padding: 16px; font-family: var(--station-font, system-ui); background: var(--station-frame); color: var(--station-fg); }",
};

/** Exact source and toolchain identity of one sandbox document. */
export interface WebBuild {
  instanceId: string;
  revision: number;
  sourceHash: string;
  documentHash: string;
  document: string;
  toolchain: "esbuild-wasm@0.28.2";
}

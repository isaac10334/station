import * as esbuild from "esbuild-wasm";
import type { Plugin } from "esbuild-wasm";

let resources: Record<string, string> = {};
let initialized: Promise<void>;
function normalize(path: string) {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}
const loader = (path: string): esbuild.Loader =>
  path.endsWith(".tsx")
    ? "tsx"
    : path.endsWith(".ts")
      ? "ts"
      : path.endsWith(".json")
        ? "json"
        : path.endsWith(".css")
          ? "css"
          : "jsx";
self.onmessage = async (event) => {
  const { id, op, files, entries } = event.data;
  try {
    if (op === "init") {
      resources = event.data.resources;
      const bytes = Uint8Array.from(atob(event.data.wasm), (char) =>
        char.charCodeAt(0),
      );
      initialized = esbuild.initialize({
        wasmModule: await WebAssembly.compile(bytes),
        worker: false,
      });
      await initialized;
      self.postMessage({ id, value: true });
      return;
    }
    await initialized;
    const sources = { ...resources, ...files };
    const resolve = (path: string): string => {
      for (const candidate of [
        path,
        ...[
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
          ".json",
          "/index.ts",
          "/index.js",
        ].map((extension) => path + extension),
      ])
        if (sources[candidate] !== undefined) return candidate;
      const json = sources[`${path}/package.json`];
      if (json) {
        const pkg = JSON.parse(json);
        return resolve(
          normalize(`${path}/${pkg.module ?? pkg.main ?? "index.js"}`),
        );
      }
      throw new Error(
        `Cannot resolve ${path}. Use local files, @station/sdk, React or React DOM.`,
      );
    };
    const plugin: Plugin = {
      name: "station-files",
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (/^(https?:|node:|data:)/.test(args.path))
            return {
              errors: [{ text: "Remote and Node imports are unavailable" }],
            };
          let path: string;
          if (args.path === "@station/ui") path = "node_modules/@station/ui/index.js";
          else if (args.path === "@station/sdk")
            path = "node_modules/@station/sdk/index.js";
          else if (args.path.startsWith("."))
            path = normalize(
              `${args.importer.slice(0, args.importer.lastIndexOf("/") + 1)}${args.path}`,
            );
          else if (args.kind === "entry-point") path = normalize(args.path);
          else if (/^(react|react-dom|scheduler)(\/|$)/.test(args.path))
            path = `node_modules/${args.path}`;
          else
            return {
              errors: [{ text: `Unsupported dependency: ${args.path}` }],
            };
          try {
            return { path: resolve(path), namespace: "station" };
          } catch (error) {
            return { errors: [{ text: String(error) }] };
          }
        });
        build.onLoad({ filter: /.*/, namespace: "station" }, (args) => ({
          contents: sources[args.path],
          loader: loader(args.path),
        }));
      },
    };
    const results = await Promise.all(
      entries.map(async (entry: string) => {
        const result = await esbuild.build({
          entryPoints: [entry],
          bundle: true,
          write: false,
          minify: true,
          plugins: [plugin],
          format: "esm",
          target: "es2022",
          platform: "browser",
          define: { "process.env.NODE_ENV": '"production"' },
          outfile: entry.endsWith(".css") ? "output.css" : "output.js",
        });
        return {
          entry,
          outputs: result.outputFiles.map((file) => ({
            path: file.path,
            text: file.text,
          })),
        };
      }),
    );
    self.postMessage({ id, value: results });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

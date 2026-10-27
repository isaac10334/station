/** Bundle for Node, then pass a generated P3 Component path. No production changes. */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { probeRquickjsRuntime } from "./rquickjs-runtime-probe";

const [componentPath] = process.argv.slice(2);
if (!componentPath) throw new Error("Pass the generated P3 Component path");
const require = createRequire(resolve("apps/station/package.json"));
const bytes = new Uint8Array(await readFile(resolve(componentPath)));
const shim = new Uint8Array(await readFile(join(dirname(require.resolve("@polyengine/translator/package.json")), "esm/translator_shim.wasm")));
const report = await probeRquickjsRuntime(bytes, shim, process.versions);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.initialProbePassed ? 0 : 1;

import { join, dirname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { copyFile, mkdir, cp } from "node:fs/promises";
import { desktopProfile } from "../desktop/profile";

/** Package only public runtime resources. Credentials are never copied. */
await mkdir("dist/desktop", { recursive: true });
const acceptance = process.env.STATION_DESKTOP_ACCEPTANCE === "1";
const development = process.env.STATION_DESKTOP_DEV === "1";
await Bun.write("dist/desktop/profile.json", JSON.stringify({
  ...desktopProfile(acceptance, development),
  acceptance,
  development,
  ...(development ? { sourceDirectory: process.cwd() } : {}),
  updatesEnabled: !development && (!acceptance || !!process.env.STATION_DESKTOP_TEST_FEED),
}));
const worker = await Bun.build({
  entrypoints: ["src/providers/component-worker.ts"],
  target: "browser",
  minify: true,
});
if (!worker.success || worker.outputs.length !== 1)
  throw new Error("Component worker build failed", { cause: worker.logs });
await Bun.write("dist/desktop/component-worker.js", worker.outputs[0]);
await copyFile(
  join(dirname(require.resolve("@polyengine/translator/package.json")), "esm/translator_shim.wasm"),
  "dist/desktop/translator.wasm",
);
await copyFile("vercel-sandbox.json", "dist/desktop/vercel-sandbox.json");
await copyFile("../../packages/ui/assets/station.ico", "dist/desktop/station.ico");
await cp('.runtime/scripting','dist/desktop/scripting',{recursive:true});
await cp('.runtime/vectorcraft','dist/desktop/vectorcraft',{recursive:true});

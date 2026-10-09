import { copyFile, mkdir } from "node:fs/promises";

/** Package only public runtime resources. Credentials are never copied. */
await mkdir("dist/desktop", { recursive: true });
const worker = await Bun.build({
  entrypoints: ["src/component-worker.ts"],
  target: "browser",
  minify: true,
});
if (!worker.success || worker.outputs.length !== 1)
  throw new Error("Component worker build failed", { cause: worker.logs });
await Bun.write("dist/desktop/component-worker.js", worker.outputs[0]);
await copyFile(
  "node_modules/@polyengine/translator/esm/translator_shim.wasm",
  "dist/desktop/translator.wasm",
);
await copyFile("vercel-sandbox.json", "dist/desktop/vercel-sandbox.json");

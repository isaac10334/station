import app from "./index.html";
import { join } from "node:path";
import { createStationApi } from "./station-server";

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  development: process.env.NODE_ENV !== "production",
  routes: { "/": app },
  fetch: createStationApi({
    artifactDir: join(import.meta.dir, ".artifacts"),
    sandboxConfig: join(import.meta.dir, "vercel-sandbox.json"),
    translator: join(
      import.meta.dir,
      "node_modules/@polyengine/translator/esm/translator_shim.wasm",
    ),
  }),
});
console.log(`Station: ${server.url}`);

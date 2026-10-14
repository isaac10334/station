import { createWorkspaceRooms, type ShareSocketData } from "./workspace-rooms";
import app from "../index.html";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { createStationApi } from "./station-server";

const rooms = createWorkspaceRooms();
const api = createStationApi({
  artifactDir: join(import.meta.dir, "../../../.artifacts"),
  sandboxConfig: join(import.meta.dir, "../vercel-sandbox.json"),
  translator: join(
    dirname(require.resolve("@polyengine/translator/package.json")),
    "esm/translator_shim.wasm",
  ),
});
const server = Bun.serve<ShareSocketData>({
  maxRequestBodySize: 2_000_000,
  hostname: process.env.STATION_HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  development: process.env.NODE_ENV !== "production",
  routes: { "/": app },
  websocket: rooms.websocket,
  fetch: (request, server) => {
    if (new URL(request.url).pathname.startsWith("/api/share/"))
      return rooms.fetch(request, server);
    const address = server.requestIP(request)?.address;
    const exposed =
      process.env.STATION_HOST &&
      !["127.0.0.1", "::1", "localhost"].includes(process.env.STATION_HOST);
    if (
      new URL(request.url).pathname.startsWith("/api/component/") &&
      (exposed ||
        (address &&
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)))
    )
      return new Response(
        "Component API is disabled on a shared network server",
        { status: 403 },
      );
    return api(request);
  },
});
console.log(`Station: ${server.url}`);

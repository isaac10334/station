import { createWorkspaceRooms, type ShareSocketData } from "./workspace-rooms";
import app from "../index.html";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { createStationApi } from "./station-server";
import { createControlBroker } from "./control-broker";
import { tmpdir } from "node:os";
import { createVectorcraftResources } from "./vectorcraft-resources";
const vectorcraftResources = createVectorcraftResources(join(import.meta.dir, "../.runtime/vectorcraft"));

const ownerToken = crypto.randomUUID();
const agentControl = process.env.STATION_AGENT_CONTROL === "1" ? createControlBroker(ownerToken, `http://127.0.0.1:${Number(process.env.PORT || 3000)}`, join(tmpdir(), "station-agent-control")) : null;
if (agentControl && process.env.STATION_HOST && process.env.STATION_HOST !== "127.0.0.1") throw new Error("Agent control requires a loopback host");

const rooms = createWorkspaceRooms();
const api = createStationApi({
  artifactDir: join(import.meta.dir, "../../../.artifacts"),
  sandboxConfig: join(import.meta.dir, "../vercel-sandbox.json"),
  translator: join(
    dirname(require.resolve("@polyengine/translator/package.json")),
    "esm/translator_shim.wasm",
  ),
}, ownerToken);
const server = Bun.serve<ShareSocketData>({
  maxRequestBodySize: 2_000_000,
  hostname: process.env.STATION_HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  development: process.env.NODE_ENV !== "production",
  routes: { "/": app },
  websocket: rooms.websocket,
  fetch: async (request, server) => {
    const vectorcraft = await vectorcraftResources(request);
    if (vectorcraft) return vectorcraft;
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/dev-control")) return new Response("Retired; use scoped agent control", { status: 404 });
    if (path === "/api/app-bootstrap") {
      if (request.headers.get("sec-fetch-site") !== "same-origin" || request.headers.get("host") !== `127.0.0.1:${server.port}`) return new Response("Unavailable", { status: 403 });
      return Response.json({ token: ownerToken }, { headers: { "Cache-Control": "no-store" } });
    }
    if (path === "/api/control-bootstrap") {
      if (!agentControl || request.headers.get("sec-fetch-site") !== "same-origin" || request.headers.get("host") !== `127.0.0.1:${server.port}`) return new Response("Unavailable", { status: 403 });
      return Response.json({ token: ownerToken }, { headers: { "Cache-Control": "no-store" } });
    }
    if (path.startsWith("/api/control/")) return agentControl?.fetch(request) ?? new Response("Agent control disabled", { status: 404 });
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

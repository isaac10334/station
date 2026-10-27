/** Public web deployment. Deliberately excludes native/control credentials,
 * Component builds and the legacy unauthenticated room prototype.
 */
import app from "../index.html";
import { createAccountBackend } from "./accounts/backend";
import { join } from "node:path";
import { createVectorcraftResources } from "./vectorcraft-resources";
const vectorcraftResources = createVectorcraftResources(join(import.meta.dir, "../.runtime/vectorcraft"));

const origin = process.env.STATION_ACCOUNT_ORIGIN;
const secret = process.env.STATION_AUTH_SECRET;
if (!origin || !secret) throw new Error("Set STATION_ACCOUNT_ORIGIN and STATION_AUTH_SECRET");
const backend = await createAccountBackend({ origin, secret, database: process.env.DATABASE_URL ?? process.env.STATION_ACCOUNT_DB ?? ".station-cloud/accounts.sqlite" });
const server = Bun.serve({
  hostname: process.env.STATION_HOST ?? "0.0.0.0", port: Number(process.env.PORT ?? 3014),
  maxRequestBodySize: 16_384, idleTimeout: 30,
  development: false, routes: { "/": app },
  async fetch(request, server) {
    const vectorcraft = await vectorcraftResources(request);
    if (vectorcraft) return vectorcraft;
    const path = new URL(request.url).pathname;
    if (path === "/healthz") return Response.json({ ok: true });
    if (path.startsWith("/api/account/") || path.startsWith("/api/auth/")) {
      // Never trust a client-supplied proxy/IP header for authentication throttles.
      const headers = new Headers(request.headers);
      headers.set("x-station-client-ip", server.requestIP(request)?.address ?? "unknown");
      return backend.fetch(new Request(request, { headers }));
    }
    return new Response("Unavailable on Station cloud", { status: 404 });
  },
});
console.log(`Station cloud: ${server.url}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, async () => { await server.stop(true); await backend.close(); process.exit(0); });

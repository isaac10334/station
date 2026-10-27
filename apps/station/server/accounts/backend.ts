import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { openAccountDatabase } from "./database";
import { createAccountAuth } from "./auth";
import { createAccountService } from "./service";

/** Explicit deployment configuration; absence never creates an insecure auth
 * fallback. SQLite needs a persistent volume; Postgres uses a normal pooled URL.
 */
export async function createAccountBackend(config: { origin: string; secret: string; database: string }) {
  const url = new URL(config.origin);
  if (url.origin !== config.origin || (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Account origin must be an exact HTTPS origin (HTTP allowed on loopback)");
  if (!/^postgres(?:ql)?:/.test(config.database) && config.database !== ":memory:") await mkdir(dirname(config.database), { recursive: true });
  const db = await openAccountDatabase(config.database);
  let auth;
  try { auth = await createAccountAuth({ ...config, database: db.database }); }
  catch (error) { await db.machines.close(); throw error; }
  const service = createAccountService(auth, db.machines, config.origin);
  return {
    async fetch(request: Request) {
      const path = new URL(request.url).pathname;
      if (path === "/api/account/config") return Response.json({ enabled: true }, { headers: { "Cache-Control": "no-store" } });
      if (path.startsWith("/api/auth/")) return auth.handler(request);
      return service.fetch(request);
    },
    async close() { service.close(); await db.machines.close(); },
  };
}

import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import type { openAccountDatabase } from "./database";

/** One explicit origin and database per deployment. Cookie caching stays off so
 * remote revocation takes effect on the next authenticated request.
 */
export async function createAccountAuth(options: {
  origin: string; secret: string;
  database: Awaited<ReturnType<typeof openAccountDatabase>>["database"];
}) {
  if (options.secret.length < 32) throw new Error("STATION_AUTH_SECRET must contain at least 32 random characters");
  const auth = betterAuth({
    appName: "Station", baseURL: options.origin, secret: options.secret,
    database: options.database, trustedOrigins: [options.origin],
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    advanced: { cookiePrefix: "station", useSecureCookies: options.origin.startsWith("https:"), ipAddress: { ipAddressHeaders: ["x-station-client-ip"] } },
  });
  const migrations = await getMigrations(auth.options);
  await migrations.runMigrations();
  return auth;
}
export type AccountAuth = Awaited<ReturnType<typeof createAccountAuth>>;

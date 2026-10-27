import { Database } from "bun:sqlite";
import { Pool } from "pg";

export interface MachineObservation { sessionId: string; userId: string; machineId: string; name: string; lastSeen: number; rendererId?: string; clientType?: "web" | "desktop"; connections?: { rendererId: string; clientType: "web" | "desktop"; lastSeen: number }[] }
/** Durable metadata provider; identity/session authority remains in Better Auth.
 * Browser installation IDs and labels are self-reported, never machine attestation.
 * Inject an in-memory implementation in service tests.
 */
export interface MachineStore {
  list(userId: string): Promise<MachineObservation[]>;
  observe(value: MachineObservation): Promise<void>;
  close(): Promise<void>;
}
export async function openAccountDatabase(location: string) {
  const postgres = /^postgres(?:ql)?:/.test(location);
  const db = postgres ? new Pool({ connectionString: location, max: 5 }) : new Database(location, { create: true });
  if (db instanceof Database) { db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;"); }
  async function query(sql: string, args: (string | number)[] = []): Promise<any[]> {
    if (db instanceof Pool) return (await db.query(sql, args)).rows;
    return db.query(sql.replace(/\$\d+/g, "?")).all(...args);
  }
  await query(`CREATE TABLE IF NOT EXISTS station_machine_session (
    "sessionId" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "machineId" TEXT NOT NULL,
    name TEXT NOT NULL, "lastSeen" BIGINT NOT NULL)`);
  await query('CREATE INDEX IF NOT EXISTS station_machine_user ON station_machine_session ("userId")');
  await query('CREATE TABLE IF NOT EXISTS station_renderer_presence ("rendererId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "userId" TEXT NOT NULL, "clientType" TEXT NOT NULL, "lastSeen" BIGINT NOT NULL, PRIMARY KEY ("userId", "rendererId"))');
  await query('CREATE INDEX IF NOT EXISTS station_presence_user ON station_renderer_presence ("userId")');
  const machines: MachineStore = {
    async list(userId) {
      const connections = await query('SELECT * FROM station_renderer_presence WHERE "userId" = $1 AND "lastSeen" > $2 ORDER BY "lastSeen" DESC LIMIT 256', [userId, Date.now() - 45_000]);
      return (await query('SELECT * FROM station_machine_session WHERE "userId" = $1', [userId])).map(row => ({ ...row, lastSeen: Number(row.lastSeen), connections: connections.filter(c => c.sessionId === row.sessionId).map(c => ({ rendererId: c.rendererId, clientType: c.clientType, lastSeen: Number(c.lastSeen) })) }));
    },
    async observe(v) { await query(`INSERT INTO station_machine_session ("sessionId", "userId", "machineId", name, "lastSeen") VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT ("sessionId") DO UPDATE SET "machineId" = excluded."machineId", name = excluded.name, "lastSeen" = excluded."lastSeen"`, [v.sessionId, v.userId, v.machineId, v.name, v.lastSeen]);
      if (v.rendererId) await query('INSERT INTO station_renderer_presence ("rendererId", "sessionId", "userId", "clientType", "lastSeen") VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("userId", "rendererId") DO UPDATE SET "sessionId"=excluded."sessionId", "clientType"=excluded."clientType", "lastSeen"=excluded."lastSeen"', [v.rendererId, v.sessionId, v.userId, v.clientType ?? "web", v.lastSeen]);
      await query('DELETE FROM station_renderer_presence WHERE "lastSeen" < $1', [Date.now() - 86_400_000]);
    },
    async close() { if (db instanceof Pool) await db.end(); else db.close(); },
  };
  return { database: db, machines };
}

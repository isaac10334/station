import { z } from "zod";

const id = z.string().min(1).max(128);
export const machineInput = z.object({ machineId: z.uuid(), name: z.string().trim().min(1).max(80), rendererId: z.uuid().optional(), clientType: z.enum(["web", "desktop"]).default("web") }).strict();
export const connectionView = z.object({ rendererId: z.string(), clientType: z.enum(["web", "desktop"]), lastSeen: z.number() });
export const sessionView = z.object({
  id, current: z.boolean(), machineId: z.string().nullable(), name: z.string(),
  createdAt: z.string(), expiresAt: z.string(), lastSeen: z.number().nullable(), online: z.boolean(),
  browser: z.string(), platform: z.string(), connections: z.array(connectionView),
});
export const accountSnapshot = z.object({
  user: z.object({ id, name: z.string(), email: z.string() }),
  sessions: z.array(sessionView),
});
/** Account commands authorize against the authenticated account on every call.
 * Revocation is idempotent; heartbeats are last-observation-wins. No workspace
 * authority or local agent grants are conveyed by an account session.
 */
export const accountOperations = {
  "account.inspect": { input: z.object({}).strict(), output: accountSnapshot, effects: ["account:read"] },
  "account.heartbeat": { input: machineInput, output: z.object({ ok: z.literal(true) }), effects: ["presence:write"] },
  "account.revoke": { input: z.object({ sessionId: id }).strict(), output: z.object({ ok: z.literal(true) }), effects: ["session:revoke"] },
  "account.ping": { input: z.object({ sessionId: id }).strict(), output: z.object({ delivered: z.boolean() }), effects: ["presence:signal"] },
} as const;
export type AccountSnapshot = z.infer<typeof accountSnapshot>;
export type AccountMethod = keyof typeof accountOperations;
export const accountEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("changed") }),
  z.object({ type: z.literal("revoked") }),
  z.object({ type: z.literal("ping"), from: z.string().max(80) }),
]);

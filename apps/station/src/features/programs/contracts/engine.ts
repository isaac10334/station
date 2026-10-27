/** Private worker transport for separately inspected scripting and portable UI profiles. */
import { z } from "zod";
export const MAX_OUTPUT = 16384;
export const MAX_MEMORY = 64 * 1024 * 1024;
export const TRANSLATOR_HASH = "ddb2e0144a9c5a1d65ff6ba05c45f913cc4111bc92a11624a44ae49486260e13";
export const SERVICES = "loopkit:scripting/services@0.1.0";
export const SURFACES = "loopkit:ui/surfaces@0.1.0";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().refine(value => new TextEncoder().encode(value).byteLength <= MAX_OUTPUT, "Payload exceeds limit");
const id = z.number().int().positive();
export const manifestSchema = z.object({
  profile: z.enum(["loop-scripting-0.1","loop-portable-ui-0.1"]), sha256: hash, bytes: z.number().int().positive().max(10 * 1024 * 1024),
  sourceSha256: hash, importsSha256: hash, compilerSha256: z.literal("bc9d5aa48905e55760f18cb92ed988a34534ff0ce8824a71d6650464f8a68c63"),
  toolchain: z.literal("nightly-2026-09-08"), authoredSha256: hash,
}).strict();
export type EngineManifest = z.infer<typeof manifestSchema>;
export const requestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("init"), bytes: z.instanceof(Uint8Array), shim: z.instanceof(Uint8Array), manifest: manifestSchema }).strict(),
  z.object({ op: z.enum(["evaluate", "start"]), source: z.string().max(131072).refine(value => new TextEncoder().encode(value).byteLength <= 131072), input: text }).strict(),
  z.object({ op: z.literal("dispatch"), input: text }).strict(),
]);
export type EngineRequest = z.infer<typeof requestSchema>;
export const hostCallSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("invoke"), binding: z.string().max(64), input: text }).strict(),
  z.object({ op: z.literal("subscribe"), binding: z.string().max(64), input: text }).strict(),
  z.object({ op: z.literal("open") }).strict(),
  z.object({ op: z.enum(["next", "next-event", "cancel", "dispose"]), resource: id }).strict(),
  z.object({ op: z.literal("render"), resource: id, document: z.string().max(65536) }).strict(),
]);
export type HostCall = z.infer<typeof hostCallSchema>;
export const replySchema = z.object({ kind: z.literal("reply"), id, ok: z.boolean(), value: text.optional(), error: z.string().max(1024).optional() }).strict();
export const hostRequestSchema = z.object({ kind: z.literal("host"), id, call: hostCallSchema }).strict();
export const hostReplySchema = z.object({ kind: z.literal("host-reply"), id, ok: z.boolean(), value: z.union([text, z.number().int().positive(), z.null()]).optional(), error: z.string().max(1024).optional() }).strict();
export const envelopeSchema = z.object({ id, request: requestSchema }).strict();
export const logSchema=z.object({kind:z.literal('log'),text:text}).strict();

/** Minimal transport implemented by both a browser Worker and Node worker_threads. */
export interface EnginePort { send(value: unknown): void; listen(listener: (value: unknown) => void): void }
export interface EngineWorker extends EnginePort { terminate(): void; onError(listener: (error: Error) => void): void }

export function bounded(value: string): string {
  return text.parse(value);
}

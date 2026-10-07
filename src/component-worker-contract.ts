import type { BuiltArtifact } from "./build-contract";

/** The worker receives exact verified bytes and runs one invocation. */
export type ComponentWorkerRequest = { bytes: ArrayBuffer; input: string; artifact: BuiltArtifact; grants: string[]; postedAt: number };
export type ComponentWorkerReply =
  | { ok: true; output: string; logs: string[]; surfaceText: string; durationMs: number; timings: { startupMs: number; assetLoadMs: number; translatorMs: number; translateMs: number; instantiateMs: number; firstCallMs: number } }
  | { ok: false; error: string };

/** Browser transport for verified P3 Component bytes and a one-shot fixed worker. */
import { sha256, type BuiltArtifact } from "./build-contract";
import { REQUIRED_GRANTS } from "./component-contract";
import { hasCurrentArtifact, type ComponentAsset } from "./model";
import type { ComponentWorkerReply, ComponentWorkerRequest } from "./component-worker-contract";

export type RunResult = Extract<ComponentWorkerReply, { ok: true }>;
/** A scoped invocation contract; caller revocation is passed as an AbortSignal and terminates the worker. */
export interface ComponentRunner {
  run(asset: ComponentAsset, input: string, grants: ReadonlySet<string>, signal?: AbortSignal): Promise<RunResult>;
}

/** Select Polyengine only for the inspected P3 profile; errors never trigger a fallback. */
export function createPolyengineRunner(): ComponentRunner { return { run: runComponent }; }

/** A profile is selected once, before invocation; failures never select another runtime. */
export function selectComponentRuntime(artifact: BuiltArtifact): "polyengine" {
  if (artifact.schemaVersion === 2 && artifact.profile === "component-model-0.3") return "polyengine";
  throw new Error(`No compatible Component runtime for ${artifact.profile ?? "legacy P2 or unknown profile"}. Rebuild as P3.`);
}

async function runComponent(asset: ComponentAsset, input: string, grants: ReadonlySet<string>, signal?: AbortSignal): Promise<RunResult> {
  if (!asset.artifact) throw new Error("Build the current P3 source before running.");
  selectComponentRuntime(asset.artifact);
  if (!hasCurrentArtifact(asset)) throw new Error("Build the current P3 source before running.");
  for (const required of REQUIRED_GRANTS) if (!grants.has(required)) throw new Error(`Import denied: ${required}`);
  if (signal?.aborted) throw new Error("Component run cancelled.");
  const { sha256: hash, bytes: expectedBytes } = asset.artifact;
  const response = await fetch(`/api/artifacts/${hash}.wasm`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("Built artifact unavailable. Rebuild this Component.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== expectedBytes || await sha256(bytes) !== hash) throw new Error("Built artifact bytes failed verification.");
  if (signal?.aborted) throw new Error("Component run cancelled.");
  return new Promise((resolve, reject) => {
    const worker = new Worker("/api/component/worker.js", { type: "module" });
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      settle();
    };
    const onAbort = () => finish(() => reject(new Error("Component run cancelled.")));
    const timeout = setTimeout(() => finish(() => reject(new Error("Component run timed out."))), 30_000);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<ComponentWorkerReply>) => {
      const reply = event.data;
      finish(() => reply.ok ? resolve(reply) : reject(new Error(reply.error)));
    };
    worker.onerror = () => finish(() => reject(new Error("Component worker failed to load or execute.")));
    const request: ComponentWorkerRequest = { bytes: bytes.buffer as ArrayBuffer, input, artifact: asset.artifact!, grants: [...grants], postedAt: performance.timeOrigin + performance.now() };
    worker.postMessage(request, [request.bytes]);
    if (signal?.aborted) onAbort();
  });
}

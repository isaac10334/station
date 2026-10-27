/** Browser transport for verified P3 Component bytes and a one-shot fixed worker. */
import { sha256, type BuiltArtifact } from "../core/build-contract";
import { REQUIRED_GRANTS } from "../core/component-contract";
import { hasCurrentArtifact, type ComponentAsset } from "../core/asset-state";
import type { ComponentWorkerReply, ComponentWorkerRequest } from "../contracts/component-worker";

import type { ComponentRunner, RunResult } from "../contracts/component-runtime";
export type { ComponentRunner, RunResult } from "../contracts/component-runtime";


/** Select Polyengine only for the inspected P3 profile; errors never trigger a fallback. */
/** Runtime resources are supplied by a trusted host; no guest chooses paths or a worker. */
export interface ComponentRuntimeResources {
  readArtifact(hash: string, signal?: AbortSignal): Promise<Uint8Array>;
  readTranslator(signal?: AbortSignal): Promise<Uint8Array>;
  createWorker(): Worker;
}
export function createPolyengineRunner(resources?: ComponentRuntimeResources): ComponentRunner { return { run: (asset, input, grants, signal) => runComponent(asset, input, grants, signal, resources) }; }

/** A profile is selected once, before invocation; failures never select another runtime. */
export function selectComponentRuntime(artifact: BuiltArtifact): "polyengine" {
  if (artifact.schemaVersion === 2 && artifact.profile === "component-model-0.3") return "polyengine";
  throw new Error(`No compatible Component runtime for ${artifact.profile ?? "legacy P2 or unknown profile"}. Rebuild as P3.`);
}

async function runComponent(asset: ComponentAsset, input: string, grants: ReadonlySet<string>, signal?: AbortSignal, resources?: ComponentRuntimeResources): Promise<RunResult> {
  if (!asset.artifact) throw new Error("Build the current P3 source before running.");
  selectComponentRuntime(asset.artifact);
  if (!hasCurrentArtifact(asset)) throw new Error("Build the current P3 source before running.");
  for (const required of REQUIRED_GRANTS) if (!grants.has(required)) throw new Error(`Import denied: ${required}`);
  if (signal?.aborted) throw new Error("Component run cancelled.");
  const { sha256: hash, bytes: expectedBytes } = asset.artifact;
  const bytes = resources ? await resources.readArtifact(hash, signal) : await (async () => {
    const response = await fetch(`/api/artifacts/${hash}.wasm`, { cache: "no-store", signal });
    if (!response.ok) throw new Error("Built artifact unavailable. Rebuild this Component.");
    return new Uint8Array(await response.arrayBuffer());
  })();
  const translatorBytes = resources ? await resources.readTranslator(signal) : undefined;
  if (bytes.byteLength !== expectedBytes || await sha256(bytes) !== hash) throw new Error("Built artifact bytes failed verification.");
  if (signal?.aborted) throw new Error("Component run cancelled.");
  return new Promise((resolve, reject) => {
    const worker = resources?.createWorker() ?? new Worker("/api/component/worker.js", { type: "module" });
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
    const request: ComponentWorkerRequest = { bytes: bytes.buffer as ArrayBuffer, ...(translatorBytes ? { translatorBytes: translatorBytes.buffer as ArrayBuffer } : {}), input, artifact: asset.artifact!, grants: [...grants], postedAt: performance.timeOrigin + performance.now() };
    worker.postMessage(request, [request.bytes, ...(request.translatorBytes ? [request.translatorBytes] : [])]);
    if (signal?.aborted) onAbort();
  });
}

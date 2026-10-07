/** Fixed, one-shot Polyengine worker. No artifact-specific JavaScript is evaluated. */
import { Translator } from "@polyengine/runtime/shim";
import { instantiate } from "@polyengine/runtime/embedder";
import { sha256 } from "./build-contract";
import { inspectComponentPlan } from "./component-plan";
import { createRunTabProviders } from "./run-providers";
import type { ComponentWorkerRequest, ComponentWorkerReply } from "./component-worker-contract";

self.onmessage = async (event: MessageEvent<ComponentWorkerRequest>) => {
  const started = performance.now();
  try {
    const { bytes: buffer, input, artifact, grants } = event.data;
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength !== artifact.bytes || await sha256(bytes) !== artifact.sha256)
      throw new Error("Artifact bytes failed worker verification.");
    const asset = await fetch("/api/component/translator.wasm", { cache: "no-store" });
    if (!asset.ok) throw new Error("Pinned Polyengine translator unavailable.");
    const translatorBytes = new Uint8Array(await asset.arrayBuffer());
    if (await sha256(translatorBytes) !== artifact.translatorSha256)
      throw new Error("Polyengine translator hash mismatch.");
    const assetLoaded = performance.now();
    const translator = await Translator.create(translatorBytes);
    const translatorReady = performance.now();
    const translated = translator.translate(bytes);
    const inspection = inspectComponentPlan(translated.plan);
    if (inspection.worldDigest !== artifact.worldDigest || JSON.stringify(inspection.imports) !== JSON.stringify(artifact.imports))
      throw new Error("Artifact import profile changed after build.");
    const translatedAt = performance.now();
    const providers = createRunTabProviders(new Set(grants), new AbortController().signal);
    const instance = await instantiate({ plan: translated.plan, adapters: translated.adapters, componentBytes: bytes }, providers.imports);
    const instantiatedAt = performance.now();
    const output = await instance.exports.run(input);
    if (typeof output !== "string" || output.length > 4096) throw new Error("Component output exceeds the run limit.");
    const finished = performance.now();
    const reply: ComponentWorkerReply = { ok: true, output, ...providers.snapshot(), durationMs: Math.round(finished - started), timings: {
      startupMs: Math.max(0, performance.timeOrigin + started - event.data.postedAt),
      assetLoadMs: assetLoaded - started, translatorMs: translatorReady - assetLoaded,
      translateMs: translatedAt - translatorReady,
      instantiateMs: instantiatedAt - translatedAt, firstCallMs: finished - instantiatedAt,
    } };
    self.postMessage(reply);
  } catch (error) {
    const reply: ComponentWorkerReply = { ok: false, error: error instanceof Error ? error.message : String(error) };
    self.postMessage(reply);
  }
};

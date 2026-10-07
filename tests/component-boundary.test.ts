import { expect, test } from "bun:test";
import { Translator } from "@polyengine/runtime/shim";
import { inspectComponentPlan } from "../src/component-plan";
import { createRunTabProviders } from "../src/run-providers";
import { createPolyengineRunner, selectComponentRuntime } from "../src/component-runtime";
import { HOST_CLOCK, HOST_FEED, HOST_LOG, REQUIRED_GRANTS } from "../src/component-contract";
import { createStore } from "../src/model";
import { sha256 } from "../src/build-contract";

test("legacy P2 profiles receive a named incompatibility without fallback", () => {
  expect(() => selectComponentRuntime({ profile: "component-model-0.2" } as any)).toThrow("No compatible Component runtime for component-model-0.2");
});

const localComponent = Bun.file("components/greeting/target/wasm32-wasip2/release/greeting.wasm");
const translationTest = await localComponent.exists() ? test : test.skip;
translationTest("inspection rejects an unprovided import before instantiation", async () => {
  const shim = new Uint8Array(await Bun.file("node_modules/@polyengine/translator/esm/translator_shim.wasm").arrayBuffer());
  const wasm = new Uint8Array(await localComponent.arrayBuffer());
  const plan = (await Translator.create(shim)).translate(wasm).plan;
  expect(inspectComponentPlan(plan).imports).toContain("wasi:clocks/monotonic-clock@0.3.1");
  plan.imports.push({ name: "wasi:sockets/network@0.3.0", path: ["connect"], kind: "func", type: 0 });
  expect(() => inspectComponentPlan(plan)).toThrow("Unsupported Component import");
});

test("host effects recheck grants and cancellation", () => {
  const grants = new Set([HOST_LOG, HOST_FEED]);
  const abort = new AbortController();
  const providers = createRunTabProviders(grants, abort.signal);
  const host = providers.imports["unit:workspace/host@0.3.0"];
  host.log("allowed");
  grants.delete(HOST_LOG);
  expect(() => host.log("denied")).toThrow(`Import denied: ${HOST_LOG}`);
  abort.abort();
  expect(() => host.feed("after abort")).toThrow("cancelled");
  expect(providers.snapshot().logs).toEqual(["allowed"]);
  const clock = createRunTabProviders(new Set<string>(), new AbortController().signal).imports["wasi:clocks/monotonic-clock@0.3"];
  expect(() => clock.now()).toThrow(`Import denied: ${HOST_CLOCK}`);
});

test("tampered artifact bytes fail before worker creation", async () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const unit = store.selected()!;
  unit.artifact = { schemaVersion: 2, buildId: crypto.randomUUID(), id: unit.id, revision: unit.revision, sourceSha256: "a".repeat(64), sha256: "b".repeat(64),
    bytes: 3, builtBy: "vercel-sandbox", profile: "component-model-0.3", worldDigest: "sha256:fixture", imports: [],
    toolchain: "fixture", snapshotId: "fixture", witSha256: "c".repeat(64), translatorSha256: "d".repeat(64) };
  const originalFetch = globalThis.fetch;
  let workerCreated = false;
  const OriginalWorker = globalThis.Worker;
  try {
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]));
    globalThis.Worker = class { constructor() { workerCreated = true; } } as unknown as typeof Worker;
    await expect(createPolyengineRunner().run(unit, "World", new Set(REQUIRED_GRANTS))).rejects.toThrow("bytes failed verification");
    expect(workerCreated).toBe(false);
  } finally { globalThis.fetch = originalFetch; globalThis.Worker = OriginalWorker; }
});

test("cancellation terminates an active worker", async () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const unit = store.selected()!;
  const bytes = new Uint8Array([1, 2, 3]);
  unit.artifact = { schemaVersion: 2, buildId: crypto.randomUUID(), id: unit.id, revision: unit.revision, sourceSha256: "a".repeat(64), sha256: await sha256(bytes),
    bytes: bytes.length, builtBy: "vercel-sandbox", profile: "component-model-0.3", worldDigest: "sha256:fixture", imports: [],
    toolchain: "fixture", snapshotId: "fixture", witSha256: "c".repeat(64), translatorSha256: "d".repeat(64) };
  const abort = new AbortController();
  const originalFetch = globalThis.fetch;
  const OriginalWorker = globalThis.Worker;
  let terminated = false;
  try {
    globalThis.fetch = async () => new Response(bytes);
    globalThis.Worker = class { postMessage() { abort.abort(); } terminate() { terminated = true; } } as unknown as typeof Worker;
    await expect(createPolyengineRunner().run(unit, "World", new Set(REQUIRED_GRANTS), abort.signal)).rejects.toThrow("cancelled");
    expect(terminated).toBe(true);
  } finally { globalThis.fetch = originalFetch; globalThis.Worker = OriginalWorker; }
});

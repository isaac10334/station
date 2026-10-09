import { expect, test } from "bun:test";
import { createComposition } from "../src/composition";
import { createPolyengineRunner } from "../src/component-runtime";
import { REQUIRED_GRANTS } from "../src/component-contract";
import { sourceSha256, witSha256, type BuiltArtifact } from "../src/build-contract";
import type { ComponentRunner } from "../src/component-runtime";

async function ready(run?: ComponentRunner["run"]) {
  const calls: string[] = [];
  const deps = createComposition({ getItem: () => null, setItem: () => {} }, () => ({
    async run(_asset, input, grants, signal) {
      calls.push(input);
      if (run) return run(_asset, input, grants, signal);
      return { ok: true, output: input, logs: [], surfaceText: "", durationMs: 0,
        timings: { startupMs: 0, assetLoadMs: 0, translatorMs: 0, translateMs: 0, instantiateMs: 0, firstCallMs: 0 } };
    },
  }));
  const asset = deps.store.selected()!;
  const artifact: BuiltArtifact = { schemaVersion: 2, buildId: crypto.randomUUID(), id: asset.id, revision: asset.revision,
    sourceSha256: await sourceSha256(asset.files), witSha256: await witSha256(asset.files),
    sha256: "a".repeat(64), bytes: 100, builtBy: "vercel-sandbox", profile: "component-model-0.3",
    worldDigest: "sha256:fixture", imports: [], toolchain: "fixture", snapshotId: "fixture", translatorSha256: "b".repeat(64) };
  deps.store.installArtifact(deps.store.active().id, { id: asset.id, revision: asset.revision, files: { ...asset.files } }, artifact, asset.instanceId);
  for (const grant of REQUIRED_GRANTS) deps.store.setGrant(asset.id, grant, true);
  return { deps, calls };
}

test("composition selects the P3 runner and preserves the current source contract", async () => {
  const { deps, calls } = await ready();
  const asset = deps.store.selected()!;
  const result = await deps.runner.run(asset, "World", new Set(REQUIRED_GRANTS));
  expect(result.output).toBe("World");
  expect(calls).toEqual(["World"]);
  deps.store.editFile(asset.id, "src/lib.rs", asset.files["src/lib.rs"] + "\n");
  await expect(deps.runner.run(deps.store.selected()!, "again", new Set(REQUIRED_GRANTS))).rejects.toThrow("Source changed");
  await deps.dispose();
});

test("revoking a grant denies the next invocation", async () => {
  const { deps } = await ready();
  deps.store.setGrant("greeting", REQUIRED_GRANTS[0], false);
  await expect(deps.runner.run(deps.store.selected()!, "World", new Set(REQUIRED_GRANTS))).rejects.toThrow("Import denied");
  await deps.dispose();
});

test("the Polyengine runner rejects missing current bytes", async () => {
  const deps = createComposition({ getItem: () => null, setItem: () => {} });
  await expect(createPolyengineRunner().run(deps.store.selected()!, "World", new Set(REQUIRED_GRANTS))).rejects.toThrow("Build the current P3 source");
  await deps.dispose();
});

test("running Components are reflected in named scopes and grant revocation aborts them", async () => {
  let started!: () => void;
  const running = new Promise<void>(resolve => { started = resolve; });
  const { deps } = await ready(async (_asset, _input, _grants, signal) => {
    started();
    return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new Error("Run aborted")), { once: true }));
  });
  const invocation = deps.runner.run(deps.store.selected()!, "Live run", new Set(REQUIRED_GRANTS)).catch(error => error);
  await running;
  const snapshot = deps.diagnostics.inspect();
  const run = snapshot.scopes.find(scope => scope.name.startsWith("Run · Greeting"))!;
  expect(run.parentId).toBe(snapshot.scopes.find(scope => scope.name === deps.store.active().name)!.id);
  expect(run.acquisitions[0].state).toBe("active");
  deps.store.setGrant("greeting", REQUIRED_GRANTS[0], false);
  expect((await invocation).message).toBe("Run aborted");
  expect(deps.diagnostics.inspect().scopes.some(scope => scope.id === run.id)).toBe(false);
  expect(deps.diagnostics.inspect().providers.every(provider => provider.acquisitions.length === 0)).toBe(true);
  await deps.dispose();
});

test("host disposal between acquisition and invocation never starts a retained runner", async () => {
  const { deps, calls } = await ready();
  let disposal: Promise<void> | undefined;
  const unsubscribe = deps.diagnostics.subscribe(() => {
    if (!disposal && deps.diagnostics.inspect().scopes.some(scope => scope.name.startsWith("Run ·") && scope.acquisitions.some(item => item.state === "active"))) {
      disposal = deps.dispose();
    }
  });
  await expect(deps.runner.run(deps.store.selected()!, "Never start", new Set(REQUIRED_GRANTS))).rejects.toThrow("cancelled");
  expect(calls).toHaveLength(0);
  await disposal;
  unsubscribe();
});

test("one-run approval expires without authorizing another invocation", async () => {
  const { deps, calls } = await ready();
  for (const key of REQUIRED_GRANTS) deps.store.setGrant("greeting", key, false);
  const asset = deps.store.selected()!;
  expect((await deps.approveAndRun(asset, "Once", false)).output).toBe("Once");
  expect(deps.runApprovals.inspect()).toEqual([]);
  expect(Object.values(deps.store.selected()!.grants).some(Boolean)).toBe(false);
  await expect(deps.runner.run(asset, "Again", new Set(REQUIRED_GRANTS))).rejects.toThrow("Import denied");
  expect(calls).toEqual(["Once"]);
  await deps.dispose();
});

test("active one-run authority is inspectable and can be revoked even with no saved grant", async () => {
  let started!: () => void;
  const running = new Promise<void>(resolve => { started = resolve; });
  const { deps } = await ready(async (_asset, _input, _grants, signal) => {
    started();
    return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new Error("Run aborted")), { once: true }));
  });
  for (const key of REQUIRED_GRANTS) deps.store.setGrant("greeting", key, false);
  const asset = deps.store.selected()!;
  const invocation = deps.approveAndRun(asset, "Once", false).catch(error => error);
  await running;
  expect(deps.runApprovals.inspect()[0].instanceId).toBe(asset.instanceId);
  await expect(deps.runner.run(asset, "Concurrent", new Set(REQUIRED_GRANTS))).rejects.toThrow("Import denied");
  deps.store.setGrant("greeting", REQUIRED_GRANTS[0], false);
  expect((await invocation).message).toBe("Run aborted");
  expect(deps.runApprovals.inspect()).toEqual([]);
  await deps.dispose();
});

test("always allow persists and stale approval never grants a changed asset", async () => {
  const { deps } = await ready();
  for (const key of REQUIRED_GRANTS) deps.store.setGrant("greeting", key, false);
  const asset = deps.store.selected()!;
  await deps.approveAndRun(asset, "Remember", true);
  expect(REQUIRED_GRANTS.every(key => deps.store.selected()!.grants[key])).toBe(true);
  expect((await deps.runner.run(deps.store.selected()!, "Again", new Set(REQUIRED_GRANTS))).output).toBe("Again");
  for (const key of REQUIRED_GRANTS) deps.store.setGrant("greeting", key, false);
  deps.store.editFile(asset.id, "src/lib.rs", asset.files["src/lib.rs"] + "\n");
  await expect(deps.approveAndRun(asset, "Stale", true)).rejects.toThrow("changed while awaiting approval");
  expect(Object.values(deps.store.selected()!.grants).some(Boolean)).toBe(false);
  await deps.dispose();
});

import { expect, test } from "bun:test";
import { createComposition } from "../src/composition";
import { createPolyengineRunner } from "../src/component-runtime";
import { REQUIRED_GRANTS } from "../src/component-contract";
import { sourceSha256, witSha256, type BuiltArtifact } from "../src/build-contract";

async function ready() {
  const calls: string[] = [];
  const deps = createComposition({ getItem: () => null, setItem: () => {} }, () => ({
    async run(_unit, input) {
      calls.push(input);
      return { ok: true, output: input, logs: [], surfaceText: "", durationMs: 0,
        timings: { startupMs: 0, assetLoadMs: 0, translatorMs: 0, translateMs: 0, instantiateMs: 0, firstCallMs: 0 } };
    },
  }));
  const unit = deps.store.selected()!;
  const artifact: BuiltArtifact = { schemaVersion: 2, buildId: crypto.randomUUID(), id: unit.id, revision: unit.revision,
    sourceSha256: await sourceSha256(unit.files), witSha256: await witSha256(unit.files),
    sha256: "a".repeat(64), bytes: 100, builtBy: "vercel-sandbox", profile: "component-model-0.3",
    worldDigest: "sha256:fixture", imports: [], toolchain: "fixture", snapshotId: "fixture", translatorSha256: "b".repeat(64) };
  deps.store.installArtifact(deps.store.active().id, { id: unit.id, revision: unit.revision, files: { ...unit.files } }, artifact, unit.instanceId);
  for (const grant of REQUIRED_GRANTS) deps.store.setGrant(unit.id, grant, true);
  return { deps, calls };
}

test("composition selects the P3 runner and preserves the current source contract", async () => {
  const { deps, calls } = await ready();
  const unit = deps.store.selected()!;
  const result = await deps.runner.run(unit, "World", new Set(REQUIRED_GRANTS));
  expect(result.output).toBe("World");
  expect(calls).toEqual(["World"]);
  deps.store.editFile(unit.id, "src/lib.rs", unit.files["src/lib.rs"] + "\n");
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

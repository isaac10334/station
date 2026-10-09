import { expect, test } from "bun:test";
import { validateSource, type BuiltArtifact } from "../src/build-contract";
import { createStore, hasCurrentArtifact } from "../src/model";

test("build source accepts the asset project but rejects escaping paths", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const asset = store.selected()!;
  expect(validateSource({ id: asset.id, revision: asset.revision, files: asset.files }).id).toBe("greeting");
  expect(() => validateSource({ id: asset.id, revision: 0, files: { ...asset.files, "../escape.rs": "" } }))
    .toThrow("Only Rust, WIT, and Cargo.toml");
});

test("a build only installs for the source revision submitted", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const workspaceId = store.active().id;
  const asset = store.selected()!;
  const source = { id: asset.id, revision: asset.revision, files: { ...asset.files } };
  store.editFile(asset.id, "src/lib.rs", `${asset.files["src/lib.rs"]}\n`);
  const artifact: BuiltArtifact = { schemaVersion: 2, buildId: crypto.randomUUID(), id: asset.id, revision: source.revision, sourceSha256: "a".repeat(64), sha256: "b".repeat(64), bytes: 10, builtBy: "vercel-sandbox", profile: "component-model-0.3", worldDigest: "sha256:fixture", imports: [], toolchain: "fixture", snapshotId: "fixture", witSha256: "c".repeat(64), translatorSha256: "d".repeat(64) };
  expect(store.installArtifact(workspaceId, source, artifact, asset.instanceId)).toBe(false);
  const current = store.selected()!;
  const editedSource = { id: current.id, revision: current.revision, files: { ...current.files } };
  expect(store.installArtifact(workspaceId, editedSource, { ...artifact, revision: editedSource.revision }, current.instanceId)).toBe(true);
  expect(hasCurrentArtifact(store.selected()!)).toBe(true);
  store.editFile(asset.id, "src/lib.rs", `${current.files["src/lib.rs"]} `);
  expect(hasCurrentArtifact(store.selected()!)).toBe(false);
});

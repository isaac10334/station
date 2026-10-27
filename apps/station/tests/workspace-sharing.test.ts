import { expect, test } from "bun:test";
import {
  WorkspaceRoom,
  sharedSource,
  sourceAsset,
} from "../src/core/workspace-sharing";
import { createStore } from "../src/features/workspace/application/store";
import { hasCurrentArtifact } from "../src/core/asset-state";
const source = {
  id: "notes",
  kind: "web-content" as const,
  name: "Notes",
  description: "",
  revision: 0,
  files: { "index.html": "one" },
};
test("room grants and exact revisions reject foreign, denied and concurrent edits atomically", () => {
  const room = new WorkspaceRoom("Work", [source]),
    owner = room.join("owner", "Host"),
    viewer = room.join("viewer", "Friend"),
    agent = room.join("editor", "Agent", "agent");
  expect(() =>
    room.replaceFiles(viewer.id, "notes", 0, { "index.html": "denied" }),
  ).toThrow("not granted");
  expect(() => room.replaceFiles(agent.id, "other", 0, {})).toThrow("outside");
  room.replaceFiles(owner.id, "notes", 0, { "index.html": "two" });
  expect(() =>
    room.replaceFiles(agent.id, "notes", 0, { "index.html": "lost" }),
  ).toThrow("changed");
  expect(room.sources.get("notes")?.files["index.html"]).toBe("two");
  expect(() =>
    room.replaceFiles(owner.id, "notes", 1, { "../outside": "escape" }),
  ).toThrow();
  room.members.delete(agent.id);
  expect(() => room.replaceFiles(agent.id, "notes", 1, {})).toThrow(
    "not granted",
  );
  expect(() =>
    room.presence(owner.id, { desk: "Desk", cursor: { x: 2, y: 0 } }),
  ).toThrow();
});
test("shared source excludes private authority; applying it retains desk identity and viewer policy is session-only", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} }),
    asset = store.active().assets[0];
  const wire = sharedSource(asset);
  expect(wire).not.toHaveProperty("grants");
  expect(wire).not.toHaveProperty("artifact");
  const guest = sourceAsset(wire);
  if (guest.kind === "component") {
    expect(guest.grants).toEqual({});
    expect(hasCurrentArtifact(guest)).toBe(false);
  }
  const id = store.joinSharedWorkspace("Friend", [source]),
    deskId = store.desk().id;
  store.setSourceAccess(id, false);
  expect(() => store.editFile("notes", "index.html", "denied")).toThrow(
    "viewing only",
  );
  store.applySharedSources(id, [
    { ...source, revision: 1, files: { "index.html": "shared" } },
  ]);
  expect(store.desk().id).toBe(deskId);
  expect(store.selected()).toBe(null);
  store.importAssets([sourceAsset({ ...source, id: "private-copy" })]);
  store.editFile("private-copy", "index.html", "my copy");
  expect(store.canEditSource("notes")).toBe(false);
  expect(store.canEditSource("private-copy")).toBe(true);
  store.setSourceAccess(id, true);
  store.editFile("notes", "index.html", "local");
  expect(
    store.active().assets.find((asset) => asset.id === "notes")!.revision,
  ).toBe(2);
});
test("room acknowledgement never rewinds local build currency", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const existing = { ...store.active().assets[0], revision: 20 };
  const wire = {
    ...sharedSource(existing),
    revision: 2,
    files: { ...sharedSource(existing).files, "notes.txt": "changed" },
  };
  const changed = sourceAsset(wire, existing);
  expect(changed.revision).toBe(21);
  expect(sourceAsset({ ...wire, revision: 3 }, changed).revision).toBe(21);
});

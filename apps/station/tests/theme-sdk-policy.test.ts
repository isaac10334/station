import { expect, test } from "bun:test";
import { createComposition } from "../src/application";
import {
  createPackageRuntime,
  EDITOR_SESSION,
} from "../src/services/package-runtime";
import { EditorSession, editorSessions } from "../src/services/editor-session";
import {
  parseManifest,
  type PackageInstallation,
} from "../src/core/package-assets";

// Exercise the actual SDK adapter, including a handle acquired before access changes.
test("retained SDK editor handles recheck resource viewer policy on edit/remove/rename", async () => {
  const deps = createComposition({ getItem: () => null, setItem: () => {} });
  const store = deps.store;
  const id = store.createDataAsset("theme", "Shared theme");
  store.dispatchDock({ type: "openAsset", assetId: id });
  const owner = store.active().dock.panels[`asset-view:${id}`];
  const asset = store.active().assets.find((asset) => asset.id === id)!;
  const session = new EditorSession(asset);
  editorSessions.set(owner.id, session);
  const installation: PackageInstallation = {
    id: "editor-test",
    name: "Editor test",
    packageAssetId: "package-test",
    revision: 0,
    enabled: true,
    manifest: parseManifest(
      JSON.stringify({
        version: 1,
        id: "editor-test",
        name: "Editor test",
        contributions: [
          {
            id: "theme-editor",
            title: "Theme editor",
            role: "editor",
            assetId: "guest-source",
            capabilities: [EDITOR_SESSION],
          },
        ],
      }),
    ),
    assets: [],
    builds: {},
    grants: { "theme-editor": [EDITOR_SESSION] },
  };
  store.installPackage(installation);
  const live = store.active().installations[0];
  const connection = createPackageRuntime(deps).contributionBindings(
    store.active(),
    owner,
    live,
    live.manifest.contributions[0],
  );
  try {
    const handle = await connection.bindings.acquire(EDITOR_SESSION, "1.0.0");
    const initial = handle.methods.snapshot() as { revision: number; files: Record<string, string> };
    expect(initial.files["theme.json"]).toBe(asset.files["theme.json"]);
    expect(handle.methods.editIfCurrent("theme.json", initial.files["theme.json"], initial.revision)).toEqual({ revision: initial.revision + 1 });
    expect(() => handle.methods.editIfCurrent("theme.json", "{}", initial.revision)).toThrow("Stale asset revision");
    store.setSourceAccess(store.active().id, false, [id]);
    const before = store
      .active()
      .assets.find((asset) => asset.id === id)!.revision;
    expect(() => handle.methods.edit("theme.json", "{}")).toThrow(
      "viewing only",
    );
    expect(() => handle.methods.remove("theme.json")).toThrow("viewing only");
    expect(() => handle.methods.rename("theme.json", "other.json")).toThrow(
      "viewing only",
    );
    expect(() => handle.methods.editIfCurrent("theme.json", "{}", before)).toThrow("viewing only");
    expect((handle.methods.snapshot() as { revision: number }).revision).toBe(before);
    expect(Object.keys(handle.methods.files() as object)).toContain(
      "theme.json",
    );
    expect(
      store.active().assets.find((asset) => asset.id === id)!.revision,
    ).toBe(before);
    store.setSourceAccess(store.active().id, true);
    expect(() =>
      handle.methods.edit("theme.json", asset.files!["theme.json"]),
    ).not.toThrow();
    handle.release();
    expect(() => handle.methods.snapshot()).toThrow();
    expect(() => handle.methods.editIfCurrent("theme.json", "{}", before)).toThrow();
  } finally {
    connection.dispose();
    editorSessions.delete(owner.id);
    session.dispose();
    await deps.dispose();
  }
});

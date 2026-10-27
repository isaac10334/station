import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { taskScopeSchema } from "@station/protocol";
import { EMPTY_NOTE, parseRichNote, noteValueSchema } from "../src/core/notes";
import { createStore } from "../src/features/workspace/application/store";
import { createStationControl } from "../src/features/commands/application/runtime";
import { createVectorEditorSessions } from "../src/services/vector-editor-sessions";
import { createVectorcraftResources } from "../server/vectorcraft-resources";

test("rich notes retain structured formatting, reject active content and preserve invalid authored source for recovery", () => {
  const source = JSON.stringify({ version: 1, blocks: [{ type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Station", styles: { bold: true } }], children: [] }] });
  expect(JSON.stringify(parseRichNote(source))).toBe(source);
  for (const block of [{ type: "image", url: "https://example.com" }, { type: "link", href: "javascript:alert(1)" }])
    expect(() => parseRichNote(JSON.stringify({ version: 1, blocks: [block] }))).toThrow();
  expect(noteValueSchema.safeParse({ format: "note", source: "{" }).success).toBe(false);
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
  const store = createStore(storage), id = store.createDataAsset("note", "A note");
  expect(store.active().assets.find(a => a.id === id)!.files!["note.json"]).toBe(EMPTY_NOTE);
  store.patchFiles(id, 0, { "note.json": "{repair this source" });
  expect(createStore(storage).active().assets.find(a => a.id === id)!.files!["note.json"]).toBe("{repair this source");
});

test("note widget references preserve inline drafts and docking identity across save and missing references", () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
  const store = createStore(storage), assetId = store.createDataAsset("markdown", "Shared");
  const placed = store.dispatchDock({ type: "createWidget", widget: "note", target: { surface: "dashboard", intent: "append" } });
  const panelId = placed.panelId!;
  expect(store.dispatchDock({ type: "configureNote", panelId, value: { format: "markdown", source: "**Private draft**" }, sourceAssetId: assetId }).ok).toBe(true);
  expect(store.dispatchDock({ type: "configureNote", panelId, sourceAssetId: null }).ok).toBe(true);
  const panel = createStore(storage).active().dock.panels[panelId];
  expect(panel.note?.source).toBe("**Private draft**");
  expect(panel.sourceAssetId).toBeUndefined();
  expect(panel.id).toBe(panelId);
});

test("VectorCraft operations share permissions, source revisions, cancellation and mounted session lifetime", async () => {
  const store = createStore({ getItem: () => null, setItem: () => {} }), sessions = createVectorEditorSessions();
  const control = createStationControl(store, { vectorEditors: sessions });
  const call = (method: string, params: object = {}) => control.execute({ method, params, version: control.version() }).result;
  const created = call("asset.create", { kind: "svg", name: "Drawing" });
  const opened = call("asset.open", { assetId: created.id, editorId: "station:vectorcraft" });
  const asset = store.active().assets.find(a => a.id === created.id)!;
  let calls = 0, aborted = false;
  const binding = { assetId: asset.id, panelId: opened.panelId, revision: asset.revision };
  const registration = { ...binding, workspaceId: store.active().id,
    commands: async () => [], export: async () => ({ source: asset.files!["image.svg"] }),
    execute: async (_command: unknown, signal: AbortSignal) => { calls++; return await new Promise((_, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("Cancelled")); }, { once: true })); },
  };
  const unregister = sessions.register(registration);
  try {
    const issue = (scope: object) => control.issueTask({ name: "Vector test", workspaceId: store.active().id, scope: taskScopeSchema.parse({ operations: ["vector.editor.commands", "vector.editor.execute", "vector.editor.export"], surfaces: ["main"], ...scope }) });
    const denied = issue({ readableAssets: [asset.id] });
    expect(() => control.executeFor(denied, { method: "vector.editor.execute", version: control.version(), params: { ...binding, command: { id: "shape.rectangle" } } })).toThrow("editing");
    const partial = issue({ editableAssets: [asset.id], fileAccess: { [asset.id]: { read: [], write: ["other.txt"] } } });
    expect(() => control.executeFor(partial, { method: "vector.editor.export", version: control.version(), params: binding })).toThrow("whole-source");
    const forbidden = call("vector.editor.execute", { ...binding, command: { id: "app.export" } });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(call("operations.inspect", { operationId: forbidden.operationId }).status).toBe("failed");
    expect(calls).toBe(0);
    const operation = call("vector.editor.execute", { ...binding, command: { id: "shape.rectangle" } });
    call("operations.cancel", { operationId: operation.operationId });
    expect(aborted).toBe(true);
    expect(call("operations.inspect", { operationId: operation.operationId }).status).toBe("cancelled");
    expect(store.active().assets.find(a => a.id === asset.id)!.revision).toBe(asset.revision);
    store.patchFiles(asset.id, asset.revision, { "image.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"/>" });
    const stale = call("vector.editor.export", binding);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(call("operations.inspect", { operationId: stale.operationId }).status).toBe("failed");
    const replacement = sessions.register({ ...registration });
    unregister();
    expect(() => sessions.get(store.active().id, opened.panelId, asset.id, asset.revision)).not.toThrow();
    replacement();
    expect(() => sessions.get(store.active().id, opened.panelId, asset.id, asset.revision)).toThrow("Open");
  } finally { sessions.dispose(); control.dispose(); }
});

test("public vendor route restricts paths and forces opaque HTML sandboxing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "station-vector-test-"));
  await writeFile(join(directory, "vendor.json"), "{}");
  await writeFile(join(directory, "index.html"), "<!doctype html><html><head></head><body></body></html>");
  const serve = createVectorcraftResources(directory);
  try {
  expect(await serve(new Request("http://localhost/api/private"))).toBeNull();
  const status = await serve(new Request("http://localhost/integrations/vectorcraft/status"));
  expect((await status!.json()).available).toBe(true);
  const editor = await serve(new Request("http://localhost/integrations/vectorcraft/editor"));
  expect(editor!.headers.get("Content-Security-Policy")).toBe("sandbox allow-scripts");
  const html = await editor!.text();
  expect(html).toContain("default-src 'none'");
  expect(html).not.toContain("allow-same-origin");
  const escape = await serve(new Request("http://localhost/integrations/vectorcraft/..%5c..%5cpackage.json"));
  expect(escape!.status).toBe(404);
  expect((await serve(new Request("http://localhost/integrations/vectorcraft/%ZZ")))!.status).toBe(400);
  } finally { await unlink(join(directory, "index.html")); await unlink(join(directory, "vendor.json")); await rmdir(directory); }
});

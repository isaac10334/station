import { expect, test } from "bun:test";
import { createComposition } from "../src/application";
import { resolveEditor } from "../src/core/asset-routing";
import { resolveAssetReference } from "../src/core/asset-references";
import { taskScopeSchema } from "@station/protocol";
import { assetCatalog } from "@station/capabilities";
const setup = () => { const values = new Map<string, string>(); return createComposition({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, () => ({ run: async () => { throw new Error("No runner"); } })); };

test("declarative policies resolve identity references, reject incompatible choices and preserve independent source variants", async () => {
  const app = setup();
  try {
    const icon = app.control.execute({ method: "asset.create", params: { name: "Icon", kind: "svg" } }).result;
    const policy = app.control.execute({ method: "asset.create", params: { name: "Open SVG", kind: "decision", files: { "decision.json": JSON.stringify({ version: 1, purpose: "asset.editor", rules: [{ kind: "svg", editorId: "uninstalled/editor" }], fallback: "station" }) } } }).result;
    app.control.execute({ method: "routing.configure", params: { policyId: policy.id, assetId: icon.id } });
    const source = app.store.active().assets.find(a => a.id === icon.id)!;
    const routed = resolveEditor(app.store.active(), source);
    expect(routed.editorId).toBe("station");
    expect(routed.reason).toContain("incompatible");
    expect(resolveEditor(app.store.active(), source, "station").reason).toBe("Explicit selection");
    app.store.patchAssetMetadata(icon.id, { name: "Renamed icon" });
    expect(resolveAssetReference(app.store.active().assets, { assetId: icon.id }, a => a.kind === "svg").ok).toBe(true);
    expect(resolveAssetReference(app.store.active().assets, { assetId: policy.id }, a => a.kind === "svg").ok).toBe(false);
    const fork = app.control.execute({ method: "asset.fork", params: { assetId: icon.id, name: "Variant" } }).result;
    const variant = app.store.active().assets.find(a => a.id === fork.id)!;
    expect(variant.origin).toEqual({ assetId: icon.id, revision: source.revision });
    expect(variant.editorPolicyId).toBeUndefined();
    const builtin = app.control.execute({ method: "assets.catalog" }).result.find((a: any) => a.id.startsWith("builtin:"));
    const builtFork = app.control.execute({ method: "asset.fork", params: { assetId: builtin.id, name: "Built-in variant" } }).result;
    expect(app.store.active().assets.find(a => a.id === builtFork.id)!.origin?.assetId).toBe(builtin.id);
    const opened = app.control.execute({ method: "asset.open", params: { assetId: icon.id, presentation: "peek" } }).result;
    expect(app.store.active().dock.floating[opened.panelId].presentation).toBe("peek");
    expect(app.control.execute({ method: "asset.open", params: { assetId: icon.id, presentation: "peek" } }).result.panelId).toBe(opened.panelId);
    expect(() => app.control.execute({ method: "asset.open", params: { assetId: icon.id, editorId: "uninstalled/editor" } })).toThrow("incompatible");
  } finally { await app.dispose(); }
});

test("partial-file grants filter source and reject escape paths, whole-source operations, ungranted commands and foreign telemetry", async () => {
  const app = setup();
  try {
    const id = app.store.createWebAsset("Restricted");
    app.store.patchFiles(id, app.store.active().assets.find(a => a.id === id)!.revision, { "src/a.ts": "public", "src/nested/b.ts": "nested", "src-not/a.ts": "private", "private.env": "private" });
    const context = app.control.issueTask({ name: "Scoped", workspaceId: app.store.active().id, scope: taskScopeSchema.parse({ operations: ["asset.read", "asset.files.patch", "asset.fork", "asset.open", "runtime.inspect", "web.build"], readableAssets: [id], editableAssets: [id], create: true, surfaces: ["main"], fileAccess: { [id]: { read: ["src/"], write: ["src/a.ts"] } } }) });
    const read = app.control.executeFor(context, { method: "asset.read", params: { assetId: id } }).result;
    expect(read.files["src/a.ts"]).toBe("public");
    expect(read.files["src/nested/b.ts"]).toBe("nested");
    expect(Object.keys(read.files).every(path => path.startsWith("src/"))).toBe(true);
    expect(read.files["private.env"]).toBeUndefined();
    expect(read.files["src-not/a.ts"]).toBeUndefined();
    const write = (path: string) => app.control.executeFor(context, { method: "asset.files.patch", version: app.control.version(), params: { assetId: id, expectedAssetRevision: app.store.active().assets.find(a => a.id === id)!.revision, patch: { [path]: "changed" } } });
    expect(() => write("src/a.ts")).not.toThrow();
    expect(() => write("src/nested/b.ts")).toThrow("write policy");
    expect(() => write("src/../private.env")).toThrow();
    for (const method of ["asset.fork", "asset.open", "web.build"]) expect(() => app.control.executeFor(context, { method, version: app.control.version(), params: { assetId: id, ...(method === "asset.fork" ? { name: "No copy" } : {}) } })).toThrow("whole-source");
    const commands = app.control.executeFor(context, { method: "commands.list" }).result;
    expect(commands.some((d: any) => d.method === "asset.read")).toBe(true);
    expect(commands.some((d: any) => d.method === "asset.create")).toBe(false);
    const telemetry = app.control.executeFor(context, { method: "runtime.inspect" }).result;
    expect(telemetry.lifecycle).toBeNull();
    expect(telemetry.activity.every((e: any) => e.taskId === context.taskId)).toBe(true);
    expect(taskScopeSchema.safeParse({ operations: [], fileAccess: { [id]: { read: ["../secret"], write: [] } } }).success).toBe(false);
  } finally { await app.dispose(); }
});

test("dashboard width participates in layout history and scope acquisitions remain visible after disposal", async () => {
  const app = setup();
  try {
    const before = app.store.active().dock.dashboardWidth ?? 100;
    app.control.execute({ method: "dock.apply", params: { type: "resizeDashboard", percent: 75 } });
    expect(app.store.active().dock.dashboardWidth).toBe(75);
    app.store.undoLayout(); expect(app.store.active().dock.dashboardWidth ?? 100).toBe(before);
    app.store.redoLayout(); expect(app.store.active().dock.dashboardWidth).toBe(75);
    expect(app.store.dispatchDock({ type: "resizeDashboard", percent: 101 }).ok).toBe(false);
    const scope = app.openScope(app.store.active().id, "Timeline proof");
    const handle = await scope.acquire(assetCatalog); handle.value.list(); await scope.revoke();
    const diagnostics = app.control.execute({ method: "runtime.inspect" }).result;
    expect(diagnostics.lifecycle.events.some((e: any) => e.label === "Timeline proof" && e.state === "disposed")).toBe(true);
    expect(diagnostics.lifecycle.events.some((e: any) => e.kind === "acquisition" && e.label === assetCatalog.id && e.state === "disposed")).toBe(true);
  } finally { await app.dispose(); }
});

import { test, expect } from "bun:test";
import { createComposition } from "../src/application";
import {
  parseManifest,
  type PackageInstallation,
} from "../src/core/package-assets";
import { taskScopeSchema } from "@station/protocol";
import { createAuthorizedAITools } from "../src/features/ai/application/tools";
test("SDK metadata, internal tools and direct commands share resource policy and retained-handle revocation", async () => {
  const app = createComposition({ getItem: () => null, setItem: () => {} });
  const assetId = app.store.createWebAsset(
      "Editable target",
      "<p>Private source</p>",
    ),
    otherId = app.store.active().assets[0].id;
  const context = app.control.issueTask({
    name: "Internal proof",
    source: "internal",
    workspaceId: app.store.active().id,
    scope: taskScopeSchema.parse({
      operations: [
        "state.inspect",
        "assets.list",
        "asset.metadata.read",
        "asset.metadata",
      ],
      readableAssets: [assetId],
      editableAssets: [assetId],
      capabilities: ["station:assets/metadata", "station:assets/catalog"],
    }),
  });
  const installation: PackageInstallation = {
    id: "sdk-test",
    name: "SDK test",
    packageAssetId: "test",
    revision: 0,
    enabled: true,
    assets: [],
    builds: {},
    authorizationTaskId: context.taskId,
    metadataTargets: [assetId],
    grants: {
      widget: ["station:assets/metadata", "station:assets/catalog"],
    },
    manifest: parseManifest(
      JSON.stringify({
        version: 1,
        id: "sdk-test",
        name: "SDK test",
        contributions: [
          {
            id: "widget",
            title: "Metadata",
            role: "widget",
            assetId: "source",
            capabilities: [
              "station:assets/metadata",
              "station:assets/catalog",
            ],
          },
        ],
      }),
    ),
  };
  app.store.installPackage(installation);
  const originalSnapshotId = app.store
    .active()
    .installations.find((i) => i.id === "sdk-test")!.installationId;
  app.store.installPackage(installation);
  expect(
    app.store.active().installations.find((i) => i.id === "sdk-test")!
      .installationId,
  ).not.toBe(originalSnapshotId);
  app.store.dispatchDock({
    type: "createContribution",
    definitionId: "sdk-test/widget",
    target: { surface: "dashboard", intent: "append" },
  });
  const panel = Object.values(app.store.active().dock.panels).find(
    (p) => p.definitionId === "sdk-test/widget",
  )!;
  const live = app.store
    .active()
    .installations.find((i) => i.id === "sdk-test")!;
  const connection = app.packageRuntime.contributionBindings(
    app.store.active(),
    panel,
    live,
    live.manifest.contributions[0],
  );
  try {
    const handle = await connection.bindings.acquire(
      "station:assets/metadata",
      "1.0.0",
    );
    const catalogHandle = await connection.bindings.acquire("station:assets/catalog", "1.0.0");
    expect((catalogHandle.methods.list() as {id:string}[]).map(asset=>asset.id)).toEqual([assetId]);
    await expect(connection.bindings.acquire("unit:workspace/asset-catalog", "1.0.0")).rejects.toThrow("denied");
    const read = handle.methods.get(assetId) as any;
    expect(read.name).toBe("Editable target");
    expect(JSON.stringify(read)).not.toContain("Private source");
    handle.methods.patch(assetId, { name: "SDK edited" }, read.version);
    expect(app.store.active().assets.find((a) => a.id === assetId)?.name).toBe(
      "SDK edited",
    );
    expect(() => handle.methods.get(otherId)).toThrow("outside");
    const tools = createAuthorizedAITools(app.control, context);
    const result = (await tools.station_asset_metadata_read.execute!(
      { params: { assetId }, requestId: "ai-read" },
      { toolCallId: "proof", messages: [] } as any,
    )) as any;
    expect(result.result.name).toBe("SDK edited");
    await expect(
      Promise.resolve().then(() =>
        tools.station_asset_metadata_read.execute!(
          { params: { assetId: otherId } },
          { toolCallId: "proof", messages: [] } as any,
        ),
      ),
    ).rejects.toThrow("outside");
    const request = app.control.executeFor(context, {
      method: "permissions.request",
      params: {
        reason: "Remove metadata access",
        scope: taskScopeSchema.parse({
          operations: ["state.inspect"],
          capabilities: [],
        }),
      },
    }).result;
    app.control.decideRequest(request.requestId, true);
    expect(() => handle.methods.get(assetId)).toThrow("outside");
    expect(() => catalogHandle.methods.list()).toThrow();
    app.control.revoke(context.taskId);
    expect(
      app.store.active().installations.find((i) => i.id === "sdk-test")
        ?.enabled,
    ).toBe(false);
    expect(() => handle.methods.get(assetId)).toThrow();
    const catalog = app.control.inspectAccess();
    expect(JSON.stringify(catalog.activity)).not.toContain("Private source");
  } finally {
    connection.dispose();
    await app.dispose();
  }
});

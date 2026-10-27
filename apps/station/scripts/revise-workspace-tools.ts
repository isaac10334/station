/** Exercise the author/build/install loop on an existing task-owned package.
 * Updating only the inspector must also renew unchanged sibling guest sessions.
 */
import { liveBackend } from "./control-backends";
const [credential, packageAssetId, editorAssetId] = process.argv.slice(2);
if (!credential || !packageAssetId || !editorAssetId)
  throw new Error(
    "Pass explicit credential, package asset ID and editor source asset ID",
  );
const backend = await liveBackend(credential);
const call = async (method: string, params = {}, mutation = false) =>
  backend.execute({
    method,
    params,
    ...(mutation
      ? {
          version: (await backend.execute({ method: "state.inspect" })).version,
        }
      : {}),
    requestId: crypto.randomUUID(),
  });
const source = (await call("asset.read", { assetId: editorAssetId })).result;
const code = source.files["src/main.ts"].replace(
  "Metadata inspector",
  "Revised metadata inspector",
);
await call(
  "asset.files.patch",
  {
    assetId: editorAssetId,
    expectedAssetRevision: source.revision,
    patch: { "src/main.ts": code },
  },
  true,
);
const operation = (
  await call("package.prepare", { assetId: packageAssetId }, true)
).result;
let prepared: any;
for (let i = 0; i < 300; i++) {
  const status = (
    await call("operations.inspect", { operationId: operation.operationId })
  ).result;
  if (status.status === "succeeded") {
    prepared = status.result;
    break;
  }
  if (status.status !== "running")
    throw new Error(JSON.stringify(status.error));
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (!prepared)
  throw new Error("Operation still running; inspect before retrying");
await call(
  "package.install",
  {
    preparationId: prepared.preparationId,
    grants: {
      "workspace-tools": ["station:assets/catalog"],
      "metadata-editor": ["station:assets/metadata"],
    },
  },
  true,
);
console.log(
  JSON.stringify({
    packageId: prepared.packageId,
    editorAssetId,
    editorRevision: prepared.revisions[editorAssetId],
    updatedSnapshot: true,
  }),
);

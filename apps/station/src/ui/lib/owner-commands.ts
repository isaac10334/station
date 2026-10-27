/** Trusted UI adapters. User actions share the registry; transient editor state stays local. */
import { deps } from "../../composition";
export function patchOwnerFiles(
  assetId: string,
  patch: Record<string, string | null>,
) {
  const asset = deps.store.active().assets.find((a) => a.id === assetId);
  if (!asset) throw new Error("Asset unavailable");
  return deps.control.execute({
    method: "asset.files.patch",
    params: { assetId, expectedAssetRevision: asset.revision, patch },
    version: deps.control.version(),
  });
}
export function patchOwnerMetadata(
  assetId: string,
  patch: { name?: string; description?: string },
) {
  deps.control.execute({
    method: "asset.metadata",
    params: { assetId, patch },
    version: deps.control.version(),
  });
}
export const awaitOwnerOperation = <T = any>(operationId: string, signal?: AbortSignal) => deps.commands.wait<T>(operationId, signal);

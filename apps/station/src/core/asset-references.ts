import { z } from "zod";
import type { Asset } from "./asset-state";
/** Identity references remain valid through renaming and visual regrouping. A
 * legacy path selects a subresource inside the referenced asset, never its identity.
 */
export const assetReferenceSchema = z.object({ assetId: z.string().min(1).max(160), path: z.string().max(240).optional() }).strict();
export type AssetReference = z.infer<typeof assetReferenceSchema>;
export function resolveAssetReference(assets: readonly Asset[], reference: AssetReference, accepts: (asset: Asset) => boolean) {
  const asset = assets.find(a => a.id === reference.assetId);
  if (!asset) return { ok: false as const, reason: "Referenced asset is missing" };
  if (!accepts(asset)) return { ok: false as const, reason: "Referenced asset is incompatible" };
  return { ok: true as const, asset };
}

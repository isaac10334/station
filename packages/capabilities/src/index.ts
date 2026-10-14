/** Station capability identities and contracts. No React, storage, runtime provider, or application singleton.
 * @example
 * import { workspaceClock } from "@station/capabilities";
 * const handle = await scope.acquire(workspaceClock);
 * console.log(handle.value.now());
 */
import { defineCapability } from "@loop-kit/capabilities";
export type AssetKind = "component" | "web-content" | "theme" | "package";
export * from "./guest.js";
/** A clock subscription is owned by its acquisition and stops immediately on abort. */
export interface WorkspaceClock {
  /** Unix wall time in milliseconds. Throws after cancellation. */
  now(): number;
  /** Subscribe every 250–60,000 ms. Returns an idempotent unsubscribe function. */
  every(milliseconds: number, tick: (now: number) => void): () => void;
}
/** Hash at most 64 KiB of UTF-8 text. Results are discarded if the acquisition is revoked. */
export interface TextDigest {
  sha256(text: string): Promise<string>;
}
/** Source-free metadata; no mutable model references, secrets, source or grant objects. */
export type AssetSummary = Readonly<{
  id: string;
  name: string;
  kind: AssetKind;
  revision: number;
}>;
/** Read only the workspace bound to the requesting scope by Station's composition. */
export interface AssetCatalog {
  list(): readonly AssetSummary[];
}
/** Explicit source access, bounded to 64 KiB per asset. No grants or artifacts. */
export interface AssetReader {
  read(id: string): {
    id: string;
    name: string;
    kind: AssetKind;
    source: string;
  };
}
/** Saves a new web draft only; never overwrites, opens, places or executes it. */
export interface WebDraftWriter {
  create(name: string, html: string): { id: string; name: string };
}
export const assetReader = defineCapability<AssetReader>({
  id: "unit:workspace/asset-reader",
  version: "1.0.0",
});
export const webDraftWriter = defineCapability<WebDraftWriter>({
  id: "unit:workspace/web-draft-writer",
  version: "1.0.0",
});

export const workspaceClock = defineCapability<WorkspaceClock>({
  id: "unit:workspace/clock",
  version: "1.0.0",
});
export const textDigest = defineCapability<TextDigest>({
  id: "unit:workspace/text-digest",
  version: "1.0.0",
});
export const assetCatalog = defineCapability<AssetCatalog>({
  id: "unit:workspace/asset-catalog",
  version: "1.0.0",
});


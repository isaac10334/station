/** Station capability identities and contracts. No React, storage, runtime provider, or application singleton.
 * @example
 * import { loopClock } from "@station/capabilities";
 * const handle = await scope.acquire(loopClock);
 * console.log(handle.value.now());
 */
import { defineCapability } from "@loop-kit/capabilities";
export type AssetKind = "component" | "web-content" | "theme" | "package" | "widget-definition" | "desk-template" | "svg" | "decision" | "data-source" | "script" | "custom" | "markdown" | "note";
export * from "./guest.js";
export * from "./browser.js";
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
/** @deprecated Compatibility identity. New consumers use `stationAssetReader`; grants are not interchangeable. */
export const assetReader = defineCapability<AssetReader>({
  id: "unit:workspace/asset-reader",
  version: "1.0.0",
});
/** @deprecated Compatibility identity. New consumers use `stationWebDraftWriter`; grants are not interchangeable. */
export const webDraftWriter = defineCapability<WebDraftWriter>({
  id: "unit:workspace/web-draft-writer",
  version: "1.0.0",
});

/** @deprecated Compatibility identity. New consumers use `loopClock`; grants are not interchangeable. */
export const workspaceClock = defineCapability<WorkspaceClock>({
  id: "unit:workspace/clock",
  version: "1.0.0",
});
/** @deprecated Compatibility identity. New consumers use `loopTextDigest`; grants are not interchangeable. */
export const textDigest = defineCapability<TextDigest>({
  id: "unit:workspace/text-digest",
  version: "1.0.0",
});
/** @deprecated Compatibility identity. New consumers use `stationAssetCatalog`; grants are not interchangeable. */
export const assetCatalog = defineCapability<AssetCatalog>({
  id: "unit:workspace/asset-catalog",
  version: "1.0.0",
});
/** Resource-scoped metadata editing; separate from source access and legacy catalog authority. */
export const assetMetadata = defineCapability<import("./guest.js").AssetMetadata>({ id: "station:assets/metadata", version: "1.0.0" });

/** Canonical authoring identities. The five legacy Unit exports above are explicit
 * compatibility contracts; grants remain attached to the identity requested. */
export const stationAssetReader=defineCapability<AssetReader>({id:'station:assets/source-reader',version:'1.0.0'});
export const stationWebDraftWriter=defineCapability<WebDraftWriter>({id:'station:assets/web-draft-writer',version:'1.0.0'});
export const stationAssetCatalog=defineCapability<AssetCatalog>({id:'station:assets/catalog',version:'1.0.0',methods:[{name:'list',input:{type:'object',additionalProperties:false},output:{type:'array',items:{type:'object'}},effects:[{operation:'metadata.read'}]}]});
export const loopClock=defineCapability<WorkspaceClock>({id:'loop:time/clock',version:'1.0.0'});
export const loopTextDigest=defineCapability<TextDigest>({id:'loop:crypto/text-digest',version:'1.0.0'});


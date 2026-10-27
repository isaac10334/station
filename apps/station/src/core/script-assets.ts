import type { Asset } from "./asset-state";
/** Script storage identity is stable; the source manifest distinguishes programs from calculations. */
export const scriptAssetLabel = (asset: Pick<Asset, "files">) =>
  asset.files?.["program.json"] ? "TypeScript program" : "JavaScript calculation";

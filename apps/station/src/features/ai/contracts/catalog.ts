/** Public, unauthenticated metadata; presence is not eligibility or permission. */
export type CatalogModel = Readonly<{ id: string; name: string; input: number; output: number; tags: readonly string[] }>;
export type ModelCatalog = Readonly<{ models: readonly CatalogModel[]; fetchedAt: number; source: "public" | "cache" | "offline" }>;
export interface ModelCatalogPort {
  cached(): ModelCatalog;
  load(signal: AbortSignal, refresh?: boolean): Promise<ModelCatalog>;
}
/** Preserve small base prices without binary floating point display noise. */
export const formatModelPrice = (price: number) => price.toLocaleString("en-US", { maximumFractionDigits: 10 });

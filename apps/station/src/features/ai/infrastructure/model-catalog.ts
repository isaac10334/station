import { CHAT_MODELS } from "../../../core/chat-models";
import type { KeyValueStorage } from "../../../contracts/storage";

import type { CatalogModel, ModelCatalog } from "../contracts/catalog";
export type { CatalogModel, ModelCatalog } from "../contracts/catalog";
export { formatModelPrice } from "../contracts/catalog";
const CACHE_KEY = "station.model-catalog.v1";
const MAX_BYTES = 2 * 1024 * 1024;
const TTL = 24 * 60 * 60 * 1000;
const idPattern = /^[\w.-]+\/[\w./:-]+$/;

/** Public discovery only: no credentials, eligibility checks, routing or grants.
 * Prices are base USD per million tokens; tiers/caching/reasoning may differ.
 */
export function validateCatalog(value: unknown): CatalogModel[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { data?: unknown }).data)
  )
    throw new Error("Invalid model catalog");
  const data = (value as { data: unknown[] }).data;
  if (data.length > 5000) throw new Error("Catalog too large");
  const seen = new Set<string>();
  const models: CatalogModel[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, any>;
    if (
      row.type !== "language" ||
      typeof row.id !== "string" ||
      row.id.length > 200 ||
      !idPattern.test(row.id) ||
      seen.has(row.id)
    )
      continue;
    if (
      typeof row.name !== "string" ||
      !row.name.trim() ||
      row.name.length > 200
    )
      continue;
    const price = (value: unknown) =>
      typeof value === "string" && /^\d+(\.\d+)?$/.test(value)
        ? Number(value) * 1e6
        : NaN;
    const input = price(row.pricing?.input),
      output = price(row.pricing?.output);
    if (![input, output].every((n) => Number.isFinite(n) && n >= 0 && n <= 1e6))
      continue;
    const tags = Array.isArray(row.tags)
      ? row.tags
          .filter(
            (s: unknown): s is string => typeof s === "string" && s.length < 80,
          )
          .slice(0, 20)
      : [];
    seen.add(row.id);
    models.push(
      Object.freeze({
        id: row.id,
        name: row.name,
        input,
        output,
        tags: Object.freeze(tags),
      }),
    );
  }
  if (!models.length) throw new Error("No valid language models");
  return models;
}

/** Cancellable, size/deadline-bounded GET with validated, timestamped cache.
 * Failed refresh preserves cached/offline choices; selection never changes itself.
 */
export function createModelCatalog(
  storage?: KeyValueStorage,
  fetcher: typeof fetch = fetch,
) {
  const offline: ModelCatalog = {
    models: CHAT_MODELS,
    fetchedAt: Date.UTC(2026, 9, 14),
    source: "offline",
  };
  function cached(): ModelCatalog {
    try {
      const raw = storage?.getItem(CACHE_KEY);
      if (!raw || raw.length > MAX_BYTES) return offline;
      const saved = JSON.parse(raw);
      if (
        !Number.isFinite(saved.fetchedAt) ||
        saved.fetchedAt <= 0 ||
        saved.fetchedAt > Date.now()
      )
        return offline;
      return {
        models: validateCatalog(saved.catalog),
        fetchedAt: saved.fetchedAt,
        source: "cache",
      };
    } catch {
      return offline;
    }
  }
  return {
    cached,
    async load(signal: AbortSignal, refresh = false): Promise<ModelCatalog> {
      signal.throwIfAborted();
      const previous = cached();
      if (
        !refresh &&
        previous.source === "cache" &&
        Date.now() - previous.fetchedAt < TTL
      )
        return previous;
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
      try {
        const response = await fetcher(
          "https://ai-gateway.vercel.sh/v1/models",
          { signal: bounded, credentials: "omit", redirect: "error" },
        );
        if (
          !response.ok ||
          Number(response.headers.get("content-length")) > MAX_BYTES
        )
          throw new Error("Catalog unavailable");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Missing catalog");
        let text = "",
          bytes = 0;
        const decoder = new TextDecoder();
        try {
          while (true) {
            bounded.throwIfAborted();
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > MAX_BYTES) throw new Error("Catalog too large");
            text += decoder.decode(part.value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        bounded.throwIfAborted();
        const catalog: unknown = JSON.parse(text);
        const models = validateCatalog(catalog),
          fetchedAt = Date.now();
        try {
          storage?.setItem(CACHE_KEY, JSON.stringify({ fetchedAt, catalog }));
        } catch {
          /* Storage is optional. */
        }
        return { models, fetchedAt, source: "public" };
      } catch {
        signal.throwIfAborted();
        return previous;
      }
    },
  };
}

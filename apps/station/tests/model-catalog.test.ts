import { expect, test } from "bun:test";
import {
  createModelCatalog,
  validateCatalog,
} from "../src/features/ai/infrastructure/model-catalog";

const row = {
  id: "test/language",
  name: "Language",
  type: "language",
  pricing: { input: "0.000001", output: "0.000003" },
  tags: ["tool-use"],
};
test("catalog accepts only bounded language metadata and converts base prices", () => {
  const models = validateCatalog({
    data: [
      row,
      row,
      { ...row, id: "test/image", type: "image" },
      { ...row, id: "test/bad", pricing: { input: "Infinity", output: "" } },
    ],
  });
  expect(models).toHaveLength(1);
  expect(models[0]).toMatchObject({ input: 1, output: 3 });
  expect(() =>
    validateCatalog({ data: [{ ...row, name: "x".repeat(201) }] }),
  ).toThrow();
});
test("public discovery has no credentials, caches timestamps and survives offline", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  let options: RequestInit | undefined;
  const service = createModelCatalog(storage, (async (url, init) => {
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/models");
    options = init;
    return Response.json({ data: [row] });
  }) as typeof fetch);
  const result = await service.load(new AbortController().signal);
  expect(options?.credentials).toBe("omit");
  expect(options?.headers).toBeUndefined();
  expect(result.source).toBe("public");
  expect(result.fetchedAt).toBeGreaterThan(0);
  expect(createModelCatalog(storage).cached().models).toEqual(result.models);
  const offline = createModelCatalog(storage, (async () => {
    throw new Error("offline");
  }) as typeof fetch);
  expect((await offline.load(new AbortController().signal, true)).source).toBe(
    "cache",
  );
  expect(
    (
      await createModelCatalog(undefined, (async () => {
        throw new Error();
      }) as typeof fetch).load(new AbortController().signal)
    ).source,
  ).toBe("offline");
});
test("catalog rejects oversized bytes and propagates cancellation", async () => {
  const service = createModelCatalog(
    undefined,
    (async () => new Response(" ".repeat(2 * 1024 * 1024 + 1))) as typeof fetch,
  );
  expect((await service.load(new AbortController().signal)).source).toBe(
    "offline",
  );
  const controller = new AbortController();
  controller.abort();
  await expect(service.load(controller.signal)).rejects.toThrow();
  const pending = createModelCatalog(
    undefined,
    ((_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      })) as typeof fetch,
  );
  const active = new AbortController();
  const request = pending.load(active.signal);
  active.abort();
  await expect(request).rejects.toThrow();
});

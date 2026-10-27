import { expect, test } from "bun:test";
import { createComposition } from "../src/application";

test("application factory imports and operates without browser bootstrap or React", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const app = createComposition(storage, () => ({
    run: async () => {
      throw new Error("No headless runner configured");
    },
  }));
  try {
    expect(app.store.active().assets.length).toBeGreaterThan(0);
    const scope = app.openScope(
      app.store.active().id,
      "Headless command client",
    );
    await scope.revoke();
  } finally {
    await app.dispose();
  }
  expect(() => app.openScope(app.store.active().id, "After disposal")).toThrow(
    "disposed",
  );
});

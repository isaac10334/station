import { expect, test } from "bun:test";
import { createComposition } from "../src/composition";
import { assetCatalog, textDigest, workspaceClock } from "../src/workspace-capabilities";

const storage = () => ({ getItem: () => null, setItem: () => {} });

test("Station documents all built-in contracts by their existing namespace and package", async () => {
  const deps = createComposition(storage());
  const snapshot = deps.diagnostics.inspect();
  expect(snapshot.definitions).toHaveLength(7);
  for (const definition of snapshot.definitions) {
    expect(definition.namespace).toBe("unit");
    expect(definition.package).toBe("workspace");
    expect(definition.description.length).toBeGreaterThan(20);
    expect(snapshot.providers.some(provider => provider.capabilityId === definition.id && provider.version === definition.version)).toBe(true);
  }
  expect(snapshot.definitions.find(definition => definition.id === workspaceClock.id)?.description).toContain("now(): number");
  await deps.dispose();
});

test("application reflection shows all workspace ownership, renames and real acquisitions", async () => {
  const deps = createComposition(storage());
  const first = deps.store.active();
  deps.store.createWorkspace("Second workspace");
  const second = deps.store.active();
  expect(deps.diagnostics.inspect().scopes.map(scope => scope.name)).toEqual(["Station application", first.name, "Second workspace"]);
  deps.store.renameWorkspace("Renamed workspace");
  expect(deps.diagnostics.inspect().scopes[2].name).toBe("Renamed workspace");
  const scope = deps.openScope(first.id, "Consumer in first workspace");
  const catalog = await scope.acquire(assetCatalog);
  deps.store.createAsset("Only in second workspace");
  const summaries = catalog.value.list();
  expect(summaries).toHaveLength(1);
  expect(Object.isFrozen(summaries[0])).toBe(true);
  expect(Object.keys(summaries[0]).sort()).toEqual(["id", "kind", "name", "revision"]);
  const other = deps.openScope(second.id, "Consumer in second workspace");
  expect((await other.acquire(assetCatalog)).value.list()).toHaveLength(2);
  expect(deps.diagnostics.inspect().providers.find(provider => provider.capabilityId === assetCatalog.id)?.acquisitions).toHaveLength(2);
  await scope.revoke();
  expect(() => catalog.value.list()).toThrow("cancelled");
  await deps.dispose();
  expect(deps.diagnostics.inspect()).toEqual({ state: "disposed", definitions: [], scopes: [], providers: [] });
  expect(() => deps.openScope(first.id, "Late")).toThrow("disposed");
});

test("digest is a real bounded SHA-256 provider and refuses retained calls after revoke", async () => {
  const deps = createComposition(storage());
  const scope = deps.openScope(deps.store.active().id, "Hash consumer");
  const { value } = await scope.acquire(textDigest);
  expect(await value.sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  await expect(value.sha256("💛".repeat(20_000))).rejects.toThrow("64 KiB");
  await scope.revoke();
  await expect(value.sha256("abc")).rejects.toThrow("cancelled");
  await deps.dispose();
});

test("clock subscriptions stop on revocation and validate intervals", async () => {
  const deps = createComposition(storage());
  const scope = deps.openScope(deps.store.active().id, "Clock consumer");
  const { value, signal } = await scope.acquire(workspaceClock);
  expect(Math.abs(value.now() - Date.now())).toBeLessThan(100);
  expect(() => value.every(0, () => {})).toThrow("interval");
  let ticks = 0;
  let firstTick!: () => void;
  const ticked = new Promise<void>(resolve => { firstTick = resolve; });
  value.every(250, () => { ticks++; firstTick(); });
  await ticked;
  await scope.revoke();
  const count = ticks;
  await new Promise(resolve => setTimeout(resolve, 280));
  expect(ticks).toBe(count);
  expect(signal.aborted).toBe(true);
  expect(() => value.now()).toThrow("cancelled");
  await deps.dispose();
});

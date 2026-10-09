import { expect, test } from "bun:test";
import { defineCapability } from "@loop-kit/capabilities";
import { createHost } from "../src/index.ts";

interface Counter { next(): number }
const counter = defineCapability<Counter>({ id: "loop:test/counter", version: "1" });

test("definitions document contracts independently of provider lifecycle and exact-version acquisition", async () => {
  const host = createHost();
  const v2 = defineCapability<Counter>({ id: counter.id, version: "2" });
  const external = defineCapability<Counter>({ id: "other:tools/nested/counter", version: "1" });
  const clock = defineCapability<Counter>({ id: "loop:time/clock", version: "1" });
  const before = host.inspect();
  let notifications = 0;
  host.subscribe(() => { notifications++; });
  host.define(counter, { name: "Counter", description: "next(): number" });
  host.define(v2, { name: "Counter v2" });
  host.define(external);
  host.define(clock);
  await Promise.resolve();
  expect(notifications).toBe(1);
  expect(before.definitions).toEqual([]);
  expect(host.inspect().definitions).toEqual([
    { id: counter.id, version: "1", name: "Counter", description: "next(): number", namespace: "loop", package: "test" },
    { id: counter.id, version: "2", name: "Counter v2", description: "", namespace: "loop", package: "test" },
    { id: external.id, version: "1", name: "nested/counter", description: "", namespace: "other", package: "tools" },
    { id: clock.id, version: "1", name: "clock", description: "", namespace: "loop", package: "time" },
  ]);
  const documented = host.inspect();
  expect(Object.isFrozen(documented.definitions)).toBe(true);
  expect(Object.isFrozen(documented.definitions[0])).toBe(true);
  host.define(counter, { name: "Counter", description: "next(): number" });
  expect(host.inspect()).toBe(documented);
  const scope = host.scope();
  await expect(scope.acquire(counter)).rejects.toThrow("No provider");
  let creations = 0;
  const registration = host.provide(counter, { create: () => { creations++; return { next: () => 1 }; } });
  expect(creations).toBe(0);
  expect(host.inspect().definitions).toEqual(documented.definitions);
  await expect(scope.acquire(v2)).rejects.toThrow("Version mismatch");
  expect((await scope.acquire(counter)).value.next()).toBe(1);
  await registration.unregister();
  expect(host.inspect().providers).toEqual([]);
  expect(host.inspect().definitions).toEqual(documented.definitions);
  host.define(counter, { name: "Updated contract" });
  expect(host.inspect().definitions[0]?.name).toBe("Updated contract");
  expect(documented.definitions[0]?.name).toBe("Counter");
  await host.dispose();
  expect(host.inspect().definitions).toEqual([]);
  expect(() => host.define(counter)).toThrow("disposed");
});

test("providing unknown contracts records a definition without borrowing provider documentation", async () => {
  const host = createHost();
  host.provide(counter, { create: () => ({ next: () => 1 }) }, { name: "Implementation", description: "Provider details" });
  expect(host.inspect().definitions).toEqual([
    { id: counter.id, version: "1", name: "counter", description: "", namespace: "loop", package: "test" },
  ]);
  const before = host.inspect();
  expect(() => host.provide(defineCapability({ id: counter.id, version: "2" }), { create: () => ({}) })).toThrow("already provided");
  expect(host.inspect()).toBe(before);
  host.define(counter, { name: "Documented later", description: "next(): number" });
  expect(host.inspect().providers[0]?.name).toBe("Implementation");
  expect(host.inspect().definitions[0]?.name).toBe("Documented later");
  await host.dispose();
});

test("local providers, independent scopes, release and revocation", async () => {
  const host = createHost();
  let created = 0;
  let disposed = 0;
  const registration = host.provide(counter, {
    create({ signal }) {
      expect(signal.aborted).toBe(false);
      let count = 0;
      created++;
      return { next: () => ++count };
    },
    dispose() { disposed++; }
  });
  if (false) {
    // @ts-expect-error A provider must implement Counter.
    host.provide(counter, { create: () => ({ wrong: true }) });
  }
  const a = host.scope();
  const b = host.scope();
  const first = await a.acquire(counter);
  const second = await b.acquire(counter);
  expect(first.value.next()).toBe(1);
  expect(second.value.next()).toBe(1);
  if (false) {
    // @ts-expect-error Counter has no missing method
    first.value.missing();
  }
  await first.release();
  await first.release();
  expect(first.signal.aborted).toBe(true);
  expect(disposed).toBe(1);
  await a.revoke("done");
  await expect(a.acquire(counter)).rejects.toThrow("revoked");
  expect(second.signal.aborted).toBe(false);
  await registration.unregister("removed");
  expect(second.signal.aborted).toBe(true);
  expect(disposed).toBe(2);
  await expect(b.acquire(counter)).rejects.toThrow("No provider");
  await host.dispose();
  expect(created).toBe(2);
  expect(() => host.scope()).toThrow("disposed");
});

test("cooperative cancellation and cleanup on host disposal", async () => {
  const host = createHost();
  let observed = false;
  host.provide(counter, { create({ signal }) {
    signal.addEventListener("abort", () => { observed = true; }, { once: true });
    return { next: () => 1 };
  } });
  const handle = await host.scope().acquire(counter);
  await host.dispose("shutdown");
  expect(observed).toBe(true);
  expect(handle.signal.aborted).toBe(true);
});

test("creation failure and exact version matching", async () => {
  const host = createHost();
  host.provide(counter, { create() { throw new Error("create failed"); } });
  const scope = host.scope();
  await expect(scope.acquire(counter)).rejects.toThrow("create failed");
  await expect(scope.acquire(defineCapability<Counter>({ id: counter.id, version: "2" }))).rejects.toThrow("Version mismatch");
  await host.dispose();
});

test("pending creation is cleaned when its scope is revoked", async () => {
  const host = createHost();
  let finish!: (value: Counter) => void;
  let disposed = 0;
  host.provide(counter, { create() { return new Promise<Counter>(resolve => { finish = resolve; }); }, dispose() { disposed++; } });
  const scope = host.scope();
  const acquisition = scope.acquire(counter);
  const revocation = scope.revoke();
  const acquisitionError = acquisition.catch(error => error);
  finish({ next: () => 1 });
  expect((await acquisitionError).message).toContain("cancelled");
  await revocation;
  expect(disposed).toBe(1);
  await host.dispose();
});

test("removal aborts pending creation and provider cleanup errors surface", async () => {
  const host = createHost();
  let finish!: (value: Counter) => void;
  let sawAbort = false;
  const registration = host.provide(counter, {
    create({ signal }) {
      signal.addEventListener("abort", () => { sawAbort = true; }, { once: true });
      return new Promise<Counter>(resolve => { finish = resolve; });
    },
    dispose() { throw new Error("dispose failed"); }
  });
  const scope = host.scope();
  const acquisitionError = scope.acquire(counter).catch(error => error);
  const removalError = registration.unregister().catch(error => error);
  expect(sawAbort).toBe(true);
  finish({ next: () => 1 });
  expect((await acquisitionError).message).toContain("dispose failed");
  expect((await removalError).message).toContain("Provider removal failed");
  await expect(scope.acquire(counter)).rejects.toThrow("No provider");
  await host.dispose();
});

test("duplicate registration and disposed host are rejected", async () => {
  const host = createHost();
  host.provide(counter, { create: () => ({ next: () => 1 }) });
  expect(() => host.provide(counter, { create: () => ({ next: () => 2 }) })).toThrow("already provided");
  await host.dispose();
  expect(() => host.provide(counter, { create: () => ({ next: () => 3 }) })).toThrow("disposed");
});

test("revocation waits for a release already in progress", async () => {
  const host = createHost();
  let finish!: () => void;
  host.provide(counter, {
    create: () => ({ next: () => 1 }),
    dispose: () => new Promise<void>(resolve => { finish = resolve; })
  });
  const scope = host.scope();
  const handle = await scope.acquire(counter);
  const release = handle.release();
  let finished = false;
  const revocation = scope.revoke().then(() => { finished = true; });
  await Promise.resolve();
  expect(finished).toBe(false);
  finish();
  await Promise.all([release, revocation]);
  expect(finished).toBe(true);
  await host.dispose();
});

test("reflection is cached, immutable, source-free and tracks pending through cleanup", async () => {
  const host = createHost();
  let finishCreation!: (value: Counter) => void;
  let finishCleanup!: () => void;
  host.provide(counter, {
    create: () => new Promise<Counter>(resolve => { finishCreation = resolve; }),
    dispose: () => new Promise<void>(resolve => { finishCleanup = resolve; }),
  }, { name: "Counter provider", description: "Test implementation" });
  const scope = host.scope({ name: "Named consumer" });
  const before = host.inspect();
  expect(host.inspect()).toBe(before);
  const pending = scope.acquire(counter);
  expect(host.inspect().scopes[0].acquisitions[0].state).toBe("pending");
  finishCreation({ next: () => 42 });
  const handle = await pending;
  const active = host.inspect();
  expect(active.scopes[0].acquisitions[0].state).toBe("active");
  expect(active.providers[0].acquisitions[0].scopeId).toBe(scope.id);
  expect(Object.isFrozen(active.scopes[0].acquisitions[0])).toBe(true);
  expect(Object.isFrozen(active.providers[0].acquisitions)).toBe(true);
  expect(JSON.stringify(active)).not.toContain("value");
  expect(before.scopes[0].acquisitions).toHaveLength(0);
  const release = handle.release();
  expect(host.inspect().scopes[0].acquisitions[0].state).toBe("releasing");
  await Promise.resolve();
  finishCleanup();
  await release;
  expect(host.inspect().providers[0].acquisitions).toHaveLength(0);
  await host.dispose();
  expect(host.inspect()).toEqual({ state: "disposed", definitions: [], scopes: [], providers: [] });
});

test("named parent ownership revokes descendants and waits for pending creation", async () => {
  const host = createHost();
  let finish!: (value: Counter) => void;
  let signal!: AbortSignal;
  let cleanups = 0;
  host.provide(counter, { create(context) { signal = context.signal; return new Promise<Counter>(resolve => { finish = resolve; }); }, dispose() { cleanups++; } });
  const parent = host.scope({ name: "Application" });
  const child = host.scope({ name: "Workspace", parent });
  const grandchild = host.scope({ name: "Run", parent: child });
  child.rename("Renamed workspace");
  expect(child.name).toBe("Renamed workspace");
  expect(host.inspect().scopes[2].parentId).toBe(child.id);
  const creation = grandchild.acquire(counter).catch(error => error);
  const revocation = parent.revoke();
  expect(signal.aborted).toBe(true);
  expect(host.inspect().scopes.map(scope => scope.state)).toEqual(["revoking", "revoking", "revoking"]);
  expect(() => host.scope({ parent: child })).toThrow("active");
  expect(() => child.rename("Late")).toThrow("revoked");
  finish({ next: () => 1 });
  expect((await creation).message).toContain("cancelled");
  await revocation;
  expect(cleanups).toBe(1);
  expect(host.inspect().scopes).toHaveLength(0);
  await host.dispose();
});

test("diagnostic observers are coalesced, removable and isolated from lifecycle", async () => {
  const host = createHost();
  let calls = 0;
  host.subscribe(() => { throw new Error("observer failure"); });
  const unsubscribe = host.subscribe(() => { calls++; });
  host.provide(counter, { create: () => ({ next: () => 1 }) });
  const scope = host.scope();
  scope.rename("Consumer");
  expect(calls).toBe(0);
  await Promise.resolve();
  expect(calls).toBe(1);
  unsubscribe();
  await scope.acquire(counter);
  await host.dispose();
  expect(calls).toBe(1);
});

test("foreign parents and failed creation leave no acquisitions", async () => {
  const host = createHost();
  const other = createHost();
  expect(() => host.scope({ parent: other.scope() })).toThrow("belong");
  host.provide(counter, { create() { throw new Error("failed"); } });
  await expect(host.scope().acquire(counter)).rejects.toThrow("failed");
  expect(host.inspect().providers[0].acquisitions).toHaveLength(0);
  expect(host.inspect().scopes[0].acquisitions).toHaveLength(0);
  await Promise.all([host.dispose(), other.dispose()]);
});

test("replacement registrations reflect only their own acquisitions during removal", async () => {
  const host = createHost();
  let finish!: () => void;
  let started!: () => void;
  const cleanupStarted = new Promise<void>(resolve => { started = resolve; });
  const old = host.provide(counter, { create: () => ({ next: () => 1 }), dispose: () => new Promise<void>(resolve => { finish = resolve; started(); }) });
  await host.scope().acquire(counter);
  const removal = old.unregister();
  host.provide(counter, { create: () => ({ next: () => 2 }) });
  await host.scope().acquire(counter);
  expect(host.inspect().providers.map(provider => provider.acquisitions.length)).toEqual([1, 1]);
  expect(host.inspect().providers[0].state).toBe("unregistering");
  await cleanupStarted;
  finish();
  await removal;
  expect(host.inspect().providers).toHaveLength(1);
  await host.dispose();
});

test("failed cleanup is reported and completed scope metadata is removed", async () => {
  const host = createHost();
  host.provide(counter, { create: () => ({ next: () => 1 }), dispose() { throw new Error("cleanup failed"); } });
  await host.scope().acquire(counter);
  await expect(host.dispose()).rejects.toThrow("Host disposal failed");
  expect(host.inspect()).toEqual({ state: "disposed", definitions: [], scopes: [], providers: [] });
});

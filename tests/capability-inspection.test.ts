import { expect, test } from "bun:test";
import { defineCapability } from "@loop-kit/capabilities";
import { createHost } from "@loop-kit/host";
import { acquisitionProvider, capabilityProviders, scopeUseCount } from "../src/capability-inspection";

const contract = defineCapability<{ name: string }>({ id: "test:inspection/service", version: "1" });

test("inspection attributes retiring instances to their actual provider during replacement", async () => {
  const host = createHost();
  let finishCleanup!: () => void;
  const cleanup = new Promise<void>(resolve => { finishCleanup = resolve; });
  const old = host.provide(contract, { create: () => ({ name: "old" }), dispose: () => cleanup }, { name: "Old provider" });
  const scope = host.scope();
  await scope.acquire(contract);
  const oldUse = host.inspect().scopes[0]!.acquisitions[0]!;
  const removing = old.unregister();
  host.provide(contract, { create: () => ({ name: "new" }) }, { name: "New provider" });
  await scope.acquire(contract);
  const snapshot = host.inspect();
  expect(capabilityProviders(snapshot, contract.id, "1").map(provider => provider.name)).toEqual(["Old provider", "New provider"]);
  expect(capabilityProviders(snapshot, contract.id, "2")).toEqual([]);
  expect(acquisitionProvider(snapshot, oldUse)?.name).toBe("Old provider");
  const newUse = snapshot.scopes[0]!.acquisitions.find(use => use.id !== oldUse.id)!;
  expect(acquisitionProvider(snapshot, newUse)?.name).toBe("New provider");
  expect(acquisitionProvider(snapshot, { ...oldUse, id: "unknown" })).toBeUndefined();
  finishCleanup();
  await removing;
  expect(capabilityProviders(host.inspect(), contract.id, "1").map(provider => provider.name)).toEqual(["New provider"]);
  await host.dispose();
});

test("scope counts include owned descendants and pending work, excluding other workspaces", async () => {
  const host = createHost();
  let create!: (value: { name: string }) => void;
  host.provide(contract, { create: () => new Promise(resolve => { create = resolve; }) });
  const app = host.scope();
  const workspace = host.scope({ parent: app });
  const idle = host.scope({ parent: app });
  const widget = host.scope({ parent: workspace });
  const pending = widget.acquire(contract);
  expect(scopeUseCount(host.inspect(), app.id)).toBe(1);
  expect(scopeUseCount(host.inspect(), workspace.id)).toBe(1);
  expect(scopeUseCount(host.inspect(), widget.id)).toBe(1);
  expect(scopeUseCount(host.inspect(), idle.id)).toBe(0);
  create({ name: "instance" });
  await pending;
  await workspace.revoke();
  expect(scopeUseCount(host.inspect(), app.id)).toBe(0);
  expect(host.inspect().providers).toHaveLength(1);
  await host.dispose();
});

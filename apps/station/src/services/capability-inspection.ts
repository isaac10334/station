import type { AcquisitionSnapshot, HostSnapshot, ProviderSnapshot } from "@loop-kit/host";

/** Exact-version implementations, including registrations still finishing cleanup. */
export function capabilityProviders(snapshot: HostSnapshot, id: string, version: string): readonly ProviderSnapshot[] {
  return snapshot.providers.filter(provider => provider.capabilityId === id && provider.version === version);
}

/**
 * Join by acquisition identity: a retiring provider and its replacement can share
 * an ID/version. Looking up only that contract would attribute old work to the new provider.
 */
export function acquisitionProvider(snapshot: HostSnapshot, acquisition: AcquisitionSnapshot): ProviderSnapshot | undefined {
  return snapshot.providers.find(provider => provider.acquisitions.some(item => item.id === acquisition.id));
}

/** Count owned work throughout a scope's subtree, including creation and cleanup. */
export function scopeUseCount(snapshot: HostSnapshot, scopeId: string): number {
  const owned = new Set([scopeId]);
  // The host guarantees a tree. The visited set also prevents malformed diagnostic data looping.
  for (const id of owned) for (const scope of snapshot.scopes) if (scope.parentId === id) owned.add(scope.id);
  return snapshot.scopes.reduce((total, scope) => total + (owned.has(scope.id) ? scope.acquisitions.length : 0), 0);
}

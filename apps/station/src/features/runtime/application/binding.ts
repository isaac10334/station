import type { Capability } from "@loop-kit/capabilities";
import type { Scope } from "@loop-kit/host";
import type { ProviderPreference, ProviderCatalogPort, BindingDiagnostic } from "../contracts/binding";
/** Exact resolution through Loop Kit's public scope APIs. A named preference
 * never falls back to the default. The caller owns the scope and acquired lease.
 * Catalog metadata diagnoses availability; only acquire conveys a checked value.
 * @example
 * const binding = createScopedBinding(scope, clock, {kind: "named", serviceId: "clock:desk"}, catalog);
 * const lease = await binding.acquire(); // release lease or revoke its owner
 */
export function createScopedBinding<T>(scope: Scope, capability: Capability<T>, preference: ProviderPreference, catalog: ProviderCatalogPort) {
  const configured: ProviderPreference = Object.freeze({ ...preference });
  const named = configured.kind === "named" ? scope.bind(capability, configured.serviceId) : undefined;
  const acquisitions = new Set<AbortSignal>();
  let failed = false;
  function inspect(): BindingDiagnostic {
    const provider = catalog.inspect().providers.find(p => p.capabilityId === capability.id && p.serviceId === (configured.kind === "named" ? configured.serviceId : undefined));
    return { capabilityId: capability.id, version: capability.version, preference: configured,
      state: !provider || scope.signal.aborted ? "unavailable" : provider.version !== capability.version ? "incompatible" : failed || provider.activation === "failed" ? "failed" : acquisitions.size ? "acquired" : "ready" };
  }
  return {
    inspect,
    async acquire() {
      try {
        const handle = await (named ? named.acquire() : scope.acquire(capability));
        failed = false;
        if (!handle.signal.aborted) {
          acquisitions.add(handle.signal);
          handle.signal.addEventListener("abort", () => acquisitions.delete(handle.signal), { once: true });
        }
        return handle;
      }
      catch (error) { failed = true; throw error; }
    },
  };
}

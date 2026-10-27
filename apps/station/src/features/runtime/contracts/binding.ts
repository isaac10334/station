import type { ProviderSnapshot } from "@loop-kit/host";
/** Configuration describes a requested dependency, never an acquired handle or grant. */
export type ProviderPreference = { kind: "default" } | { kind: "named"; serviceId: string };
export type BindingDiagnostic = Readonly<{
  capabilityId: string; version: string; preference: ProviderPreference;
  state: "unavailable" | "incompatible" | "ready" | "acquired" | "failed";
}>;
/** A metadata-only view cannot resolve or invoke a service. */
export interface ProviderCatalogPort { inspect(): { providers: readonly ProviderSnapshot[] } }

/** Narrow built-in runtime ports. A scope is acquired authority; diagnostics never grant it. */
import type { Capability } from "@loop-kit/capabilities";
import type { Host, Scope } from "@loop-kit/host";

export type AISettings = Readonly<{ apiKey: string; model: string; rememberKey: boolean }>;
export interface AISettingsStore {
  get(): AISettings;
  subscribe(listener: () => void): () => void;
  save(value: AISettings): void;
}
/** An instance owns this grant-intersected acquisition until revoke. No raw host access. */
export interface GrantedWidgetScope {
  readonly signal: AbortSignal;
  acquire<T extends object>(capability: Capability<T>): Promise<T>;
  revoke(): Promise<void>;
}
export interface WorkspaceCapabilityRuntime {
  diagnostics: Pick<Host, "inspect" | "subscribe">;
  openScope(workspaceId: string, name: string): Scope;
  openWidgetScope(workspaceId: string, instanceId: string, grants: Iterable<string>): GrantedWidgetScope;
  aiSettings: AISettingsStore;
}

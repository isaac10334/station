/** Serializable guest contracts. Types describe values; hosts still validate authority and payloads. */
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Theme {
  mode: "dark" | "light";
  variables: Record<string, string>;
  /** Validated static SVG image URLs keyed by the semantic icon catalog. */
  icons?: Record<string, string>;
}
export interface EditorSession {
  files(): Promise<Record<string, string>>;
  /** Atomically read the opened asset's current source revision and files. */
  snapshot(): Promise<{ revision: number; files: Record<string, string> }>;
  /** Commit only against the read revision. Stale or revoked writes reject;
   * authority remains bound to this session's opened asset. */
  editIfCurrent(path: string, source: string, expectedRevision: number): Promise<{ revision: number }>;
  edit(path: string, source: string): Promise<void>;
  select(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  diagnostics(): Promise<Json[]>;
}
/** Metadata-only contract. The host binds permitted asset IDs and checks revision
 * preconditions on every write; acquiring a handle does not authorize arbitrary IDs.
 */
export interface AssetMetadata {
  get(assetId: string): Promise<{ id: string; name: string; description: string; kind: string; revision: number; version: { epoch: string; revision: number } }>;
  version(): Promise<{ epoch: string; revision: number }>;
  patch(assetId: string, patch: { name?: string; description?: string }, version: { epoch: string; revision: number }): Promise<void>;
}
export interface CapabilityHandle<T> {
  value: T;
  subscribe(listener: (value: Json) => void): Promise<() => void>;
  release(): Promise<void>;
}
export interface Station {
  acquire<T extends object>(capability: {
    id: string;
    version: string;
  }): Promise<CapabilityHandle<T>>;
  theme: { subscribe(listener: (theme: Theme) => void): () => void };
  state(key: string): {
    get(): Promise<Json>;
    set(value: Json): Promise<void>;
    subscribe(listener: (value: Json) => void): () => void;
  };
  slots: {
    open(slot: string, definition: string): Promise<string>;
    close(instance: string): Promise<void>;
  };
  disconnect(): void;
}

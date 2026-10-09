/** Trusted built-in JS contracts. These do not add imports or grants to a Component. */
import { defineCapability } from "@loop-kit/capabilities";
import type { Host, Scope } from "@loop-kit/host";
import type { createStore, Asset } from "./model";
import { sha256 } from "./build-contract";
import type { GrantedWidgetScope } from "./widget-grants";
import type { AISettingsStore } from "./ai-settings";

/** A clock subscription is owned by its acquisition and stops immediately on abort. */
export interface WorkspaceClock {
  /** Unix wall time in milliseconds. Throws after cancellation. */
  now(): number;
  /** Subscribe every 250–60,000 ms. Returns an idempotent unsubscribe function. */
  every(milliseconds: number, tick: (now: number) => void): () => void;
}
/** Hash at most 64 KiB of UTF-8 text. Results are discarded if the acquisition is revoked. */
export interface TextDigest { sha256(text: string): Promise<string> }
/** Source-free metadata; no mutable model references, secrets, source or grant objects. */
export type AssetSummary = Readonly<{ id: string; name: string; kind: Asset["kind"]; revision: number }>;
/** Read only the workspace bound to the requesting scope by Station's composition. */
export interface AssetCatalog { list(): readonly AssetSummary[] }
/** Explicit source access, bounded to 64 KiB per asset. No grants or artifacts. */
export interface AssetReader { read(id: string): { id: string; name: string; kind: Asset["kind"]; source: string } }
/** Saves a new web draft only; never overwrites, opens, places or executes it. */
export interface WebDraftWriter { create(name: string, html: string): { id: string; name: string } }
export const assetReader = defineCapability<AssetReader>({ id: "unit:workspace/asset-reader", version: "1.0.0" });
export const webDraftWriter = defineCapability<WebDraftWriter>({ id: "unit:workspace/web-draft-writer", version: "1.0.0" });

/** Diagnostic data plus owned acquisition access for trusted built-in consumers. */
export interface WorkspaceCapabilityRuntime {
  diagnostics: Pick<Host, "inspect" | "subscribe">;
  openScope(workspaceId: string, name: string): Scope;
  openWidgetScope(workspaceId: string, instanceId: string, grants: Iterable<string>): GrantedWidgetScope;
  aiSettings: AISettingsStore;
}

export const workspaceClock = defineCapability<WorkspaceClock>({ id: "unit:workspace/clock", version: "1.0.0" });
export const textDigest = defineCapability<TextDigest>({ id: "unit:workspace/text-digest", version: "1.0.0" });
export const assetCatalog = defineCapability<AssetCatalog>({ id: "unit:workspace/asset-catalog", version: "1.0.0" });

/** Register local implementations. The private scope binding, never inspector metadata, selects a workspace. */
export function provideWorkspaceCapabilities(host: Host, store: ReturnType<typeof createStore>, workspaceForScope: (scope: Scope) => string | undefined) {
  host.define(workspaceClock, { name: "Clock", description: "now(): number — Unix wall time in milliseconds. every(milliseconds, tick): unsubscribe — cancellable subscriptions at intervals of 250–60,000 ms." });
  host.define(textDigest, { name: "Text digest", description: "sha256(text): Promise<string> — SHA-256 of at most 64 KiB of UTF-8 text. Rejects if the acquisition is cancelled." });
  host.define(assetCatalog, { name: "Asset catalog", description: "list(): readonly AssetSummary[] — source-free asset IDs, names, kinds and revisions in the requesting workspace. Requires a workspace-bound scope." });
  host.define(assetReader, { name: "Read asset source", description: "read(id): { id, name, kind, source } — read source from the bound workspace, up to 64 KiB. Source may be sent to the selected AI model when granted." });
  host.define(webDraftWriter, { name: "Create web drafts", description: "create(name, html): { id, name } — save a new web asset in the bound active workspace. Never edits existing assets or executes content." });
  const check = (signal: AbortSignal) => { if (signal.aborted) throw new Error("Capability acquisition cancelled."); };
  host.provide(assetReader, { create: ({ scope, signal }) => ({ read(id) {
    check(signal);
    const workspaceId = workspaceForScope(scope);
    if (!workspaceId) throw new Error("Asset reader requires a workspace scope.");
    const asset = store.get().workspaces.find(item => item.id === workspaceId)?.assets.find(item => item.id === id);
    if (!asset) throw new Error("Asset not found in this workspace.");
    const source = asset.kind === "web-content" ? asset.html : JSON.stringify(asset.files);
    if (new TextEncoder().encode(source).byteLength > 64 * 1024) throw new Error("Asset source exceeds 64 KiB.");
    return { id: asset.id, name: asset.name, kind: asset.kind, source };
  } }) }, { name: "Workspace source reader", description: "Explicit source access without grants, artifact metadata or user settings." });
  host.provide(webDraftWriter, { create: ({ scope, signal }) => ({ create(name, html) {
    check(signal);
    if (store.active().id !== workspaceForScope(scope)) throw new Error("Draft workspace is no longer active.");
    if (!name.trim() || name.length > 120 || new TextEncoder().encode(html).byteLength > 64 * 1024) throw new Error("Draft requires a name up to 120 characters and HTML up to 64 KiB.");
    const id = store.createWebAsset(name.trim(), html);
    return { id, name: name.trim() };
  } }) }, { name: "Web draft writer", description: "Creates a fresh saved web draft. The AI tool adapter requires review before each write." });
  host.provide(workspaceClock, {
    create({ signal }) {
      const timers = new Set<ReturnType<typeof setInterval>>();
      signal.addEventListener("abort", () => { for (const timer of timers) clearInterval(timer); timers.clear(); }, { once: true });
      return {
        now() { check(signal); return Date.now(); },
        every(milliseconds, tick) {
          check(signal);
          if (!Number.isFinite(milliseconds) || milliseconds < 250 || milliseconds > 60_000) throw new RangeError("Clock interval must be 250–60,000 ms.");
          const timer = setInterval(() => { if (!signal.aborted) tick(Date.now()); }, milliseconds);
          timers.add(timer);
          return () => { clearInterval(timer); timers.delete(timer); };
        },
      };
    },
  }, { name: "Local clock", description: "Wall time and cancellable subscriptions. Used by the Local time widget; timers stop on release." });
  host.provide(textDigest, {
    create: ({ signal }) => ({ async sha256(text) {
      check(signal);
      const bytes = new TextEncoder().encode(text);
      if (bytes.byteLength > 64 * 1024) throw new RangeError("Text exceeds the 64 KiB digest limit.");
      const digest = await sha256(bytes);
      check(signal);
      return digest;
    } }),
  }, { name: "Text digest", description: "Local SHA-256 of up to 64 KiB of UTF-8 text. Sends no data over the network." });
  host.provide(assetCatalog, {
    create({ scope, signal }) {
      const workspaceId = workspaceForScope(scope);
      if (!workspaceId) throw new Error("Asset catalog requires a workspace scope.");
      return { list() {
        check(signal);
        const workspace = store.get().workspaces.find(item => item.id === workspaceId);
        if (!workspace) throw new Error("Workspace no longer exists.");
        return Object.freeze(workspace.assets.map(({ id, name, kind, revision }) => Object.freeze({ id, name, kind, revision })));
      } };
    },
  }, { name: "Workspace asset catalog", description: "Read-only asset names, kinds and revisions in the requesting workspace. Excludes source, grants and app settings." });
}

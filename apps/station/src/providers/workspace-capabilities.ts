/** Trusted built-in JS contracts. These do not add imports or grants to a Component. */
import { assetFiles } from "../core/source-project";
import { assetCatalog, assetReader, webDraftWriter, workspaceClock, textDigest } from "@station/capabilities";
export { assetCatalog, assetReader, webDraftWriter, workspaceClock, textDigest } from "@station/capabilities";
export type { WorkspaceClock, TextDigest, AssetSummary, AssetCatalog, AssetReader, WebDraftWriter } from "@station/capabilities";
import type { Host, Scope } from "@loop-kit/host";
import type { createStore, Asset } from "../core/model";
import { sha256 } from "../core/build-contract";
import type { GrantedWidgetScope } from "../services/widget-grants";
import type { AISettingsStore } from "../services/ai-settings";

/** Diagnostic data plus owned acquisition access for trusted built-in consumers. */
export interface WorkspaceCapabilityRuntime {
  diagnostics: Pick<Host, "inspect" | "subscribe">;
  openScope(workspaceId: string, name: string): Scope;
  openWidgetScope(
    workspaceId: string,
    instanceId: string,
    grants: Iterable<string>,
  ): GrantedWidgetScope;
  aiSettings: AISettingsStore;
}

/** Register local implementations. The private scope binding, never inspector metadata, selects a workspace. */
export function provideWorkspaceCapabilities(
  host: Host,
  store: ReturnType<typeof createStore>,
  workspaceForScope: (scope: Scope) => string | undefined,
) {
  host.define(workspaceClock, {
    name: "Clock",
    description:
      "now(): number — Unix wall time in milliseconds. every(milliseconds, tick): unsubscribe — cancellable subscriptions at intervals of 250–60,000 ms.",
  });
  host.define(textDigest, {
    name: "Text digest",
    description:
      "sha256(text): Promise<string> — SHA-256 of at most 64 KiB of UTF-8 text. Rejects if the acquisition is cancelled.",
  });
  host.define(assetCatalog, {
    name: "Asset catalog",
    description:
      "list(): readonly AssetSummary[] — source-free asset IDs, names, kinds and revisions in the requesting workspace. Requires a workspace-bound scope.",
  });
  host.define(assetReader, {
    name: "Read asset source",
    description:
      "read(id): { id, name, kind, source } — read source from the bound workspace, up to 64 KiB. Source may be sent to the selected AI model when granted.",
  });
  host.define(webDraftWriter, {
    name: "Create web drafts",
    description:
      "create(name, html): { id, name } — save a new web asset in the bound active workspace. Never edits existing assets or executes content.",
  });
  const check = (signal: AbortSignal) => {
    if (signal.aborted) throw new Error("Capability acquisition cancelled.");
  };
  host.provide(
    assetReader,
    {
      create: ({ scope, signal }) => ({
        read(id) {
          check(signal);
          const workspaceId = workspaceForScope(scope);
          if (!workspaceId)
            throw new Error("Asset reader requires a workspace scope.");
          const asset = store
            .get()
            .workspaces.find((item) => item.id === workspaceId)
            ?.assets.find((item) => item.id === id);
          if (!asset) throw new Error("Asset not found in this workspace.");
          const files = assetFiles(asset);
          const source =
            asset.kind === "web-content" &&
            Object.keys(files).length === 1 &&
            files["index.html"] !== undefined
              ? files["index.html"]
              : JSON.stringify(files);
          if (new TextEncoder().encode(source).byteLength > 64 * 1024)
            throw new Error("Asset source exceeds 64 KiB.");
          return { id: asset.id, name: asset.name, kind: asset.kind, source };
        },
      }),
    },
    {
      name: "Workspace source reader",
      description:
        "Explicit source access without grants, artifact metadata or user settings.",
    },
  );
  host.provide(
    webDraftWriter,
    {
      create: ({ scope, signal }) => ({
        create(name, html) {
          check(signal);
          if (store.active().id !== workspaceForScope(scope))
            throw new Error("Draft workspace is no longer active.");
          if (
            !name.trim() ||
            name.length > 120 ||
            new TextEncoder().encode(html).byteLength > 64 * 1024
          )
            throw new Error(
              "Draft requires a name up to 120 characters and HTML up to 64 KiB.",
            );
          const id = store.createWebAsset(name.trim(), html);
          return { id, name: name.trim() };
        },
      }),
    },
    {
      name: "Web draft writer",
      description:
        "Creates a fresh saved web draft. The AI tool adapter requires review before each write.",
    },
  );
  host.provide(
    workspaceClock,
    {
      create({ signal }) {
        const timers = new Set<ReturnType<typeof setInterval>>();
        signal.addEventListener(
          "abort",
          () => {
            for (const timer of timers) clearInterval(timer);
            timers.clear();
          },
          { once: true },
        );
        return {
          now() {
            check(signal);
            return Date.now();
          },
          every(milliseconds, tick) {
            check(signal);
            if (
              !Number.isFinite(milliseconds) ||
              milliseconds < 250 ||
              milliseconds > 60_000
            )
              throw new RangeError("Clock interval must be 250–60,000 ms.");
            const timer = setInterval(() => {
              if (!signal.aborted) tick(Date.now());
            }, milliseconds);
            timers.add(timer);
            return () => {
              clearInterval(timer);
              timers.delete(timer);
            };
          },
        };
      },
    },
    {
      name: "Local clock",
      description:
        "Wall time and cancellable subscriptions. Used by the Local time widget; timers stop on release.",
    },
  );
  host.provide(
    textDigest,
    {
      create: ({ signal }) => ({
        async sha256(text) {
          check(signal);
          const bytes = new TextEncoder().encode(text);
          if (bytes.byteLength > 64 * 1024)
            throw new RangeError("Text exceeds the 64 KiB digest limit.");
          const digest = await sha256(bytes);
          check(signal);
          return digest;
        },
      }),
    },
    {
      name: "Text digest",
      description:
        "Local SHA-256 of up to 64 KiB of UTF-8 text. Sends no data over the network.",
    },
  );
  host.provide(
    assetCatalog,
    {
      create({ scope, signal }) {
        const workspaceId = workspaceForScope(scope);
        if (!workspaceId)
          throw new Error("Asset catalog requires a workspace scope.");
        return {
          list() {
            check(signal);
            const workspace = store
              .get()
              .workspaces.find((item) => item.id === workspaceId);
            if (!workspace) throw new Error("Workspace no longer exists.");
            return Object.freeze(
              workspace.assets.map(({ id, name, kind, revision }) =>
                Object.freeze({ id, name, kind, revision }),
              ),
            );
          },
        };
      },
    },
    {
      name: "Workspace asset catalog",
      description:
        "Read-only asset names, kinds and revisions in the requesting workspace. Excludes source, grants and app settings.",
    },
  );
}

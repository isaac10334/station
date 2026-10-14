import {createWorkspaceSharing} from "./services/workspace-sharing";
import { createPackageRuntime } from "./services/package-runtime";
import { createHost, type Scope } from "@loop-kit/host";
import { provideWorkspaceCapabilities } from "./providers/workspace-capabilities";

import { grantedWidgetScope } from "./services/widget-grants";
import { createAISettings } from "./services/ai-settings";
import { provideAIConversation } from "./providers/ai-capabilities";
import {
  createStore,
  hasCurrentArtifact,
  type ComponentAsset,
  type KeyValueStorage,
} from "./core/model";
import {
  createPolyengineRunner,
  selectComponentRuntime,
  type ComponentRunner,
} from "./providers/component-runtime";
import { REQUIRED_GRANTS } from "./core/component-contract";
import {
  sha256,
  sourceSha256,
  witSha256,
  type BuiltArtifact,
} from "./core/build-contract";

import { componentRunner } from "./contracts/component-runtime";

export function createComposition(
  storage: KeyValueStorage,
  createRunner: () => ComponentRunner = createPolyengineRunner,
) {
  const store = createStore(storage);
  const host = createHost();
  const aiSettings = createAISettings(storage);
  provideAIConversation(host, aiSettings);
  const applicationScope = host.scope({ name: "Station application" });
  const workspaceScopes = new Map<string, Scope>();
  const deskScopes = new Map<string, { id: string; scope: Scope }>();
  const workspaceBindings = new WeakMap<Scope, string>();
  let disposed = false;
  function syncWorkspaceScopes() {
    if (disposed) return;
    for (const workspace of store.get().workspaces) {
      const existing = workspaceScopes.get(workspace.id);
      if (existing) existing.rename(workspace.name);
      else {
        const scope = host.scope({
          name: workspace.name,
          parent: applicationScope,
        });
        workspaceScopes.set(workspace.id, scope);
        workspaceBindings.set(scope, workspace.id);
      }
      const desk = workspace.desks.find(
        (desk) => desk.id === workspace.activeDeskId,
      )!;
      const previous = deskScopes.get(workspace.id);
      if (previous?.id !== desk.id) {
        if (previous) void previous.scope.revoke().catch(console.error);
        const scope = host.scope({
          name: desk.name,
          parent: workspaceScopes.get(workspace.id)!,
        });
        workspaceBindings.set(scope, workspace.id);
        deskScopes.set(workspace.id, { id: desk.id, scope });
      } else previous.scope.rename(desk.name);
    }
    for (const [id, scope] of workspaceScopes)
      if (!store.get().workspaces.some((item) => item.id === id)) {
        workspaceScopes.delete(id);
        deskScopes.delete(id);
        void scope.revoke().catch(console.error);
      }
  }
  syncWorkspaceScopes();
  const unsubscribeScopes = store.subscribe(syncWorkspaceScopes);
  /** Creates owned work in one workspace. Call revoke when the consumer finishes or unmounts. */
  function openScope(workspaceId: string, name: string): Scope {
    if (disposed) throw new Error("Station composition is disposed.");
    const parent = deskScopes.get(workspaceId)?.scope;
    if (!parent) throw new Error("Workspace no longer exists.");
    const scope = host.scope({ name, parent });
    workspaceBindings.set(scope, workspaceId);
    return scope;
  }
  provideWorkspaceCapabilities(host, store, (scope) =>
    workspaceBindings.get(scope),
  );
  host.define(componentRunner, {
    name: "Component runtime",
    description:
      "run(asset, input, grants, signal?) — execute a built Component with explicit import grants and cancellation; returns a promise for its run result.",
  });
  host.provide(
    componentRunner,
    { create: () => createRunner() },
    {
      name: "Polyengine Component runtime",
      description:
        "Runs verified P3 Component bytes in a fixed worker. WIT grants are checked separately; cancellation terminates the worker.",
    },
  );
  type RunApproval = {
    instanceId: string;
    grants: ReadonlySet<string>;
    controller: AbortController;
  };
  const approvals = new Set<RunApproval>();
  const approvalListeners = new Set<() => void>();
  let approvalSnapshot: readonly {
    instanceId: string;
    grants: readonly string[];
  }[] = [];
  function publishApprovals() {
    approvalSnapshot = [...approvals]
      .filter((item) => !item.controller.signal.aborted)
      .map((item) => ({
        instanceId: item.instanceId,
        grants: [...item.grants],
      }));
    approvalListeners.forEach((listener) => listener());
  }
  const unsubscribeRevocations = store.subscribeGrantRevocations(
    (instanceId, capability) => {
      for (const approval of approvals)
        if (
          approval.instanceId === instanceId &&
          approval.grants.has(capability)
        )
          approval.controller.abort();
      publishApprovals();
    },
  );
  const runner: ComponentRunner = {
    run: (asset, input, grants, signal) =>
      runComponent(asset, input, grants, signal),
  };
  /** Installed commands use an immutable source snapshot and separately reviewed WIT authority. */
  async function runPackageCommand(
    packageId: string,
    contributionId: string,
    input: string,
    requestedSignal?: AbortSignal,
  ) {
    const workspace = store.active(),
      deskId = workspace.activeDeskId;
    const installation = workspace.installations.find(
      (item) => item.id === packageId && item.enabled,
    );
    const contribution = installation?.manifest.contributions.find(
      (item) => item.id === contributionId && item.role === "command",
    );
    const asset = installation?.assets.find(
      (item) => item.id === contribution?.assetId,
    );
    if (
      !installation ||
      !contribution ||
      asset?.kind !== "component" ||
      !hasCurrentArtifact(asset)
    )
      throw new Error("Installed command unavailable");
    const grants = new Set(installation.grants[contributionId] ?? []);
    if (REQUIRED_GRANTS.some((id) => !grants.has(id)))
      throw new Error("Command import grants required");
    if (
      asset.artifact!.sourceSha256 !== (await sourceSha256(asset.files)) ||
      asset.artifact!.witSha256 !== (await witSha256(asset.files))
    )
      throw new Error("Installed source does not match its artifact");
    const valid = () =>
      store.active().id === workspace.id &&
      store.active().activeDeskId === deskId &&
      store.active().installations.includes(installation) &&
      installation.enabled &&
      !store
        .desk()
        .disabledContributions.includes(`${packageId}/${contributionId}`);
    if (!valid()) throw new Error("Command setup changed");
    const controller = new AbortController(),
      scope = openScope(workspace.id, `Command · ${contribution.title}`);
    const abort = () => controller.abort();
    const unsubscribe = store.subscribe(() => {
      if (!valid()) abort();
    });
    requestedSignal?.addEventListener("abort", abort, { once: true });
    try {
      const handle = await scope.acquire(componentRunner);
      handle.signal.addEventListener("abort", abort, { once: true });
      if (handle.signal.aborted || requestedSignal?.aborted) abort();
      if (controller.signal.aborted) throw new Error("Command cancelled");
      const result = await handle.value.run(
        asset,
        input,
        grants,
        controller.signal,
      );
      if (controller.signal.aborted || !valid())
        throw new Error("Command cancelled");
      return result;
    } finally {
      unsubscribe();
      requestedSignal?.removeEventListener("abort", abort);
      await scope.revoke();
    }
  }
  async function runComponent(
    asset: ComponentAsset,
    input: string,
    grants: ReadonlySet<string>,
    requestedSignal?: AbortSignal,
    approval?: RunApproval,
  ) {
    const workspaceId = store.active().id;
    const current = store
      .active()
      .assets.find((item) => item.instanceId === asset.instanceId);
    if (
      !current ||
      current.kind !== "component" ||
      current.revision !== asset.revision ||
      current.artifact?.sha256 !== asset.artifact?.sha256
    )
      throw new Error(
        "Source changed. Build the current revision before running.",
      );
    if (!current.artifact)
      throw new Error("Build the current P3 source before running.");
    selectComponentRuntime(current.artifact);
    if (!hasCurrentArtifact(current))
      throw new Error(
        "Source changed. Build the current revision before running.",
      );
    if (
      current.artifact?.sourceSha256 !== (await sourceSha256(current.files)) ||
      current.artifact.witSha256 !== (await witSha256(current.files))
    )
      throw new Error(
        "Source no longer matches the built artifact. Rebuild this Component.",
      );
    for (const grant of REQUIRED_GRANTS)
      if (
        !grants.has(grant) ||
        (!current.grants[grant] && !approval?.grants.has(grant))
      )
        throw new Error(`Import denied: ${grant}`);
    if (store.active().id !== workspaceId)
      throw new Error("Workspace changed before the run.");
    const checked = store
      .active()
      .assets.find((item) => item.instanceId === current.instanceId);
    if (
      !checked ||
      checked.kind !== "component" ||
      checked.revision !== current.revision ||
      checked.artifact?.sha256 !== current.artifact.sha256
    )
      throw new Error("Source changed before the run.");
    for (const grant of REQUIRED_GRANTS)
      if (!checked.grants[grant] && !approval?.grants.has(grant))
        throw new Error(`Import denied: ${grant}`);
    const scope = openScope(
      workspaceId,
      `Run · ${current.name} · revision ${current.revision}`,
    );
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    requestedSignal?.addEventListener("abort", onAbort, { once: true });
    approval?.controller.signal.addEventListener("abort", onAbort, {
      once: true,
    });
    const unsubscribe = store.subscribe(() => {
      const latest = store
        .active()
        .assets.find((item) => item.instanceId === current.instanceId);
      if (
        !latest ||
        latest.kind !== "component" ||
        latest.revision !== current.revision ||
        latest.artifact?.sha256 !== current.artifact?.sha256 ||
        store.active().id !== workspaceId ||
        REQUIRED_GRANTS.some(
          (grant) => !latest.grants[grant] && !approval?.grants.has(grant),
        )
      )
        controller.abort();
    });
    try {
      const handle = await scope.acquire(componentRunner);
      handle.signal.addEventListener("abort", onAbort, { once: true });
      if (
        handle.signal.aborted ||
        requestedSignal?.aborted ||
        approval?.controller.signal.aborted
      )
        controller.abort();
      if (controller.signal.aborted)
        throw new Error("Component run cancelled.");
      const result = await handle.value.run(
        current,
        input,
        grants,
        controller.signal,
      );
      if (controller.signal.aborted)
        throw new Error("Component run cancelled.");
      const latest = store
        .active()
        .assets.find((item) => item.instanceId === asset.instanceId);
      if (
        !latest ||
        latest.kind !== "component" ||
        !hasCurrentArtifact(latest) ||
        latest.revision !== current.revision ||
        latest.artifact?.sha256 !== current.artifact?.sha256
      )
        throw new Error(
          "Source changed during the run. Run the current revision again.",
        );
      return result;
    } finally {
      unsubscribe();
      requestedSignal?.removeEventListener("abort", onAbort);
      approval?.controller.signal.removeEventListener("abort", onAbort);
      await scope.revoke();
    }
  }
  /** Approval is bound to the displayed asset revision and bytes. One-run authority
   * lives only in this invocation and is inspectable/revocable until its finally block.
   * Existing boolean grants remain saved "always allow" decisions.
   */
  async function approveAndRun(
    asset: ComponentAsset,
    input: string,
    remember: boolean,
    signal?: AbortSignal,
  ) {
    const current = store
      .active()
      .assets.find((item) => item.instanceId === asset.instanceId);
    if (
      !current ||
      current.kind !== "component" ||
      current.revision !== asset.revision ||
      current.artifact?.sha256 !== asset.artifact?.sha256 ||
      !hasCurrentArtifact(current)
    )
      throw new Error(
        "Component changed while awaiting approval. Review the current build again.",
      );
    if (
      REQUIRED_GRANTS.some(
        (key) => Boolean(current.grants[key]) !== Boolean(asset.grants[key]),
      )
    )
      throw new Error(
        "Permissions changed while awaiting approval. Review the request again.",
      );
    if (signal?.aborted) throw new Error("Component run cancelled.");
    if (remember) {
      store.allowComponentGrants(current.id, REQUIRED_GRANTS);
      return runner.run(current, input, new Set(REQUIRED_GRANTS), signal);
    }
    const approval: RunApproval = {
      instanceId: current.instanceId,
      grants: new Set(REQUIRED_GRANTS),
      controller: new AbortController(),
    };
    approvals.add(approval);
    publishApprovals();
    try {
      return await runComponent(
        current,
        input,
        approval.grants,
        signal,
        approval,
      );
    } finally {
      approvals.delete(approval);
      publishApprovals();
    }
  }
  async function buildAsset(
    workspaceId: string,
    assetId: string,
  ): Promise<BuiltArtifact> {
    const asset = store
      .get()
      .workspaces.find((item) => item.id === workspaceId)
      ?.assets.find((item) => item.id === assetId);
    if (!asset || asset.kind !== "component")
      throw new Error("Component source was not found.");
    const source = {
      id: asset.id,
      revision: asset.revision,
      files: { ...asset.files },
    };
    const expectedSourceHash = await sourceSha256(source.files);
    const response = await fetch("/api/component/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(source),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        body.error || `Component build failed (${response.status}).`,
      );
    }
    const artifact = (await response.json()).artifact as BuiltArtifact;
    if (
      artifact.id !== source.id ||
      artifact.revision !== source.revision ||
      artifact.sourceSha256 !== expectedSourceHash ||
      artifact.witSha256 !== (await witSha256(source.files)) ||
      artifact.schemaVersion !== 2 ||
      artifact.profile !== "component-model-0.3" ||
      !/^[0-9a-f-]{36}$/.test(artifact.buildId) ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      !Array.isArray(artifact.imports)
    )
      throw new Error("Build metadata did not match the submitted source.");
    const bytesResponse = await fetch(
      `/api/artifacts/${artifact.sha256}.wasm`,
      { cache: "no-store" },
    );
    if (!bytesResponse.ok)
      throw new Error("Built bytes unavailable for verification.");
    const bytes = new Uint8Array(await bytesResponse.arrayBuffer());
    if (
      artifact.bytes !== bytes.byteLength ||
      artifact.sha256 !== (await sha256(bytes))
    )
      throw new Error("Build artifact bytes failed verification.");
    if (!store.installArtifact(workspaceId, source, artifact, asset.instanceId))
      throw new Error(
        "Source changed during the build. Rebuild the current revision.",
      );
    return artifact;
  }
  function openWidgetScope(
    workspaceId: string,
    instanceId: string,
    grants: Iterable<string>,
  ) {
    const workspace = store
      .get()
      .workspaces.find((item) => item.id === workspaceId);
    if (workspace?.dock.panels[instanceId]?.kind !== "widget")
      throw new Error("Widget instance no longer exists.");
    const scope = grantedWidgetScope(
      openScope(workspaceId, `Widget · ${instanceId}`),
      grants,
    );
    const unsubscribe = store.subscribe(() => {
      if (
        store.active().id !== workspaceId ||
        !store.get().workspaces.find((item) => item.id === workspaceId)?.dock
          .panels[instanceId]
      )
        void revoke();
    });
    function revoke() {
      unsubscribe();
      return scope.revoke();
    }
    return { acquire: scope.acquire, revoke };
  }
  return {
    store,
    runner,
    approveAndRun,
    runPackageCommand,
    runApprovals: {
      inspect: () => approvalSnapshot,
      subscribe: (listener: () => void) => {
        approvalListeners.add(listener);
        return () => {
          approvalListeners.delete(listener);
        };
      },
    },
    buildAsset,
    openScope,
    openWidgetScope,
    aiSettings,
    diagnostics: { inspect: host.inspect, subscribe: host.subscribe },
    dispose: () => {
      disposed = true;
      unsubscribeScopes();
      unsubscribeRevocations();
      for (const approval of approvals) approval.controller.abort();
      return host.dispose();
    },
  };
}

const browserStorage: KeyValueStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

export const deps = createComposition(browserStorage);
export const packageRuntime = createPackageRuntime(deps);
export const sharing = createWorkspaceSharing(deps.store);

const SESSION_KEY = "unit-workspace.demo-session.v1";
export const demoSession = {
  get(): { kind: "guest" | "demo"; email?: string } | null {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return value?.kind === "guest" || value?.kind === "demo" ? value : null;
    } catch {
      return null;
    }
  },
  set(value: { kind: "guest" | "demo"; email?: string } | null) {
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  },
};

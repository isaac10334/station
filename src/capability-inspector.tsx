import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { AcquisitionSnapshot, HostSnapshot, ProviderSnapshot, ScopeSnapshot } from "@loop-kit/host";
import { Tabs, TabsList, TabsTab, TabsPanel, TabsPanels } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComponentGrantList } from "@/components/workspace/component-permissions";
import { InspectorBranch } from "@/components/ui/inspector-branch";
import { COMPONENT_GRANTS } from "./component-grants";
import { assetCatalog, textDigest, workspaceClock, type WorkspaceCapabilityRuntime } from "./workspace-capabilities";
import type { Workspace } from "./model";
import type { WidgetActions } from "./widget-views";
import { acquisitionProvider, capabilityProviders, scopeUseCount } from "./capability-inspection";

function Identity({ children }: { children: string }) {
  return <code className="block break-all py-1 text-[10px] text-fg-3">{children}</code>;
}

const useStateLabel = { pending: "Creating", active: "In use", releasing: "Releasing" } as const;

/** The contract ID stays visible, with the same implementation summary in every view. */
function CapabilityTitle({ id, providers }: { id: string; providers: readonly ProviderSnapshot[] }) {
  return <span className="block min-w-0">
    <code className="block break-all text-[12px] text-fg">{id}</code>
    <span className="mt-0.5 block break-words text-[10px] text-fg-3">{providers.length
      ? providers.map(provider => `${provider.name}${provider.state === "unregistering" ? " (removing)" : ""}`).join(" · ")
      : "No provider registered"}</span>
  </span>;
}

/** Shared implementation details for contract definitions and scope-owned instances. */
function ProviderDetails({ provider }: { provider: ProviderSnapshot }) {
  return <div className="my-2 space-y-1 text-[11px]">
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
      <dt className="text-fg-3">Provider</dt><dd className="break-words text-fg-2">{provider.name}</dd>
      <dt className="text-fg-3">Registration</dt><dd className="text-fg-3">{provider.state === "registered" ? "Available application-wide" : "Removing · awaiting cleanup"}</dd>
    </dl>
    <p className="break-words leading-relaxed text-fg-3">{provider.description || "No provider description registered."}</p>
  </div>;
}

function CapabilityTree({ snapshot, workspaceId, runtime, enabled }: { snapshot: HostSnapshot; workspaceId: string; runtime: WorkspaceCapabilityRuntime; enabled: boolean }) {
  const namespaces = [...new Set(snapshot.definitions.map(definition => definition.namespace))].sort();
  return <nav className="station-layout-tree" aria-label="Capability tree">
    {namespaces.map(namespace => {
      const definitions = snapshot.definitions.filter(definition => definition.namespace === namespace);
      const packages = [...new Set(definitions.map(definition => definition.package))].sort();
      return <InspectorBranch key={namespace} title={namespace} meta={`${packages.length} package${packages.length === 1 ? "" : "s"}`}>
        {packages.map(packageName => {
          const contracts = definitions.filter(definition => definition.package === packageName)
            .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
          return <InspectorBranch key={packageName} title={`${namespace}:${packageName}`} meta={`${contracts.length} capabilities`}>
            {contracts.map(definition => {
              const providers = capabilityProviders(snapshot, definition.id, definition.version);
              return <InspectorBranch key={JSON.stringify([definition.id, definition.version])} title={<CapabilityTitle id={definition.id} providers={providers} />} meta={`v${definition.version}`} initiallyOpen={false}>
                <p className="my-2 text-[11px] font-medium text-fg-2">{definition.name}</p>
                <p className="my-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-fg-2">{definition.description || "No contract description registered."}</p>
                {providers.map((provider, index) => <div key={provider.state === "registered" ? "registered" : `unregistering:${index}`} className="my-2 border-t border-line pt-1">
                  <ProviderDetails provider={provider} />
                  <InspectorBranch title="Used by scopes" meta={provider.acquisitions.length} initiallyOpen={false}>
                    {provider.acquisitions.map(item => <div key={item.id} className="border-b border-line py-2 last:border-0">
                      <p className="break-words text-[11px] text-fg-2">{snapshot.scopes.find(scope => scope.id === item.scopeId)?.name ?? item.scopeId}</p>
                      <Identity>{`${item.scopeId} · ${item.id} · ${useStateLabel[item.state]}`}</Identity>
                    </div>)}
                    {!provider.acquisitions.length && <p className="station-tree-empty">No uses. Instances are created when a scope acquires this capability.</p>}
                  </InspectorBranch>
                  {provider.state === "registered" && <ProviderProbe key={workspaceId} capabilityId={definition.id} version={definition.version} workspaceId={workspaceId} runtime={runtime} enabled={enabled} />}
                </div>)}
                {!providers.length && <p className="my-2 text-[11px] text-fg-3">Defined, but unavailable until a provider registers this exact version.</p>}
              </InspectorBranch>;
            })}
          </InspectorBranch>;
        })}
      </InspectorBranch>;
    })}
    {!snapshot.definitions.length && <p className="station-tree-empty">No capabilities defined.</p>}
  </nav>;
}

function Acquisition({ item, snapshot }: { item: AcquisitionSnapshot; snapshot: HostSnapshot }) {
  const provider = acquisitionProvider(snapshot, item);
  return <InspectorBranch title={<CapabilityTitle id={item.capabilityId} providers={provider ? [provider] : []} />} meta={useStateLabel[item.state]} initiallyOpen={false}>
    <Identity>{`${item.id} · version ${item.version}`}</Identity>
    {provider && <ProviderDetails provider={provider} />}
  </InspectorBranch>;
}

function ScopeTree({ snapshot }: { snapshot: HostSnapshot }) {
  function describe(scope: ScopeSnapshot) {
    const children = snapshot.scopes.filter(child => child.parentId === scope.id);
    const count = scopeUseCount(snapshot, scope.id);
    return <InspectorBranch key={scope.id} title={scope.name} meta={scope.state === "revoking" ? "revoking" : count ? `${count} use${count === 1 ? "" : "s"}` : "idle"}>
      <Identity>{scope.id}</Identity>
      {scope.acquisitions.map(item => <Acquisition key={item.id} item={item} snapshot={snapshot} />)}
      {children.map(describe)}
      {!count && <p className="station-tree-empty">No capability instances. A scope alone starts no work.</p>}
    </InspectorBranch>;
  }
  return <nav className="station-layout-tree" aria-label="Application scope tree">
    {snapshot.scopes.filter(scope => scope.parentId === null).map(describe)}
    {!snapshot.scopes.length && <p className="station-tree-empty">No live scopes. Host {snapshot.state}.</p>}
  </nav>;
}

/** Explicit invocation through a fresh scope; leaving the tab or switching workspace revokes it. */
function ProviderProbe({ capabilityId, version, workspaceId, runtime, enabled }: { capabilityId: string; version: string; workspaceId: string; runtime: WorkspaceCapabilityRuntime; enabled: boolean }) {
  const inputId = useId();
  const [text, setText] = useState("Hello, Station");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<ReturnType<WorkspaceCapabilityRuntime["openScope"]> | null>(null);
  useEffect(() => {
    if (!enabled) setBusy(false);
    return () => { const scope = active.current; active.current = null; void scope?.revoke().catch(console.error); };
  }, [workspaceId, runtime, enabled]);
  const supported = [workspaceClock, textDigest, assetCatalog].some(contract => contract.id === capabilityId && contract.version === version);
  async function invoke() {
    if (active.current || !enabled || !supported) return;
    setError(""); setOutput(""); setBusy(true);
    let scope: ReturnType<WorkspaceCapabilityRuntime["openScope"]> | null = null;
    try {
      scope = runtime.openScope(workspaceId, `Inspector · ${capabilityId.split("/").at(-1)}`);
      active.current = scope;
      let result: string;
      if (capabilityId === textDigest.id) result = await (await scope.acquire(textDigest)).value.sha256(text);
      else if (capabilityId === assetCatalog.id) {
        const assets = (await scope.acquire(assetCatalog)).value.list();
        result = assets.length ? assets.map(asset => `${asset.name} · ${asset.kind} · revision ${asset.revision}`).join("\n") : "No assets in this workspace.";
      } else {
        const clock = (await scope.acquire(workspaceClock)).value;
        result = new Date(clock.now()).toISOString();
      }
      if (active.current === scope) setOutput(result);
    } catch (reason) {
      if (!scope || active.current === scope) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      try { await scope?.revoke(); } catch (reason) { if (active.current === scope) setError(String(reason)); }
      if (active.current === scope) { active.current = null; setBusy(false); }
      else if (!scope) setBusy(false);
    }
  }
  if (!supported) return <p className="my-2 text-[11px] text-fg-3">{capabilityId === "unit:workspace/component-runtime-polyengine" ? "Use the Component editor’s Run tab to invoke this provider with verified bytes and import grants." : "No inspector action for this contract version. Its consumers acquire it through their own workspace flow."}</p>;
  return <div className="space-y-2 py-2">
    {capabilityId === textDigest.id && <div><label htmlFor={inputId} className="mb-1 block text-[11px] text-fg-2">Text to hash</label><Input id={inputId} value={text} onChange={event => setText(event.target.value)} maxLength={65536} /></div>}
    <Button type="button" variant="secondary" size="sm" disabled={busy} aria-busy={busy} onClick={invoke}>{busy ? "Invoking…" : capabilityId === assetCatalog.id ? "Read workspace assets" : capabilityId === textDigest.id ? "Hash text" : "Read local time"}</Button>
    {output && <output className="block whitespace-pre-wrap break-all rounded-md bg-fg/[0.04] p-2 font-mono text-[11px] text-fg-2" aria-live="polite">{output}</output>}
    {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
  </div>;
}

/** Application-wide lifecycle inspection. Asset selection never determines the host or scope tree. */
export function CapabilityInspector({ workspace, actions, runtime }: { workspace: Workspace; actions: WidgetActions; runtime: WorkspaceCapabilityRuntime }) {
  const snapshot = useSyncExternalStore(runtime.diagnostics.subscribe, runtime.diagnostics.inspect);
  const [tab, setTab] = useState("capabilities");
  const components = workspace.assets.filter(asset => asset.kind === "component");
  return <div className="station-inspector">
    <Tabs value={tab} onValueChange={value => setTab(String(value))} size="sm">
      <TabsList aria-label="Capability inspection"><TabsTab value="capabilities" count={snapshot.definitions.length}>Capabilities</TabsTab><TabsTab value="scopes" count={snapshot.scopes.length}>Scopes</TabsTab><TabsTab value="grants" count={components.length}>Grants</TabsTab></TabsList>
      <TabsPanels animateHeight={false}>
      <TabsPanel value="capabilities" keepMounted>
        <p className="my-3 text-[11px] leading-relaxed text-fg-3">Definitions and application-wide providers, grouped by namespace and package. Expand a capability for its contract, scope usage and test actions.</p>
        <CapabilityTree snapshot={snapshot} workspaceId={workspace.id} runtime={runtime} enabled={tab === "capabilities"} />
      </TabsPanel>
      <TabsPanel value="scopes" keepMounted>
        <p className="my-3 text-[11px] leading-relaxed text-fg-3">Every saved workspace has a scope, even with inactive UI. Idle scopes start no work. Uses belong to a scope or its children; expand one to see its provider.</p>
        <ScopeTree snapshot={snapshot} />
        <div className="station-layout-tree mt-3"><InspectorBranch title="How scopes work" initiallyOpen={false}>
          <p className="my-2 text-[11px] leading-relaxed text-fg-3">Acquiring asks an application-wide provider to create a service instance owned by the requesting scope. Each acquisition creates a fresh instance. Counts include creation and cleanup.</p>
          <p className="my-2 text-[11px] leading-relaxed text-fg-3">Revoking a scope cancels its uses and child scopes. The provider remains available to other scopes. Scope names and nesting describe ownership, not permissions or whether a workspace UI is loaded.</p>
        </InspectorBranch></div>
      </TabsPanel>
      <TabsPanel value="grants" keepMounted>
        <p className="my-3 text-[11px] leading-relaxed text-fg-3">Component import grants in {workspace.name}. Choose an asset below. Revoke saved approvals or active one-run access. Revoking cancels invocations using that capability.</p>
        <nav className="station-layout-tree" aria-label="Component grant tree">{components.map(asset => <InspectorBranch key={asset.instanceId} title={asset.name} meta={`${COMPONENT_GRANTS.filter(grant => asset.grants[grant.key]).length}/${COMPONENT_GRANTS.length} allowed`}>
          <Identity>{asset.id}</Identity>
          <ComponentGrantList asset={asset} onGrant={actions.onGrant} />
          <Button type="button" variant="ghost" size="sm" className="my-2" onClick={() => actions.onOpenRun(asset.id)}>Open {asset.name} run controls</Button>
        </InspectorBranch>)}</nav>
        {!components.length && <div className="space-y-2 py-2"><p className="text-[11px] text-fg-3">No Components in this workspace. Web content has no capability bridge.</p><Button type="button" variant="secondary" size="sm" onClick={actions.onNewAsset}>Create Component</Button></div>}
      </TabsPanel>
      </TabsPanels>
    </Tabs>
  </div>;
}

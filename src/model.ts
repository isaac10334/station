import { greetingSource } from "./generated/greeting";
import { HOST_CLOCK, HOST_FEED, HOST_LOG, HOST_SURFACE } from "./component-contract";
export { HOST_CLOCK, HOST_FEED, HOST_LOG, HOST_SURFACE } from "./component-contract";
import { DEFAULT_DOCK_POLICY, createDockLayout, migrateDock, reduceDock, type Command, type DockLayout, type DockPolicy } from "./docking/core";
import type { BuiltArtifact, BuildSource } from "./build-contract";
import { normalizeNavigation, type NavigationFilter } from "./navigation-filter";
import { type WidgetId } from "./panel-layout";
export type { WidgetId } from "./panel-layout";

export type ComponentAsset = {
  kind: "component";
  id: string;
  instanceId: string;
  name: string;
  description: string;
  language: "rust";
  files: Record<string, string>;
  revision: number;
  artifact: null | BuiltArtifact;
  grants: Record<string, boolean>;
};

/** Authored HTML runs only in the sandboxed web preview, never in the host document. */
export type WebContentAsset = {
  kind: "web-content";
  id: string;
  instanceId: string;
  name: string;
  description: string;
  html: string;
  revision: number;
};
export type Asset = ComponentAsset | WebContentAsset;

export type Workspace = {
  id: string;
  name: string;
  description: string;
  selectedAssetId: string | null;
  assets: Asset[];
  dock: DockLayout;
  navigation: NavigationFilter;
};

export const DEFAULT_WIDGETS: WidgetId[] = ["weather", "clock", "stack", "capabilities"];

export type AppSettings = {
  theme: "dark" | "light" | "system";
  density: "compact" | "comfortable";
  accent: "indigo" | "blue" | "cyan" | "violet";
  ai: {
    provider: "openrouter" | "vercel";
    openrouter: { key: string; model: string; url: string };
    vercel: { key: string; model: string; url: string };
  };
};

export type State = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  app: AppSettings;
};

export function hasCurrentArtifact(asset: ComponentAsset): boolean {
  return asset.artifact?.schemaVersion === 2 && asset.artifact.profile === "component-model-0.3" &&
    asset.artifact.id === asset.id && asset.artifact.revision === asset.revision;
}
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE = "unit-workspace.v4";
const LEGACY_WORKSPACES = "unit-workspace.workspaces.v3";
const LEGACY_ACTIVE = "unit-workspace.active.v3";
const LEGACY_APP = "unit-workspace.app.v3";

const appDefaults: AppSettings = {
  theme: "dark",
  density: "compact",
  accent: "indigo",
  ai: {
    provider: "openrouter",
    openrouter: {
      key: "",
      model: "openrouter/auto",
      url: "https://openrouter.ai/api/v1",
    },
    vercel: {
      key: "",
      model: "openai/gpt-5.6-sol",
      url: "https://ai-gateway.vercel.sh/v1",
    },
  },
};

function read(storage: KeyValueStorage, key: string): any {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    return null;
  }
}

export function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "component"
  );
}

const WEB_WIDGET_STARTER = `<main class="widget">
  <span>MY WIDGET</span>
  <h1>Counter</h1>
  <button id="count" type="button">Count: 0</button>
</main>
<style>
  body { margin: 0; font: 14px system-ui; color: #18212d; background: #f7f7f4; }
  .widget { padding: 24px; }
  span { font-size: 11px; font-weight: 700; letter-spacing: .12em; }
  h1 { margin: 8px 0 18px; font-size: 24px; }
  button { padding: 9px 14px; border: 1px solid #adb6c1; border-radius: 7px; background: white; cursor: pointer; }
  button:focus-visible { outline: 2px solid #324ecc; outline-offset: 2px; }
</style>
<script>
  let count = 0;
  const button = document.getElementById('count');
  button.addEventListener('click', () => { button.textContent = 'Count: ' + ++count; });
</script>`;

function sample(): ComponentAsset {
  return {
    id: "greeting",
    kind: "component",
    instanceId: crypto.randomUUID(),
    name: "Greeting",
    description:
      "A Rust Component with host logging, a text surface, and a string export.",
    language: "rust",
    files: { ...greetingSource },
    revision: 0,
    artifact: null,
    grants: { [HOST_LOG]: false, [HOST_FEED]: false, [HOST_SURFACE]: false, [HOST_CLOCK]: false },
  };
}

function newWorkspace(id: string, name: string, description = ""): Workspace {
  const asset = sample();
  return { id, name, description, selectedAssetId: asset.id, assets: [asset], dock: createDockLayout(), navigation: normalizeNavigation() };
}

function initialState(storage: KeyValueStorage, policy: DockPolicy = DEFAULT_DOCK_POLICY): State {
  const prior = read(storage, STORAGE);
  if (
    prior &&
    Array.isArray(prior.workspaces) &&
    prior.workspaces.length &&
    prior.workspaces.every(
      (workspace: any) =>
        typeof workspace.id === "string" && Array.isArray(workspace.assets ?? workspace.units),
    )
  ) {
    return {
      ...prior,
      app: { ...appDefaults, ...prior.app, theme: ["light", "dark", "system"].includes(prior.app?.theme) ? prior.app.theme : "dark" },
      workspaces: prior.workspaces.map((workspace: any): Workspace => {
        const { widgets, layout, dock, units, selectedUnitId, ...rest } = workspace;
        // Migrate metadata only: authored source, grants, hashes and identity stay intact.
        return { ...rest, navigation: normalizeNavigation(workspace.navigation), selectedAssetId: workspace.selectedAssetId !== undefined ? workspace.selectedAssetId : selectedUnitId ?? null,
          assets: (workspace.assets ?? units).map((asset: Asset) => ({ ...asset, kind: asset.kind === "web-content" ? "web-content" : "component", instanceId: asset.instanceId || crypto.randomUUID() })),
          dock: migrateDock(dock ?? layout, Array.isArray(widgets) ? widgets : DEFAULT_WIDGETS, policy) };
      }),
    } as State;
  }
  const legacy = read(storage, LEGACY_WORKSPACES);
  const workspaces: Workspace[] =
    Array.isArray(legacy) && legacy.length
      ? legacy
          .filter((item: any) => item && typeof item.id === "string")
          .map((item: any) =>
            newWorkspace(
              item.id,
              item.name || "Workspace",
              item.description || "",
            ),
          )
      : [newWorkspace("default", "My Workspace", "Local asset workspace")];
  const legacyActive = read(storage, LEGACY_ACTIVE);
  const legacyApp = read(storage, LEGACY_APP) || {};
  return {
    workspaces,
    activeWorkspaceId: workspaces.some((item) => item.id === legacyActive)
      ? legacyActive
      : workspaces[0].id,
    app: {
      ...appDefaults,
      density: legacyApp.density || appDefaults.density,
      accent: legacyApp.accent || appDefaults.accent,
      ai: {
        ...appDefaults.ai,
        ...(legacyApp.ai || {}),
        openrouter: {
          ...appDefaults.ai.openrouter,
          ...(legacyApp.ai?.openrouter || {}),
        },
        vercel: { ...appDefaults.ai.vercel, ...(legacyApp.ai?.vercel || {}) },
      },
    },
  };
}

/** Workspace state and bounded layout history; pass the same policy to `DockHost` for matching previews. */
export function createStore(storage: KeyValueStorage, policy: DockPolicy = DEFAULT_DOCK_POLICY) {
  let state = initialState(storage, policy);
  const layoutHistory = new Map<string, { past: DockLayout[]; future: DockLayout[]; lastResize: string | null; lastAt: number }>();
  const historyFor = (id: string) => {
    let history = layoutHistory.get(id);
    if (!history) { history = { past: [], future: [], lastResize: null, lastAt: 0 }; layoutHistory.set(id, history); }
    return history;
  };
  const repairHistory = (layout: DockLayout, workspace: Workspace) => {
    const copy = structuredClone(layout);
    for (const [id, panel] of Object.entries(copy.panels))
      if ((panel.kind === "asset" || panel.kind === "web-widget") && !workspace.assets.some((asset) => asset.id === panel.assetId)) delete copy.panels[id];
    return migrateDock(copy, DEFAULT_WIDGETS, policy);
  };
  const listeners = new Set<() => void>();
  const grantRevocations = new Set<(instanceId: string, capability: string) => void>();
  function publish(next: State) {
    state = next;
    // Surface visibility is a session preference; saved trees and panel IDs remain intact.
    storage.setItem(STORAGE, JSON.stringify({ ...state, workspaces: state.workspaces.map((workspace) => ({ ...workspace, dock: { ...workspace.dock, hidden: {} } })) }));
    listeners.forEach((listener) => listener());
  }
  function updateWorkspace(change: (workspace: Workspace) => Workspace) {
    publish({
      ...state,
      workspaces: state.workspaces.map((workspace) =>
        workspace.id === state.activeWorkspaceId
          ? change(workspace)
          : workspace,
      ),
    });
  }
  function updateAsset(
    id: string,
    change: (asset: Asset) => Asset,
  ) {
    updateWorkspace((workspace) => ({
      ...workspace,
      assets: workspace.assets.map((asset) =>
        asset.id === id ? change(asset) : asset,
      ),
    }));
  }

  const store = {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Notifies even when a saved grant was already false, to revoke one-run authority. */
    subscribeGrantRevocations(listener: (instanceId: string, capability: string) => void) {
      grantRevocations.add(listener);
      return () => { grantRevocations.delete(listener); };
    },
    active: () =>
      state.workspaces.find((item) => item.id === state.activeWorkspaceId)!,
    selected: () =>
      store
        .active()
        .assets.find((asset) => asset.id === store.active().selectedAssetId) ||
      null,
    selectWorkspace(id: string) {
      if (state.workspaces.some((item) => item.id === id))
        publish({ ...state, activeWorkspaceId: id });
    },
    createWorkspace(name: string) {
      const id = crypto.randomUUID();
      publish({
        ...state,
        workspaces: [...state.workspaces, newWorkspace(id, name)],
        activeWorkspaceId: id,
      });
    },
    renameWorkspace(name: string) {
      updateWorkspace((workspace) => ({ ...workspace, name }));
    },
    describeWorkspace(description: string) {
      updateWorkspace((workspace) => ({ ...workspace, description }));
    },
    /** Navigation preferences are content filters, independent of structural layout undo. */
    setNavigation(navigation: NavigationFilter) {
      updateWorkspace((workspace) => ({ ...workspace, navigation: normalizeNavigation(navigation) }));
    },
    dispatchDock(command: Command) {
      let result: ReturnType<typeof reduceDock> | null = null;
      updateWorkspace((workspace) => {
        if (command.type === "createWebWidget" && !workspace.assets.some((asset) => asset.id === command.assetId && asset.kind === "web-content")) {
          result = { ok: false, layout: workspace.dock, reason: "Web content asset not found" };
          return workspace;
        }
        if (command.type === "createAssetView" && !workspace.assets.some((asset) => asset.id === command.assetId)) { result = { ok: false, layout: workspace.dock, reason: "Asset content not found" }; return workspace; }
        result = reduceDock(workspace.dock, command, policy);
        if (result.ok && result.layout !== workspace.dock && !["activate", "browserView", "visibility"].includes(command.type)) {
          const history = historyFor(workspace.id);
          const resizeKey = command.type === "resizeSplit" ? command.nodeId : command.type === "resizeBottom" ? "bottom" : command.type === "resizeSidebar" ? "sidebar" : null;
          const now = Date.now();
          if (!resizeKey || history.lastResize !== resizeKey || now - history.lastAt > 800) {
            history.past.push(workspace.dock);
            if (history.past.length > 50) history.past.shift();
          }
          history.future = []; history.lastResize = resizeKey; history.lastAt = now;
        }
        return result.ok ? { ...workspace, dock: result.layout } : workspace;
      });
      return result!;
    },
    layoutHistory() {
      const history = historyFor(state.activeWorkspaceId);
      return { canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
    },
    undoLayout() {
      const workspace = store.active(), history = historyFor(workspace.id);
      const previous = history.past.pop();
      if (!previous) return false;
      history.future.push(workspace.dock); history.lastResize = null;
      updateWorkspace((current) => ({ ...current, dock: repairHistory(previous, current) }));
      return true;
    },
    redoLayout() {
      const workspace = store.active(), history = historyFor(workspace.id);
      const next = history.future.pop();
      if (!next) return false;
      history.past.push(workspace.dock); history.lastResize = null;
      updateWorkspace((current) => ({ ...current, dock: repairHistory(next, current) }));
      return true;
    },
    selectAsset(id: string) {
      updateWorkspace((workspace) =>
        workspace.assets.some((asset) => asset.id === id)
          ? { ...workspace, selectedAssetId: id }
          : workspace,
      );
    },
    createAsset(name: string) {
      const workspace = store.active();
      const base = slug(name);
      let id = base;
      let suffix = 2;
      while (workspace.assets.some((asset) => asset.id === id))
        id = `${base}-${suffix++}`;
      const files = {
        ...greetingSource,
        "Cargo.toml": greetingSource["Cargo.toml"].replace(
          'name = "greeting"',
          `name = "${id}"`,
        ),
        "Cargo.lock": greetingSource["Cargo.lock"].replace(
          'name = "greeting"',
          `name = "${id}"`,
        ),
      };
      const asset: ComponentAsset = {
        kind: "component",
        id,
        instanceId: crypto.randomUUID(),
        name,
        description: "New Rust Component project",
        language: "rust",
        files,
        revision: 0,
        artifact: null,
        grants: { [HOST_LOG]: false, [HOST_FEED]: false, [HOST_SURFACE]: false, [HOST_CLOCK]: false },
      };
      updateWorkspace((current) => ({
        ...current,
        assets: [...current.assets, asset],
        selectedAssetId: id,
      }));
      return id;
    },
    createWebAsset(name: string, html: string = WEB_WIDGET_STARTER) {
      const workspace = store.active();
      const base = slug(name);
      let id = base, suffix = 2;
      while (workspace.assets.some((asset) => asset.id === id)) id = `${base}-${suffix++}`;
      const asset: WebContentAsset = {
        kind: "web-content", id, instanceId: crypto.randomUUID(), name,
        description: "Local HTML widget", revision: 0,
        html,
      };
      updateWorkspace((current) => ({ ...current, assets: [...current.assets, asset], selectedAssetId: id }));
      return id;
    },
    /** Remove source, grants, artifact metadata, and every open view in one persisted update. */
    deleteAssets(ids: string[]) {
      const requested = new Set(ids);
      const workspace = store.active();
      const removed = workspace.assets.filter((asset) => requested.has(asset.id)).map((asset) => asset.id);
      if (!removed.length) return 0;
      const deleted = new Set(removed);
      layoutHistory.delete(workspace.id);
      updateWorkspace((current) => {
        let dock = current.dock;
        for (const panel of Object.values(dock.panels)) {
          if ((panel.kind === "asset" || panel.kind === "web-widget") && deleted.has(panel.assetId)) {
            const result = reduceDock(dock, { type: "close", panelId: panel.id });
            if (result.ok) dock = result.layout;
          }
        }
        const assets = current.assets.filter((asset) => !deleted.has(asset.id));
        return { ...current, assets, dock, selectedAssetId: assets.some((asset) => asset.id === current.selectedAssetId) ? current.selectedAssetId : assets[0]?.id ?? null };
      });
      return removed.length;
    },
    renameAsset(id: string, name: string) {
      updateAsset(id, (asset) => ({ ...asset, name }));
    },
    describeAsset(id: string, description: string) {
      updateAsset(id, (asset) => ({ ...asset, description }));
    },
    editFile(id: string, path: string, content: string) {
      updateAsset(id, (asset) => asset.kind === "component" ? ({
        ...asset,
        files: { ...asset.files, [path]: content },
        revision: asset.revision + 1,
      }) : asset);
    },
    editWebHtml(id: string, html: string) {
      updateAsset(id, (asset) => asset.kind === "web-content" ? { ...asset, html, revision: asset.revision + 1 } : asset);
    },
    installArtifact(workspaceId: string, source: BuildSource, artifact: BuiltArtifact, instanceId: string): boolean {
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      const asset = workspace?.assets.find((item) => item.id === source.id);
      if (!asset || asset.kind !== "component" || asset.instanceId !== instanceId || asset.revision !== source.revision ||
          JSON.stringify(asset.files) !== JSON.stringify(source.files)) return false;
      publish({ ...state, workspaces: state.workspaces.map((item) =>
        item.id === workspaceId ? { ...item, assets: item.assets.map((candidate) =>
          candidate.id === source.id && candidate.kind === "component" ? { ...candidate, artifact } : candidate,
        ) } : item,
      ) });
      return true;
    },
    setGrant(id: string, capability: string, granted: boolean) {
      const instanceId = store.active().assets.find(asset => asset.id === id)?.instanceId;
      if (!granted && instanceId) grantRevocations.forEach(listener => listener(instanceId, capability));
      updateAsset(id, (asset) => asset.kind === "component" ? ({
        ...asset,
        grants: { ...asset.grants, [capability]: granted },
      }) : asset);
    },
    /** One persisted decision for the complete approval, without intermediate grant states. */
    allowComponentGrants(id: string, capabilities: readonly string[]) {
      updateAsset(id, asset => asset.kind === "component" ? { ...asset, grants: { ...asset.grants, ...Object.fromEntries(capabilities.map(key => [key, true])) } } : asset);
    },
    resetSample(id: string) {
      if (id !== "greeting") return;
      updateAsset(id, (asset) => asset.kind === "component" ? { ...sample(), grants: asset.grants } : asset);
    },
    patchApp(patch: Partial<AppSettings>) {
      publish({ ...state, app: { ...state.app, ...patch } });
    },
    patchAI(
      provider: "openrouter" | "vercel",
      patch: Partial<AppSettings["ai"]["openrouter"]>,
    ) {
      publish({
        ...state,
        app: {
          ...state.app,
          ai: {
            ...state.app.ai,
            [provider]: { ...state.app.ai[provider], ...patch },
          },
        },
      });
    },
  };
  return store;
}

export type Store = ReturnType<typeof createStore>;

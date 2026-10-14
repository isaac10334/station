import { createDesk, cloneDesk, type Desk, type DeskSetup } from "./desks";
import { DEFAULT_THEME } from "./theme-assets";
import { sourceAsset, sharedSourceSchema, type SharedSource } from "./workspace-sharing";
import type { PackageInstallation } from "./package-assets";
import {
  assetFiles,
  validSourcePath,
  WEB_PROJECT_STARTER,
} from "./source-project";
import { greetingSource } from "../generated/greeting";
import {
  HOST_CLOCK,
  HOST_FEED,
  HOST_LOG,
  HOST_SURFACE,
} from "./component-contract";
export {
  HOST_CLOCK,
  HOST_FEED,
  HOST_LOG,
  HOST_SURFACE,
} from "./component-contract";
import {
  DEFAULT_DOCK_POLICY,
  createDockLayout,
  migrateDock,
  reduceDock,
  type Command,
  type DockLayout,
  type DockPolicy,
} from "./docking";
import type { BuiltArtifact, BuildSource } from "./build-contract";
import {
  normalizeNavigation,
  type NavigationFilter,
} from "./navigation-filter";
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
  files?: Record<string, string>;
  revision: number;
};
export type DataAsset = {
  kind: "theme" | "package";
  id: string;
  instanceId: string;
  name: string;
  description: string;
  files: Record<string, string>;
  revision: number;
};
export type Asset = ComponentAsset | WebContentAsset | DataAsset;

export type Workspace = {
  id: string;
  name: string;
  description: string;
  selectedAssetId: string | null;
  assets: Asset[];
  desks: Desk[];
  activeDeskId: string;
  defaultSetup: DeskSetup | null;
  installations: PackageInstallation[];
  themeId: string | null;
  editorDefaults: Record<string, string>;
  dock: DockLayout;
  navigation: NavigationFilter;
};

export const DEFAULT_WIDGETS: WidgetId[] = [
  "weather",
  "clock",
  "stack",
  "capabilities",
];

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
  return (
    asset.artifact?.schemaVersion === 2 &&
    asset.artifact.profile === "component-model-0.3" &&
    asset.artifact.id === asset.id &&
    asset.artifact.revision === asset.revision
  );
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
    grants: {
      [HOST_LOG]: false,
      [HOST_FEED]: false,
      [HOST_SURFACE]: false,
      [HOST_CLOCK]: false,
    },
  };
}

function newWorkspace(id: string, name: string, description = ""): Workspace {
  const asset = sample();
  const desk = createDesk("Main desk", createDockLayout());
  return {
    id,
    name,
    description,
    selectedAssetId: asset.id,
    assets: [asset],
    desks: [desk],
    activeDeskId: desk.id,
    defaultSetup: null,
    installations: [],
    themeId: null,
    editorDefaults: {},
    dock: desk.dock,
    navigation: desk.navigation,
  };
}

function initialState(
  storage: KeyValueStorage,
  policy: DockPolicy = DEFAULT_DOCK_POLICY,
): State {
  const prior = read(storage, STORAGE);
  if (
    prior &&
    Array.isArray(prior.workspaces) &&
    prior.workspaces.length &&
    prior.workspaces.every(
      (workspace: any) =>
        typeof workspace.id === "string" &&
        Array.isArray(workspace.assets ?? workspace.units),
    )
  ) {
    return {
      ...prior,
      app: {
        ...appDefaults,
        ...prior.app,
        theme: ["light", "dark", "system"].includes(prior.app?.theme)
          ? prior.app.theme
          : "dark",
      },
      workspaces: prior.workspaces.map((workspace: any): Workspace => {
        const { widgets, layout, dock, units, selectedUnitId, ...rest } =
          workspace;
        // Migrate metadata only: authored source, grants, hashes and identity stay intact.
        const fallback = createDesk(
          "Main desk",
          migrateDock(
            dock ?? layout,
            Array.isArray(widgets) ? widgets : DEFAULT_WIDGETS,
            policy,
          ),
          normalizeNavigation(workspace.navigation),
        );
        const desks: Desk[] =
          Array.isArray(workspace.desks) && workspace.desks.length
            ? workspace.desks.map((desk: Desk) => ({
                ...fallback,
                ...desk,
                dock: migrateDock(desk.dock, DEFAULT_WIDGETS, policy),
                navigation: normalizeNavigation(desk.navigation),
              }))
            : [fallback];
        const active =
          desks.find((desk) => desk.id === workspace.activeDeskId) ?? desks[0]!;
        return {
          ...rest,
          desks,
          activeDeskId: active.id,
          defaultSetup: workspace.defaultSetup ?? null,
          installations: workspace.installations ?? [],
          themeId: workspace.themeId ?? null,
          editorDefaults: workspace.editorDefaults ?? {},
          navigation: active.navigation,
          selectedAssetId:
            workspace.selectedAssetId !== undefined
              ? workspace.selectedAssetId
              : (selectedUnitId ?? null),
          assets: (workspace.assets ?? units).map((asset: Asset) => ({
            ...asset,
            instanceId: asset.instanceId || crypto.randomUUID(),
            ...(asset.kind === "web-content"
              ? { files: assetFiles(asset) }
              : {}),
          })),
          dock: active.dock,
        };
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
export function createStore(
  storage: KeyValueStorage,
  policy: DockPolicy = DEFAULT_DOCK_POLICY,
) {
  let state = initialState(storage, policy);
  const layoutHistory = new Map<
    string,
    {
      past: DockLayout[];
      future: DockLayout[];
      lastResize: string | null;
      lastAt: number;
    }
  >();
  const historyFor = (id: string) => {
    let history = layoutHistory.get(id);
    if (!history) {
      history = { past: [], future: [], lastResize: null, lastAt: 0 };
      layoutHistory.set(id, history);
    }
    return history;
  };
  const repairHistory = (layout: DockLayout, workspace: Workspace) => {
    const copy = structuredClone(layout);
    for (const [id, panel] of Object.entries(copy.panels))
      if (
        (panel.kind === "asset" || panel.kind === "web-widget") &&
        !workspace.assets.some((asset) => asset.id === panel.assetId)
      )
        delete copy.panels[id];
    return migrateDock(copy, DEFAULT_WIDGETS, policy);
  };
  const readOnlySources = new Map<string, Set<string>>();
  const assertSourceAccess=(assetId:string)=>{if(readOnlySources.get(state.activeWorkspaceId)?.has(assetId))throw new Error("This invitation grants viewing only");};
  const listeners = new Set<() => void>();
  const grantRevocations = new Set<
    (instanceId: string, capability: string) => void
  >();
  function publish(next: State) {
    const nextState = {
      ...next,
      workspaces: next.workspaces.map((workspace) => ({
        ...workspace,
        desks: workspace.desks.map((desk) =>
          desk.id === workspace.activeDeskId
            ? {
                ...desk,
                dock: workspace.dock,
                navigation: workspace.navigation,
              }
            : desk,
        ),
      })),
    };
    // Surface visibility is a session preference; saved trees and panel IDs remain intact.
    storage.setItem(
      STORAGE,
      JSON.stringify({
        ...nextState,
        workspaces: nextState.workspaces.map((workspace) =>
          (({ dock, navigation, ...saved }) => saved)(workspace),
        ),
      }),
    );
    state = nextState;
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
  function updateAsset(id: string, change: (asset: Asset) => Asset) {
    updateWorkspace((workspace) => ({
      ...workspace,
      assets: workspace.assets.map((asset) =>
        asset.id === id ? change(asset) : asset,
      ),
    }));
  }

  const store = {
    get: () => state,
    /** Session-only source policy, supplied by the trusted collaboration service. */
    setSourceAccess(workspaceId:string,editable:boolean,assetIds?:string[]){
      const previous=readOnlySources.get(workspaceId);const next=editable?undefined:new Set(assetIds??state.workspaces.find(workspace=>workspace.id===workspaceId)?.assets.map(asset=>asset.id)??[]);
      if(previous?.size===next?.size&&(!previous||[...previous].every(id=>next?.has(id))))return;
      if(next)readOnlySources.set(workspaceId,next);else readOnlySources.delete(workspaceId);listeners.forEach(listener=>listener());
    },
    canEditSource:(assetId:string)=>!readOnlySources.get(state.activeWorkspaceId)?.has(assetId),
    /** Join source-only collaboration as a local workspace with an independent desk. */
    joinSharedWorkspace(name: string, sources: SharedSource[]) {
      const parsed=sources.map(source=>sharedSourceSchema.parse(source));
      const workspace=newWorkspace(`shared:${crypto.randomUUID()}`,name,"Shared source prototype");
      const desk=createDesk("Guest desk",createDockLayout());
      const next={...workspace,assets:parsed.map(source=>sourceAsset(source)),desks:[desk],activeDeskId:desk.id,dock:desk.dock,navigation:desk.navigation,selectedAssetId:null};
      publish({...state,workspaces:[...state.workspaces,next],activeWorkspaceId:next.id});return next.id;
    },
    /** Apply validated source records atomically; presentation and private authority remain local. */
    applySharedSources(workspaceId:string,sources:SharedSource[]) {
      const parsed=sources.map(source=>sharedSourceSchema.parse(source));
      publish({...state,workspaces:state.workspaces.map(workspace=>workspace.id!==workspaceId?workspace:{...workspace,assets:[...workspace.assets.filter(asset=>!parsed.some(source=>source.id===asset.id)),...parsed.map(source=>sourceAsset(source,workspace.assets.find(asset=>asset.id===source.id)))]})});
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Notifies even when a saved grant was already false, to revoke one-run authority. */
    subscribeGrantRevocations(
      listener: (instanceId: string, capability: string) => void,
    ) {
      grantRevocations.add(listener);
      return () => {
        grantRevocations.delete(listener);
      };
    },
    active: () =>
      state.workspaces.find((item) => item.id === state.activeWorkspaceId)!,
    selected: () =>
      store
        .active()
        .assets.find((asset) => asset.id === store.active().selectedAssetId) ||
      null,
    desk: () =>
      store
        .active()
        .desks.find((desk) => desk.id === store.active().activeDeskId)!,
    selectDesk(id: string) {
      const desk = store.active().desks.find((desk) => desk.id === id);
      if (desk)
        updateWorkspace((workspace) => ({
          ...workspace,
          activeDeskId: id,
          dock: desk.dock,
          navigation: desk.navigation,
        }));
    },
    createDesk(name: string, duplicate = false) {
      const workspace = store.active();
      const desk = cloneDesk(
        duplicate
          ? store.desk()
          : (workspace.defaultSetup ?? createDesk(name, createDockLayout())),
        name,
      );
      updateWorkspace((current) => ({
        ...current,
        desks: [...current.desks, desk],
        activeDeskId: desk.id,
        dock: desk.dock,
        navigation: desk.navigation,
      }));
    },
    renameDesk(name: string) {
      updateWorkspace((workspace) => ({
        ...workspace,
        desks: workspace.desks.map((desk) =>
          desk.id === workspace.activeDeskId ? { ...desk, name } : desk,
        ),
      }));
    },
    patchDesk(
      patch: Partial<
        Pick<
          Desk,
          | "toolbar"
          | "disabledContributions"
          | "hiddenDefinitions"
          | "editorDefaults"
          | "themeId"
        >
      >,
    ) {
      updateWorkspace((workspace) => ({
        ...workspace,
        desks: workspace.desks.map((desk) =>
          desk.id === workspace.activeDeskId ? { ...desk, ...patch } : desk,
        ),
      }));
    },
    deleteDesk() {
      const workspace = store.active();
      if (workspace.desks.length < 2) return;
      const desks = workspace.desks.filter(
        (desk) => desk.id !== workspace.activeDeskId,
      );
      const desk = desks[0]!;
      updateWorkspace((current) => ({
        ...current,
        desks,
        activeDeskId: desk.id,
        dock: desk.dock,
        navigation: desk.navigation,
      }));
    },
    saveDeskDefault() {
      const { id, name, ...setup } = store.desk();
      updateWorkspace((workspace) => ({
        ...workspace,
        defaultSetup: structuredClone(setup),
      }));
    },
    resetDeskDefault() {
      const workspace = store.active();
      if (!workspace.defaultSetup) return;
      const desk = {
        ...cloneDesk(workspace.defaultSetup, store.desk().name),
        id: workspace.activeDeskId,
      };
      layoutHistory.delete(`${workspace.id}:${desk.id}`);
      updateWorkspace((current) => ({
        ...current,
        desks: current.desks.map((item) => (item.id === desk.id ? desk : item)),
        dock: desk.dock,
        navigation: desk.navigation,
      }));
    },
    createDataAsset(kind: "theme" | "package", name: string) {
      let id = slug(name),
        suffix = 2;
      while (store.active().assets.some((asset) => asset.id === id))
        id = `${slug(name)}-${suffix++}`;
      const asset: DataAsset = {
        kind,
        id,
        name,
        instanceId: crypto.randomUUID(),
        revision: 0,
        description: "",
        files: {
          [kind === "theme" ? "theme.json" : "station.json"]: JSON.stringify(
            kind === "theme"
              ? DEFAULT_THEME
              : { version: 1, id, name, contributions: [], themeAssets: [] },
            null,
            2,
          ),
        },
      };
      updateWorkspace((workspace) => ({
        ...workspace,
        assets: [...workspace.assets, asset],
        selectedAssetId: id,
      }));
      return id;
    },
    importAssets(assets: Asset[]) {
      if (
        assets.some((asset) =>
          store.active().assets.some((current) => current.id === asset.id),
        )
      )
        throw new Error("Imported identity conflicts");
      updateWorkspace((workspace) => ({
        ...workspace,
        assets: [...workspace.assets, ...assets],
      }));
    },
    installPackage(installation: PackageInstallation) {
      updateWorkspace((workspace) => ({
        ...workspace,
        installations: [
          ...workspace.installations.filter(
            (item) => item.id !== installation.id,
          ),
          structuredClone(installation),
        ],
      }));
    },
    enablePackage(id: string, enabled: boolean) {
      updateWorkspace((workspace) => ({
        ...workspace,
        installations: workspace.installations.map((item) =>
          item.id === id ? { ...item, enabled } : item,
        ),
      }));
    },
    setPackageGrants(id: string, contributionId: string, grants: string[]) {
      updateWorkspace((workspace) => ({
        ...workspace,
        installations: workspace.installations.map((item) =>
          item.id === id
            ? {
                ...item,
                grants: {
                  ...item.grants,
                  [contributionId]: grants.filter((id) =>
                    item.manifest.contributions
                      .find(
                        (contribution) => contribution.id === contributionId,
                      )
                      ?.capabilities.includes(id),
                  ),
                },
              }
            : item,
        ),
      }));
    },
    uninstallPackage(id: string) {
      updateWorkspace((workspace) => ({
        ...workspace,
        installations: workspace.installations.filter((item) => item.id !== id),
      }));
    },
    removeFile(id: string, path: string) {
      assertSourceAccess(id);
      updateAsset(id, (asset) => {
        const files = { ...assetFiles(asset) };
        delete files[path];
        return { ...asset, files, revision: asset.revision + 1 };
      });
    },
    renameFile(id: string, from: string, to: string) {
      assertSourceAccess(id);
      if (!validSourcePath(to)) throw new Error("Use a relative file path");
      updateAsset(id, (asset) => {
        const files = { ...assetFiles(asset) };
        if (files[to] !== undefined || files[from] === undefined)
          throw new Error("File missing or destination already exists");
        files[to] = files[from];
        delete files[from];
        return { ...asset, files, revision: asset.revision + 1 };
      });
    },
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
    setWorkspaceTheme(themeId: string | null) {
      updateWorkspace((workspace) => ({ ...workspace, themeId }));
    },
    setWorkspaceEditor(kind: string, definitionId: string) {
      updateWorkspace((workspace) => ({
        ...workspace,
        editorDefaults: { ...workspace.editorDefaults, [kind]: definitionId },
      }));
    },
    setNavigation(navigation: NavigationFilter) {
      updateWorkspace((workspace) => ({
        ...workspace,
        navigation: normalizeNavigation(navigation),
      }));
    },
    dispatchDock(command: Command) {
      let result: ReturnType<typeof reduceDock> | null = null;
      updateWorkspace((workspace) => {
        if (command.type === "createEditorPart") {
          const owner = workspace.dock.panels[command.ownerId];
          if (
            !owner ||
            !("assetId" in owner) ||
            owner.assetId !== command.assetId ||
            !workspace.assets.some((asset) => asset.id === command.assetId)
          ) {
            result = {
              ok: false,
              layout: workspace.dock,
              reason: "Opened-asset binding unavailable",
            };
            return workspace;
          }
        }
        if (command.type === "createContribution") {
          const desk = workspace.desks.find(
            (desk) => desk.id === workspace.activeDeskId,
          )!;
          const available = workspace.installations.some(
            (installation) =>
              installation.enabled &&
              installation.manifest.contributions.some(
                (item) =>
                  `${installation.id}/${item.id}` === command.definitionId &&
                  item.role !== "command",
              ),
          );
          if (
            !available ||
            desk.disabledContributions.includes(command.definitionId)
          ) {
            result = {
              ok: false,
              layout: workspace.dock,
              reason: "Contribution unavailable on this desk",
            };
            return workspace;
          }
        }
        if (
          command.type === "createWebWidget" &&
          !workspace.assets.some(
            (asset) =>
              asset.id === command.assetId && asset.kind === "web-content",
          )
        ) {
          result = {
            ok: false,
            layout: workspace.dock,
            reason: "Web content asset not found",
          };
          return workspace;
        }
        if (
          command.type === "createAssetView" &&
          !workspace.assets.some((asset) => asset.id === command.assetId)
        ) {
          result = {
            ok: false,
            layout: workspace.dock,
            reason: "Asset content not found",
          };
          return workspace;
        }
        result = reduceDock(workspace.dock, command, policy);
        if (
          result.ok &&
          (command.type === "openAsset" ||
            command.type === "createAssetView") &&
          result.panelId &&
          !workspace.dock.panels[result.panelId]
        ) {
          const asset = workspace.assets.find(
            (asset) => asset.id === command.assetId,
          );
          const desk = workspace.desks.find(
            (desk) => desk.id === workspace.activeDeskId,
          )!;
          const definitionId = asset
            ? (desk.editorDefaults[asset.kind] ??
              workspace.editorDefaults[asset.kind])
            : undefined;
          if (definitionId) {
            const panelId = result.panelId;
            const configured = reduceDock(
              result.layout,
              { type: "setEditor", panelId, definitionId },
              policy,
            );
            result = configured.ok ? { ...configured, panelId } : configured;
          }
        }
        if (
          result.ok &&
          result.layout !== workspace.dock &&
          !["activate", "browserView", "visibility", "compose"].includes(
            command.type,
          )
        ) {
          const history = historyFor(
            `${workspace.id}:${workspace.activeDeskId}`,
          );
          const resizeKey =
            command.type === "resizeSplit"
              ? command.nodeId
              : command.type === "resizeBottom"
                ? "bottom"
                : command.type === "resizeSidebar"
                  ? "sidebar"
                  : null;
          const now = Date.now();
          if (
            !resizeKey ||
            history.lastResize !== resizeKey ||
            now - history.lastAt > 800
          ) {
            history.past.push(workspace.dock);
            if (history.past.length > 50) history.past.shift();
          }
          history.future = [];
          history.lastResize = resizeKey;
          history.lastAt = now;
        }
        return result.ok ? { ...workspace, dock: result.layout } : workspace;
      });
      return result!;
    },
    layoutHistory() {
      const history = historyFor(
        `${store.active().id}:${store.active().activeDeskId}`,
      );
      return {
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
      };
    },
    undoLayout() {
      const workspace = store.active(),
        history = historyFor(`${workspace.id}:${workspace.activeDeskId}`);
      const previous = history.past.pop();
      if (!previous) return false;
      history.future.push(workspace.dock);
      history.lastResize = null;
      updateWorkspace((current) => ({
        ...current,
        dock: repairHistory(previous, current),
      }));
      return true;
    },
    redoLayout() {
      const workspace = store.active(),
        history = historyFor(`${workspace.id}:${workspace.activeDeskId}`);
      const next = history.future.pop();
      if (!next) return false;
      history.past.push(workspace.dock);
      history.lastResize = null;
      updateWorkspace((current) => ({
        ...current,
        dock: repairHistory(next, current),
      }));
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
        grants: {
          [HOST_LOG]: false,
          [HOST_FEED]: false,
          [HOST_SURFACE]: false,
          [HOST_CLOCK]: false,
        },
      };
      updateWorkspace((current) => ({
        ...current,
        assets: [...current.assets, asset],
        selectedAssetId: id,
      }));
      return id;
    },
    createWebAsset(name: string, html?: string) {
      const workspace = store.active();
      const base = slug(name);
      let id = base,
        suffix = 2;
      while (workspace.assets.some((asset) => asset.id === id))
        id = `${base}-${suffix++}`;
      const asset: WebContentAsset = {
        kind: "web-content",
        id,
        instanceId: crypto.randomUUID(),
        name,
        description: "Local HTML widget",
        revision: 0,
        html: html ?? WEB_PROJECT_STARTER["index.html"],
        files:
          html === undefined
            ? { ...WEB_PROJECT_STARTER }
            : { "index.html": html },
      };
      updateWorkspace((current) => ({
        ...current,
        assets: [...current.assets, asset],
        selectedAssetId: id,
      }));
      return id;
    },
    /** Remove source, grants, artifact metadata, and every open view in one persisted update. */
    deleteAssets(ids: string[]) {
      const requested = new Set(ids);
      const workspace = store.active();
      const removed = workspace.assets
        .filter((asset) => requested.has(asset.id))
        .map((asset) => asset.id);
      if (!removed.length) return 0;
      const deleted = new Set(removed);
      for (const key of layoutHistory.keys())
        if (key.startsWith(`${workspace.id}:`)) layoutHistory.delete(key);
      updateWorkspace((current) => {
        const desks = current.desks.map((desk) => {
          let dock = desk.dock;
          for (const panel of Object.values(dock.panels))
            if (
              "assetId" in panel &&
              panel.assetId &&
              deleted.has(panel.assetId)
            ) {
              const result = reduceDock(dock, {
                type: "close",
                panelId: panel.id,
              });
              if (result.ok) dock = result.layout;
            }
          return { ...desk, dock };
        });
        const assets = current.assets.filter((asset) => !deleted.has(asset.id));
        return {
          ...current,
          desks,
          assets,
          dock: desks.find((desk) => desk.id === current.activeDeskId)!.dock,
          selectedAssetId: assets.some(
            (asset) => asset.id === current.selectedAssetId,
          )
            ? current.selectedAssetId
            : (assets[0]?.id ?? null),
        };
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
      assertSourceAccess(id);
      if (!validSourcePath(path)) throw new Error("Invalid source path");
      updateAsset(id, (asset) => ({
        ...asset,
        files: { ...assetFiles(asset), [path]: content },
        ...(asset.kind === "web-content" && path === "index.html"
          ? { html: content }
          : {}),
        revision: asset.revision + 1,
      }));
    },
    editWebHtml(id: string, html: string) {
      assertSourceAccess(id);
      updateAsset(id, (asset) =>
        asset.kind === "web-content"
          ? {
              ...asset,
              html,
              files: { ...assetFiles(asset), "index.html": html },
              revision: asset.revision + 1,
            }
          : asset,
      );
    },
    installArtifact(
      workspaceId: string,
      source: BuildSource,
      artifact: BuiltArtifact,
      instanceId: string,
    ): boolean {
      const workspace = state.workspaces.find(
        (item) => item.id === workspaceId,
      );
      const asset = workspace?.assets.find((item) => item.id === source.id);
      if (
        !asset ||
        asset.kind !== "component" ||
        asset.instanceId !== instanceId ||
        asset.revision !== source.revision ||
        JSON.stringify(asset.files) !== JSON.stringify(source.files)
      )
        return false;
      publish({
        ...state,
        workspaces: state.workspaces.map((item) =>
          item.id === workspaceId
            ? {
                ...item,
                assets: item.assets.map((candidate) =>
                  candidate.id === source.id && candidate.kind === "component"
                    ? { ...candidate, artifact }
                    : candidate,
                ),
              }
            : item,
        ),
      });
      return true;
    },
    setGrant(id: string, capability: string, granted: boolean) {
      const instanceId = store
        .active()
        .assets.find((asset) => asset.id === id)?.instanceId;
      if (!granted && instanceId)
        grantRevocations.forEach((listener) =>
          listener(instanceId, capability),
        );
      updateAsset(id, (asset) =>
        asset.kind === "component"
          ? {
              ...asset,
              grants: { ...asset.grants, [capability]: granted },
            }
          : asset,
      );
    },
    /** One persisted decision for the complete approval, without intermediate grant states. */
    allowComponentGrants(id: string, capabilities: readonly string[]) {
      updateAsset(id, (asset) =>
        asset.kind === "component"
          ? {
              ...asset,
              grants: {
                ...asset.grants,
                ...Object.fromEntries(capabilities.map((key) => [key, true])),
              },
            }
          : asset,
      );
    },
    resetSample(id: string) {
      assertSourceAccess(id);
      if (id !== "greeting") return;
      updateAsset(id, (asset) =>
        asset.kind === "component"
          ? { ...sample(), grants: asset.grants }
          : asset,
      );
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

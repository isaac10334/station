import { builtinIconAssets, isBuiltinIconAsset } from "../../../core/builtin-icons";
/** Application workspace owner. Inject persistence; dispose external subscriptions at their owning controller.
 * Serialized identities and migration keys remain compatibility contracts.
 */
import { slug, hasCurrentArtifact, type Asset, type ComponentAsset, type WebContentAsset, type DataAsset } from "../../../core/asset-state";
import type { Workspace, State, AppSettings } from "../../../core/workspace-state";
import type { KeyValueStorage } from "../../../contracts/storage";
import { DEFAULT_DATA } from "../../../core/data-sources";
import { DEFAULT_SHORTCUTS, INBOX_DOCUMENT, shortcutSettingsSchema, type ShortcutSettings } from "../../../core/shortcuts";
import { EMPTY_NOTE, notePath } from "../../../core/notes";
import { defaultDraft, programFiles } from "../../../core/programs";
import { availableDeskTemplates, deskTemplateAsset, parseDeskTemplate, isBuiltinDeskTemplate, createDefaultAppDock } from "../../../core/desk-templates";
import { parseAssetMetadataPatch } from "../../../core/inspector-schema";
import { DEFAULT_EDITOR_POLICY, resolveEditor } from "../../../core/asset-routing";
import { normalizeAssetGroups, moveAssetGroupMembers, type AssetGroup } from "../../../core/asset-groups";
import { builtinWidgetAssets, isBuiltinWidgetAsset, widgetDefinitionAsset, parseWidgetRecipe, forkWidgetRecipe } from "../../../core/widget-definitions";
import { createDesk, cloneDesk, initializeDeskToolbar, type Desk, type DeskSetup } from "../../../core/desks";
import { DEFAULT_THEME } from "../../../core/theme-assets";
import { sourceAsset, sharedSourceSchema, type SharedSource } from "../../../core/workspace-sharing";
import type { PackageInstallation } from "../../../core/package-assets";
import {
  assetFiles,
  validSourcePath,
  WEB_PROJECT_STARTER,
} from "../../../core/source-project";
import { greetingSource } from "../../../generated/greeting";
import {
  HOST_CLOCK,
  HOST_FEED,
  HOST_LOG,
  HOST_SURFACE,
} from "../../../core/component-contract";
import {
  DEFAULT_DOCK_POLICY,
  createDockLayout,
  migrateDock,
  reduceDock,
  type Command,
  type DockLayout,
  type DockPolicy,
  type Panel,
} from "../../../core/docking";
import type { BuiltArtifact, BuildSource } from "../../../core/build-contract";
import {
  normalizeNavigation,
  type NavigationFilter,
} from "../../../core/navigation-filter";
import { type WidgetId } from "../../../core/panel-layout";

/** Materialize the old desk-wide filter once for each Navigation instance. */
function migrateNavigationDock(value:any,widgets:WidgetId[],policy:DockPolicy,legacy?:NavigationFilter){const dock=migrateDock(value,widgets,policy);for(const panel of Object.values(dock.panels))if((panel.kind==='navigation'||panel.kind==='widget'&&panel.widget==='navigation')&&!value?.panels?.[panel.id]?.navigation)panel.navigation={filter:normalizeNavigation(legacy),presentation:'list'};return dock;}

export const DEFAULT_WIDGETS: WidgetId[] = ["clock", "action-button"];

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
  const dock = createDefaultAppDock();
  const desk = initializeDeskToolbar(createDesk("Main desk", dock));
  return {
    id,
    name,
    description,
    selectedAssetId: asset.id,
    programming: {instances:[],snapshots:[]},
    assets: [asset, ...starterAssets(), { id: "inbox", instanceId: crypto.randomUUID(), kind: "data-source", name: "Inbox", description: "Quick captures. Customize this ordinary data source and its views.", files: { "data.json": JSON.stringify(INBOX_DOCUMENT, null, 2) }, revision: 0 }],
    shortcuts: structuredClone(DEFAULT_SHORTCUTS),
    desks: [desk],
    activeDeskId: desk.id,
    defaultSetup: null,
    installations: [],
    themeId: "workspace-theme",
    editorDefaults: {},
    dock: desk.dock,
    navigation: desk.navigation,
  };
}

/** New-workspace content is ordinary editable source. Restoring a workspace never reseeds it. */
function starterAssets(): DataAsset[] {
  const data = {
    version: 1, provider: "local.table",
    columns: [
      { id: "name", label: "Name", type: "text" },
      { id: "status", label: "Status", type: "select", options: ["Planned", "In progress", "In review", "Done"] },
      { id: "kind", label: "Kind", type: "select", options: ["Interface", "Interaction", "System", "Asset"] },
      { id: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"] },
    ],
    records: [
      ["Explore the widget workspace", "In progress", "Interface", "High"],
      ["Make data views feel effortless", "In progress", "Interaction", "High"],
      ["Give every asset a clear identity", "In review", "System", "Medium"],
      ["Keep a page nearby", "Planned", "Interaction", "Medium"],
      ["Shape the small details", "Planned", "Asset", "Low"],
      ["Make room for your next idea", "Done", "Interface", "Medium"],
    ].map(([name, status, kind, priority], index) => ({ id: `reference-${index + 1}`, values: { name, status, kind, priority } })),
  };
  const sources: Pick<DataAsset, "id" | "name" | "kind" | "files">[] = [
    { id: "workspace-theme", name: "Workspace theme", kind: "theme", files: { "theme.json": JSON.stringify(DEFAULT_THEME, null, 2) } },
    { id: "references", name: "References", kind: "data-source", files: { "data.json": JSON.stringify(data, null, 2) } },
    { id: "a-little-direction", name: "A little direction", kind: "markdown", files: { "note.md": "## Keep the chrome quiet\n\nGive useful details room to breathe. This is your space to collect an idea, write a note, or start something new.\n\nEvery view is a widget. Move it, configure it, or make it your own." } },
    { id: "room-to-explore", name: "Room to explore", kind: "markdown", files: { "note.md": "## Same idea. Another surface.\n\nYour notes and data are assets. A widget is one way to see and edit them.\n\nTry editing a table cell, opening a page from the sidebar, or changing the Workspace theme in the Asset browser." } },
  ];
  return sources.map(value => ({ ...value, instanceId: crypto.randomUUID(), revision: 0, description: "Editable workspace starter" }));
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
          migrateNavigationDock(
            dock ?? layout,
            Array.isArray(widgets) ? widgets : DEFAULT_WIDGETS,
            policy,
            workspace.navigation,
          ),
          normalizeNavigation(workspace.navigation),
        );
        const desks: Desk[] =
          Array.isArray(workspace.desks) && workspace.desks.length
            ? workspace.desks.map((desk: Desk) => ({
                ...fallback,
                ...desk,
                dock: migrateNavigationDock(desk.dock, DEFAULT_WIDGETS, policy,desk.navigation),
                navigation: normalizeNavigation(desk.navigation),
              }))
            : [fallback];
        for (let i = 0; i < desks.length; i++) desks[i] = initializeDeskToolbar(desks[i]);
        for(const desk of desks)for(const panel of Object.values(desk.dock.panels))if((panel.kind==='navigation'||panel.kind==='widget'&&panel.widget==='navigation')&&!panel.navigation)panel.navigation={filter:structuredClone(desk.navigation),presentation:'list'};
        const active =
          desks.find((desk) => desk.id === workspace.activeDeskId) ?? desks[0]!;
        return {
          ...rest,
          shortcuts: workspace.shortcuts === undefined ? undefined : (shortcutSettingsSchema.safeParse(workspace.shortcuts).data ?? { entries: [] }),
          programming: {instances:(workspace.programming?.instances ?? []).map((instance:import("../../../core/programs").ProgramInstance)=>instance.taskId?{...instance,bindings:[],surfaceAccess:false,startup:false,disabled:true}:instance),snapshots:workspace.programming?.snapshots ?? []},
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
        !isBuiltinWidgetAsset(panel.assetId) && !isBuiltinIconAsset(panel.assetId) && !isBuiltinDeskTemplate(panel.assetId) && !workspace.assets.some((asset) => asset.id === panel.assetId)
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
    canEditSource:(assetId:string)=>!assetId.startsWith("builtin:") && !readOnlySources.get(state.activeWorkspaceId)?.has(assetId),
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
    /** Application-owned instance configuration. Assets never carry this authority. */
    setProgramming(value: import("../../../core/programs").ProgrammingState) {
      if (value.instances.length > 256 || value.snapshots.length > 512) throw new Error("Program workspace limit exceeded");
      updateWorkspace(workspace=>({...workspace,programming:structuredClone(value)}));
    },
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
    createDesk(name: string, duplicate = false, templateId?: string) {
      const workspace = store.active();
      const chosenTemplate = templateId ?? workspace.defaultTemplateId;
      const template = chosenTemplate ? availableDeskTemplates(workspace.assets).find(asset => asset.id === chosenTemplate) : undefined;
      if (templateId && !template) throw new Error("Desk template unavailable");
      const setup = template ? parseDeskTemplate(template.files["desk.json"] ?? "").setup : undefined;
      const desk = initializeDeskToolbar(cloneDesk(
        duplicate
          ? store.desk()
          : (setup ?? workspace.defaultSetup ?? createDesk(name, createDefaultAppDock())),
        name,
      ));
      updateWorkspace((current) => ({
        ...current,
        assets: !duplicate && (chosenTemplate === "builtin:desk-app" || !setup && !workspace.defaultSetup) ? [...current.assets, ...starterAssets().filter(asset => !current.assets.some(existing => existing.id === asset.id))] : current.assets,
        desks: [...current.desks, desk],
        activeDeskId: desk.id,
        dock: desk.dock,
        navigation: desk.navigation,
      }));
    },
    saveDeskTemplate(name: string) {
      const asset = deskTemplateAsset(name, store.desk());
      updateWorkspace(workspace => ({ ...workspace, assets: [...workspace.assets, asset], selectedAssetId: asset.id }));
      return asset.id;
    },
    forkDeskTemplate(id: string) {
      const source = availableDeskTemplates(store.active().assets).find(asset => asset.id === id);
      if (!source) throw new Error("Desk template unavailable");
      const parsed = parseDeskTemplate(source.files["desk.json"] ?? "");
      const asset = deskTemplateAsset(`${parsed.title} copy`, parsed.setup);
      updateWorkspace(workspace => ({ ...workspace, assets: [...workspace.assets, asset], selectedAssetId: asset.id }));
      return asset.id;
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
      const asset = deskTemplateAsset(`${name} default`, setup);
      updateWorkspace((workspace) => ({
        ...workspace,
        assets: [...workspace.assets, asset],
        defaultTemplateId: asset.id,
        defaultSetup: structuredClone(setup),
      }));
    },
    resetDeskDefault() {
      const workspace = store.active();
      const template = availableDeskTemplates(workspace.assets).find(asset => asset.id === workspace.defaultTemplateId);
      const setup = template ? parseDeskTemplate(template.files["desk.json"] ?? "").setup : workspace.defaultSetup;
      if (!setup) return;
      const desk = {
        ...cloneDesk(setup, store.desk().name),
        id: workspace.activeDeskId,
      };
      layoutHistory.delete(`${workspace.id}:${desk.id}`);
      updateWorkspace((current) => ({
        ...current,
        assets: workspace.defaultTemplateId === "builtin:desk-app" ? [...current.assets, ...starterAssets().filter(asset => !current.assets.some(existing => existing.id === asset.id))] : current.assets,
        desks: current.desks.map((item) => (item.id === desk.id ? desk : item)),
        dock: desk.dock,
        navigation: desk.navigation,
      }));
    },
    createDataAsset(kind: "theme" | "package" | "svg" | "decision" | "data-source" | "script" | "custom" | "markdown" | "note", name: string, scriptMode?: "javascript") {
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
          [kind === "script" ? "main.js" : kind === "data-source" ? "data.json" : kind === "theme" ? "theme.json" : kind === "svg" ? "image.svg" : kind === "decision" ? "decision.json" : "station.json"]: kind === "script" ? 'console.log("Evaluating input", input);\nreturn { message: "Hello from QuickJS", input };' : kind === "svg" ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg>' : JSON.stringify(
            kind === "theme"
              ? DEFAULT_THEME
              : kind === "data-source" ? DEFAULT_DATA : kind === "decision" ? DEFAULT_EDITOR_POLICY
              : { version: 1, id, name, contributions: [], themeAssets: [] },
            null,
            2,
          ),
        },
      };
      if (kind === "script" && scriptMode !== "javascript") asset.files = programFiles({...defaultDraft(name),role:"action",entry:"main.ts",files:{"main.ts":"export default async function(input:unknown) { return {message: \"Hello from TypeScript\", input}; }"}});
      if (kind === "markdown" || kind === "note") asset.files = { [notePath(kind)]: kind === "note" ? EMPTY_NOTE : `# ${name}\n\nStart writing here.\n` };
      updateWorkspace((workspace) => ({
        ...workspace,
        assets: [...workspace.assets, asset],
        selectedAssetId: id,
      }));
      return id;
    },
    createWidgetDefinition(name: string) {
      const source = widgetDefinitionAsset([], "builtin:stack")!;
      const asset = forkWidgetRecipe(source);
      const recipe = parseWidgetRecipe(asset.files["widget.json"]);
      asset.name = name;
      asset.files["widget.json"] = JSON.stringify({ ...recipe, title: name, slots: [[]] }, null, 2);
      updateWorkspace(workspace => ({...workspace,assets:[...workspace.assets,asset],selectedAssetId:asset.id}));
      return asset.id;
    },
    /** Fork a virtual or authored definition into ordinary editable workspace source. */
    forkWidgetDefinition(id: string) {
      let asset = widgetDefinitionAsset(store.active().assets, id);
      try { if (asset) parseWidgetRecipe(asset.files["widget.json"] ?? ""); }
      catch { asset = undefined; }
      if (!asset) {
        const snapshot = Object.values(store.active().dock.panels).find(panel => panel.definitionSnapshot?.assetId === id)?.definitionSnapshot;
        if (snapshot) asset = { kind: "widget-definition", id, instanceId: crypto.randomUUID(), name: snapshot.recipe.title, description: "Recovered instance definition source", revision: snapshot.revision, files: { "widget.json": JSON.stringify(snapshot.recipe) } };
      }
      if (!asset || asset.kind !== "widget-definition") throw new Error("Widget definition unavailable");
      const fork = forkWidgetRecipe(asset);
      updateWorkspace(workspace => ({ ...workspace, assets: [...workspace.assets, fork], selectedAssetId: fork.id }));
      return fork.id;
    },
    importAssets(assets: Asset[]) {
      if (
        assets.some((asset) => isBuiltinWidgetAsset(asset.id) || isBuiltinIconAsset(asset.id) || isBuiltinDeskTemplate(asset.id) ||
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
          { ...structuredClone(installation), installationId: crypto.randomUUID() },
        ],
      }));
    },
    /** Revoke session-derived installations across inactive workspaces as well. */
    revokeTaskInstallations(taskId?: string) {
      if (!state.workspaces.some(w => w.installations.some(i => i.authorizationTaskId && (!taskId || i.authorizationTaskId === taskId) && (i.enabled || Object.values(i.grants).some(g => g.length))))) return;
      publish({ ...state, workspaces: state.workspaces.map(w => ({ ...w, installations: w.installations.map(i => i.authorizationTaskId && (!taskId || i.authorizationTaskId === taskId) ? { ...i, enabled: false, grants: {} } : i) })) });
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
      const installation = store.active().installations.find(i => i.id === id);
      const allowed = installation?.manifest.contributions.find(c => c.id === contributionId)?.capabilities ?? [];
      const next = [...new Set(grants.filter(g => allowed.includes(g)))];
      if (JSON.stringify(installation?.grants[contributionId] ?? []) === JSON.stringify(next)) return;
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
    /** Trusted owner deletion. Exact current name confirmation prevents stale
     * reviews from deleting renamed workspaces. Keep one workspace available;
     * publishing the removal retires workspace-scoped runtime owners. */
    deleteWorkspace(id: string, confirmedName: string) {
      const target = state.workspaces.find(item => item.id === id);
      if (!target) throw new Error("Workspace no longer exists.");
      if (state.workspaces.length === 1) throw new Error("Create another workspace before deleting the last one.");
      if (confirmedName !== target.name) throw new Error("Type the workspace name exactly to confirm deletion.");
      const remaining = state.workspaces.filter(item => item.id !== id);
      publish({ ...state, workspaces: remaining, activeWorkspaceId: state.activeWorkspaceId === id ? remaining[0]!.id : state.activeWorkspaceId });
      readOnlySources.delete(id);
      for (const key of layoutHistory.keys()) if (key.startsWith(`${id}:`)) layoutHistory.delete(key);
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
    configureEditorPolicy(policyId: string | null, assetId?: string) {
      if (policyId && !store.active().assets.some(a => a.id === policyId && a.kind === "decision")) throw new Error("Choose a decision asset");
      if (assetId) { assertSourceAccess(assetId); updateAsset(assetId, a => ({ ...a, editorPolicyId: policyId ?? undefined })); }
      else updateWorkspace(w => ({ ...w, editorPolicyId: policyId ?? undefined }));
    },
    setNavigation(navigation: NavigationFilter) {
      updateWorkspace((workspace) => ({
        ...workspace,
        navigation: normalizeNavigation(navigation),
      }));
    },
    initializeNavigation(panelId: string) {
      const workspace = store.active(), panel = workspace.dock.panels[panelId];
      if (!panel || !(panel.kind === 'navigation' || panel.kind === 'widget' && panel.widget === 'navigation')) throw new Error('Choose Navigation');
      if (panel.navigation?.areasInitialized) return;
      const navigation = { filter: normalizeNavigation(panel.navigation?.filter ?? workspace.navigation), presentation: panel.navigation?.presentation ?? 'list' as const, ...panel.navigation, areasInitialized: true };
      const dock = { ...workspace.dock, panels: { ...workspace.dock.panels, [panelId]: { ...panel, navigation } }, containers: { ...workspace.dock.containers } };
      if (!dock.containers[panelId]) {
        dock.containers[panelId] = { kind: 'stack', id: crypto.randomUUID(), tabs: [], active: '', keepEmpty: true, presentation: 'plain' };
        const result = reduceDock(dock, { type: 'createWidget', widget: 'data-view', target: { surface: 'sidebar', ownerId: panelId, intent: 'append' }, defaults: { displayName: 'Pages', chrome: 'seamless', dataView: { collection: 'notes', presentation: 'tree', search: '', descending: false, hiddenColumns: [] } } });
        if (!result.ok) throw new Error(result.reason);
        updateWorkspace(current => ({ ...current, dock: result.layout }));
      } else updateWorkspace(current => ({ ...current, dock }));
    },
    configureNavigation(panelId:string,config:NonNullable<Panel['navigation']>) {
      const panel=store.active().dock.panels[panelId];
      if(!panel || !(panel.kind==='navigation'||panel.kind==='widget'&&panel.widget==='navigation'))throw new Error('Choose a Navigation instance');
      updateWorkspace(workspace=>({...workspace,dock:{...workspace.dock,panels:{...workspace.dock.panels,[panelId]:{...panel,navigation:{...config,filter:normalizeNavigation(config.filter)}}}}}));
    },
    dispatchDock(input: Command) {
      let resolved = input;
      if (input.type === "createWidget" || input.type === "setWidgetDefinition" || input.type === "setRootWidget") {
        try {
          const definition = widgetDefinitionAsset(store.active().assets, input.definitionId ?? `builtin:${input.widget}`);
          if (!definition) throw new Error("Widget definition not found");
          const recipe = parseWidgetRecipe(definition.files["widget.json"] ?? "");
          if (recipe.widget !== input.widget) throw new Error("Definition renderer does not match");
          const definitionSnapshot = { assetId: definition.id, revision: definition.revision, recipe };
          resolved = input.type === "createWidget" || input.type === "setRootWidget" ? { ...input, definitionId: definition.id, definitionSnapshot, defaults: { ...recipe.defaults, ...input.defaults }, slots: input.slots ?? recipe.slots, recipeKey: input.recipeKey ?? recipe.key, recipeTarget: input.recipeTarget ?? recipe.targetRef } : { ...input, definitionSnapshot, defaults: recipe.defaults };
        } catch (error) {
          return { ok: false as const, layout: store.active().dock, reason: String(error) };
        }
      }
      const command = resolved;
      let result: ReturnType<typeof reduceDock> | null = null;
      updateWorkspace((workspace) => {
        if (command.type === "createEditorPart") {
          const owner = workspace.dock.panels[command.ownerId];
          if (
            !owner ||
            !("assetId" in owner) ||
            owner.assetId !== command.assetId ||
            ![...builtinWidgetAssets(), ...builtinIconAssets(), ...availableDeskTemplates(workspace.assets).filter(asset => isBuiltinDeskTemplate(asset.id)), ...workspace.assets].some((asset) => asset.id === command.assetId)
          ) {
            result = {
              ok: false,
              layout: workspace.dock,
              reason: "Opened-asset binding unavailable",
            };
            return workspace;
          }
        }
        if (command.type === "configureNote" && command.sourceAssetId && !workspace.assets.some(asset => asset.id === command.sourceAssetId && ["markdown", "note"].includes(asset.kind))) {
          result = { ok: false, layout: workspace.dock, reason: "Choose a compatible note asset" }; return workspace;
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
          ![...builtinWidgetAssets(), ...builtinIconAssets(), ...availableDeskTemplates(workspace.assets).filter(asset => isBuiltinDeskTemplate(asset.id)), ...workspace.assets].some((asset) => asset.id === command.assetId)
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
          const selected = asset ? resolveEditor(workspace, asset).editorId : "station";
          const definitionId = selected === "station" ? undefined : selected;
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
        const shell = workspace.dock.rootId && workspace.dock.panels[workspace.dock.rootId];
        if (result.ok && result.panelId && shell && shell.kind === "widget" && shell.widget === "desktop-shell" && ["createWidget", "createWebWidget", "createContribution"].includes(command.type) && "target" in command && command.target?.surface === "dashboard" && !command.target.ownerId) {
          const panelId = result.panelId;
          const offset = Object.keys(result.layout.floating).length * 28 % 180;
          const floated = reduceDock(result.layout, {type:"float",panelId,x:80 + offset,y:100 + offset}, policy);
          if (floated.ok) result = { ...floated, panelId };
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
            command.type === "resizeRow" ? command.cellId : command.type === "resizeSplit"
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
    setAssetGroups(groups: AssetGroup[]) {
      updateWorkspace(workspace => ({ ...workspace, assetGroups: normalizeAssetGroups(groups, workspace.assets.map(asset => asset.id)) }));
    },
    moveAssetGroupMembers(ids: string[], groupId: string | null) {
      updateWorkspace(workspace => ({ ...workspace, assetGroups: moveAssetGroupMembers(workspace.assetGroups ?? [], workspace.assets.map(a => a.id), ids, groupId) }));
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
    patchAssetMetadata(id: string, value: unknown) {
      assertSourceAccess(id);
      if (isBuiltinWidgetAsset(id) || !state.workspaces.find(workspace => workspace.id === state.activeWorkspaceId)?.assets.some(asset => asset.id === id)) throw new Error("Asset is read-only or unavailable.");
      const patch = parseAssetMetadataPatch(value);
      updateAsset(id, asset => ({ ...asset, ...patch,metadataRevision:(asset.metadataRevision??0)+1 }));
    },
    renameAsset(id: string, name: string) {
      assertSourceAccess(id);
      const patch = parseAssetMetadataPatch({ name });
      updateAsset(id, asset => ({ ...asset, ...patch }));
    },
    describeAsset(id: string, description: string) {
      assertSourceAccess(id);
      const patch = parseAssetMetadataPatch({ description });
      updateAsset(id, asset => ({ ...asset, ...patch }));
    },
    /** One revision and persistence commit for a validated virtual-project patch. */
    patchFiles(id: string, expectedRevision: number, patch: Record<string, string | null>) {
      assertSourceAccess(id);
      const current = store.active().assets.find(asset => asset.id === id);
      if (!current || current.revision !== expectedRevision) throw new Error("Stale asset revision");
      if (Object.keys(patch).some(path => !validSourcePath(path))) throw new Error("Invalid source path");
      const files = { ...assetFiles(current) };
      for (const [path, content] of Object.entries(patch)) {
        if (content === null) delete files[path]; else files[path] = content;
      }
      if (new TextEncoder().encode(JSON.stringify(files)).byteLength > 1024 * 1024) throw new Error("Project exceeds 1 MiB");
      updateAsset(id, asset => ({ ...asset, files, revision: asset.revision + 1,
        ...(asset.kind === "component" ? { artifact: null } : {}),
        ...(asset.kind === "web-content" ? { html: files["index.html"] ?? "" } : {}),
      }));
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
    /** Trusted settings edit. External tasks cannot acquire native authority by
     * importing source or changing an asset; registration belongs to the root. */
    configureShortcuts(settings: ShortcutSettings) {
      updateWorkspace(workspace => ({ ...workspace, shortcuts: shortcutSettingsSchema.parse(settings) }));
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

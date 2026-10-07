import { greetingSource } from "./generated/greeting";
import { HOST_CLOCK, HOST_FEED, HOST_LOG, HOST_SURFACE } from "./component-contract";
export { HOST_CLOCK, HOST_FEED, HOST_LOG, HOST_SURFACE } from "./component-contract";
import { DEFAULT_DOCK_POLICY, createDockLayout, migrateDock, reduceDock, type Command, type DockLayout, type DockPolicy } from "./docking/core";
import type { BuiltArtifact, BuildSource } from "./build-contract";
import { type WidgetId } from "./panel-layout";
export type { WidgetId } from "./panel-layout";

export type ComponentUnit = {
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
export type WebContentUnit = {
  kind: "web-content";
  id: string;
  instanceId: string;
  name: string;
  description: string;
  html: string;
  revision: number;
};
export type Unit = ComponentUnit | WebContentUnit;

export type Workspace = {
  id: string;
  name: string;
  description: string;
  selectedUnitId: string | null;
  units: Unit[];
  dock: DockLayout;
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

export function hasCurrentArtifact(unit: ComponentUnit): boolean {
  return unit.artifact?.schemaVersion === 2 && unit.artifact.profile === "component-model-0.3" &&
    unit.artifact.id === unit.id && unit.artifact.revision === unit.revision;
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

function sample(): ComponentUnit {
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
  const unit = sample();
  return { id, name, description, selectedUnitId: unit.id, units: [unit], dock: createDockLayout() };
}

function initialState(storage: KeyValueStorage, policy: DockPolicy = DEFAULT_DOCK_POLICY): State {
  const prior = read(storage, STORAGE);
  if (
    prior &&
    Array.isArray(prior.workspaces) &&
    prior.workspaces.length &&
    prior.workspaces.every(
      (workspace: any) =>
        typeof workspace.id === "string" && Array.isArray(workspace.units),
    )
  ) {
    return {
      ...prior,
      app: { ...appDefaults, ...prior.app, theme: ["light", "dark", "system"].includes(prior.app?.theme) ? prior.app.theme : "dark" },
      workspaces: prior.workspaces.map((workspace: any): Workspace => {
        const { widgets, layout, dock, ...rest } = workspace;
        return { ...rest, units: workspace.units.map((unit: Unit) => ({ ...unit, kind: unit.kind === "web-content" ? "web-content" : "component", instanceId: unit.instanceId || crypto.randomUUID() })), dock: migrateDock(dock ?? layout, Array.isArray(widgets) ? widgets : DEFAULT_WIDGETS, policy) };
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
      : [newWorkspace("default", "My Workspace", "Local unit workspace")];
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
      if ((panel.kind === "unit" || panel.kind === "web-widget") && !workspace.units.some((unit) => unit.id === panel.unitId)) delete copy.panels[id];
    return migrateDock(copy, DEFAULT_WIDGETS, policy);
  };
  const listeners = new Set<() => void>();
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
  function updateUnit(
    id: string,
    change: (unit: Unit) => Unit,
  ) {
    updateWorkspace((workspace) => ({
      ...workspace,
      units: workspace.units.map((unit) =>
        unit.id === id ? change(unit) : unit,
      ),
    }));
  }

  const store = {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    active: () =>
      state.workspaces.find((item) => item.id === state.activeWorkspaceId)!,
    selected: () =>
      store
        .active()
        .units.find((unit) => unit.id === store.active().selectedUnitId) ||
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
    dispatchDock(command: Command) {
      let result: ReturnType<typeof reduceDock> | null = null;
      updateWorkspace((workspace) => {
        if (command.type === "createWebWidget" && !workspace.units.some((unit) => unit.id === command.unitId && unit.kind === "web-content")) {
          result = { ok: false, layout: workspace.dock, reason: "Web content unit not found" };
          return workspace;
        }
        result = reduceDock(workspace.dock, command, policy);
        if (result.ok && result.layout !== workspace.dock && !["activate", "browserView", "visibility", "moveFloat"].includes(command.type)) {
          const history = historyFor(workspace.id);
          const resizeKey = command.type === "resizeSplit" ? command.nodeId : command.type === "resizeBottom" ? "bottom" : null;
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
    selectUnit(id: string) {
      updateWorkspace((workspace) =>
        workspace.units.some((unit) => unit.id === id)
          ? { ...workspace, selectedUnitId: id }
          : workspace,
      );
    },
    createUnit(name: string) {
      const workspace = store.active();
      const base = slug(name);
      let id = base;
      let suffix = 2;
      while (workspace.units.some((unit) => unit.id === id))
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
      const unit: ComponentUnit = {
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
        units: [...current.units, unit],
        selectedUnitId: id,
      }));
      return id;
    },
    createWebUnit(name: string) {
      const workspace = store.active();
      const base = slug(name);
      let id = base, suffix = 2;
      while (workspace.units.some((unit) => unit.id === id)) id = `${base}-${suffix++}`;
      const unit: WebContentUnit = {
        kind: "web-content", id, instanceId: crypto.randomUUID(), name,
        description: "Local HTML widget", revision: 0,
        html: WEB_WIDGET_STARTER,
      };
      updateWorkspace((current) => ({ ...current, units: [...current.units, unit], selectedUnitId: id }));
      return id;
    },
    /** Remove source, grants, artifact metadata, and every open view in one persisted update. */
    deleteUnits(ids: string[]) {
      const requested = new Set(ids);
      const workspace = store.active();
      const removed = workspace.units.filter((unit) => requested.has(unit.id)).map((unit) => unit.id);
      if (!removed.length) return 0;
      const deleted = new Set(removed);
      layoutHistory.delete(workspace.id);
      updateWorkspace((current) => {
        let dock = current.dock;
        for (const panel of Object.values(dock.panels)) {
          if ((panel.kind === "unit" || panel.kind === "web-widget") && deleted.has(panel.unitId)) {
            const result = reduceDock(dock, { type: "close", panelId: panel.id });
            if (result.ok) dock = result.layout;
          }
        }
        const units = current.units.filter((unit) => !deleted.has(unit.id));
        return { ...current, units, dock, selectedUnitId: units.some((unit) => unit.id === current.selectedUnitId) ? current.selectedUnitId : units[0]?.id ?? null };
      });
      return removed.length;
    },
    renameUnit(id: string, name: string) {
      updateUnit(id, (unit) => ({ ...unit, name }));
    },
    describeUnit(id: string, description: string) {
      updateUnit(id, (unit) => ({ ...unit, description }));
    },
    editFile(id: string, path: string, content: string) {
      updateUnit(id, (unit) => unit.kind === "component" ? ({
        ...unit,
        files: { ...unit.files, [path]: content },
        revision: unit.revision + 1,
      }) : unit);
    },
    editWebHtml(id: string, html: string) {
      updateUnit(id, (unit) => unit.kind === "web-content" ? { ...unit, html, revision: unit.revision + 1 } : unit);
    },
    installArtifact(workspaceId: string, source: BuildSource, artifact: BuiltArtifact, instanceId: string): boolean {
      const workspace = state.workspaces.find((item) => item.id === workspaceId);
      const unit = workspace?.units.find((item) => item.id === source.id);
      if (!unit || unit.kind !== "component" || unit.instanceId !== instanceId || unit.revision !== source.revision ||
          JSON.stringify(unit.files) !== JSON.stringify(source.files)) return false;
      publish({ ...state, workspaces: state.workspaces.map((item) =>
        item.id === workspaceId ? { ...item, units: item.units.map((candidate) =>
          candidate.id === source.id && candidate.kind === "component" ? { ...candidate, artifact } : candidate,
        ) } : item,
      ) });
      return true;
    },
    setGrant(id: string, capability: string, granted: boolean) {
      updateUnit(id, (unit) => unit.kind === "component" ? ({
        ...unit,
        grants: { ...unit.grants, [capability]: granted },
      }) : unit);
    },
    resetSample(id: string) {
      if (id !== "greeting") return;
      updateUnit(id, (unit) => unit.kind === "component" ? { ...sample(), grants: unit.grants } : unit);
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

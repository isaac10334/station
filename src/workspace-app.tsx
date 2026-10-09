import type { CSSProperties } from "react";
import { IconAction } from "@/components/ui/icon-action";
import { revealPresentation } from "./docking/presentations";
import { widgetDefinitions, definitionForPanel } from "./widget-catalog";
import { WidgetBrowser } from "./widget-browser";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Command,
  Folder,
  LayoutGrid,
  ListTree,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTopClose,
  PanelTopOpen,
  Plus,
  Settings2,
  Undo2,
  Redo2,
} from "lucide-react";
import { demoSession, deps } from "./composition";
import { Dashboard, DockWebWidget, DockWidget } from "./dashboard";
import { ComponentView } from "./component-view";
import { WebContentView } from "./web-content-view";
import {
  DockBottomEdge,
  DockFloatingPanels,
  DockHost,
  DockMainTabs,
  DockMobileSurface,
  DockSurface,
  useDockController,
} from "./docking/react";
import {
  BROWSER_ID,
  HOME_ID,
  panelSlot,
  panelSurface,
  surfacePanels,
  visitNode,
  type Command as DockCommand,
  type DockLayout,
  type Panel as DockPanel,
  type Result,
} from "./docking/core";
import { AssetBrowser } from "./asset-browser";
import { type WidgetActions } from "./widget-views";
import { Onboarding, type DemoIdentity } from "./onboarding";
import { WorkspaceSwitcher } from "@/components/ui/workspace-switcher";
import {
  Panel,
  PanelGroup,
  PanelHandle,
} from "@/components/ui/resizable-panels";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type CommandGroup } from "@/components/ui/command-palette";
import { WorkspacePalette } from "@/components/workspace/workspace-palette";
import { SideDockResize } from "@/components/workspace/side-dock-resize";
import { WorkspaceNavigation } from "@/components/workspace/workspace-navigation";
import { MainSurfaceToolbar } from "@/components/workspace/main-surface-toolbar";
import {
  workspaceSearchItems,
  type WorkspaceSearchItem,
} from "./workspace-search";
import { NotificationInbox } from "@/components/ui/notification-inbox";
import { UserMenu, UserMenuItem } from "@/components/ui/user-menu";
import { ThemeToggle, changeTheme } from "@/components/ui/theme-toggle";
import { ShortcutsSheet } from "@/components/ui/shortcuts-sheet";
import type { State, Workspace } from "./model";

const { store } = deps;
function activeMainPanel(layout: DockLayout): string {
  let active = HOME_ID;
  visitNode(layout.surfaces.main, (node) => {
    if (node.kind === "stack" && active === HOME_ID) active = node.active;
  });
  return active;
}
function useStore(): State {
  const [state, setState] = useState(store.get());
  useEffect(() => {
    const unsubscribe = store.subscribe(() => setState(store.get()));
    return () => {
      unsubscribe();
    };
  }, []);
  return state;
}

function WidgetCatalog() {
  const { openCatalog } = useDockController();
  return (
    <IconAction
      label="Add widgets"
      onClick={() => openCatalog({ surface: "dashboard", intent: "append" })}
    >
      <span className="flex items-center">
        <LayoutGrid size={17} />
        <Plus size={10} />
      </span>
    </IconAction>
  );
}

type Overlay =
  | null
  | { kind: "create"; target: "component" | "web-content" | "workspace" }
  | { kind: "rename"; assetId: string }
  | { kind: "restore"; assetId: string }
  | { kind: "delete"; assetIds: string[]; workspaceId: string }
  | { kind: "settings" };
/** Transient dialog host. Neither dialog visibility nor input drafts enter the layout document. */
function OverlayHost({
  overlay,
  setOverlay,
  workspace,
  state,
  onContinue,
}: {
  overlay: Overlay;
  setOverlay: (next: Overlay) => void;
  workspace: Workspace;
  state: State;
  onContinue?: (identity: DemoIdentity) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (overlay?.kind === "rename")
      setName(
        workspace.assets.find((asset) => asset.id === overlay.assetId)?.name ??
          "",
      );
    else setName("");
  }, [overlay?.kind, overlay?.kind === "rename" ? overlay.assetId : ""]);
  const [settingsTab, setSettingsTab] = useState<"workspace" | "app">(
    "workspace",
  );
  const close = () => setOverlay(null);
  return (
    <>
      <Dialog
        open={Boolean(overlay)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        {overlay && (
          <DialogContent
            size={overlay.kind === "settings" ? "lg" : "sm"}
            className="workspace-dialog"
          >
            {overlay.kind === "create" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = name.trim();
                  if (!value) return;
                  if (overlay.target === "workspace")
                    store.createWorkspace(value);
                  else {
                    const id =
                      overlay.target === "web-content"
                        ? store.createWebAsset(value)
                        : store.createAsset(value);
                    store.dispatchDock({ type: "openAsset", assetId: id });
                  }
                  close();
                }}
              >
                <DialogHeader>
                  <DialogTitle>
                    New{" "}
                    {overlay.target === "component"
                      ? "Component"
                      : overlay.target === "web-content"
                        ? "web content"
                        : "workspace"}
                  </DialogTitle>
                  <DialogDescription>
                    {overlay.target === "component"
                      ? "Start with a Rust and WIT source project."
                      : overlay.target === "web-content"
                        ? "Create a local HTML widget in an isolated iframe."
                        : "Create a separate space for assets and widgets."}
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <label className="field-label" htmlFor="new-name">
                    Name
                  </label>
                  <input
                    id="new-name"
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                    placeholder={
                      overlay.target === "component"
                        ? "My Component"
                        : overlay.target === "web-content"
                          ? "My Widget"
                          : "My Workspace"
                    }
                  />
                </DialogBody>
                <DialogFooter>
                  <button type="button" className="secondary" onClick={close}>
                    Cancel
                  </button>
                  <button className="primary" type="submit">
                    Create
                  </button>
                </DialogFooter>
              </form>
            )}
            {overlay.kind === "rename" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim())
                    store.renameAsset(overlay.assetId, name.trim());
                  close();
                }}
              >
                <DialogHeader>
                  <DialogTitle>Rename asset</DialogTitle>
                  <DialogDescription>
                    Change its display name. Source and artifact identity stay
                    the same.
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <label className="field-label" htmlFor="rename-name">
                    Name
                  </label>
                  <input
                    id="rename-name"
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                </DialogBody>
                <DialogFooter>
                  <button type="button" className="secondary" onClick={close}>
                    Cancel
                  </button>
                  <button className="primary" type="submit">
                    Rename
                  </button>
                </DialogFooter>
              </form>
            )}
            {overlay.kind === "restore" && (
              <>
                <DialogHeader>
                  <DialogTitle>Restore Greeting sample?</DialogTitle>
                  <DialogDescription>
                    This replaces edited source with the bundled Rust and WIT
                    project. Build it again to run.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <button className="secondary" onClick={close}>
                    Cancel
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      store.resetSample(overlay.assetId);
                      close();
                    }}
                  >
                    Restore sample
                  </button>
                </DialogFooter>
              </>
            )}
            {overlay.kind === "delete" && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    Delete{" "}
                    {overlay.assetIds.length === 1
                      ? (workspace.assets.find(
                          (asset) => asset.id === overlay.assetIds[0],
                        )?.name ?? "asset")
                      : `${overlay.assetIds.length} assets`}
                    ?
                  </DialogTitle>
                  <DialogDescription>
                    This removes the selected assets and their open views from
                    this workspace. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <button className="secondary" autoFocus onClick={close}>
                    Cancel
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      if (store.active().id === overlay.workspaceId)
                        store.deleteAssets(overlay.assetIds);
                      close();
                    }}
                  >
                    Delete {overlay.assetIds.length === 1 ? "asset" : "assets"}
                  </button>
                </DialogFooter>
              </>
            )}
            {overlay.kind === "settings" && (
              <>
                <DialogHeader>
                  <DialogTitle>Settings</DialogTitle>
                  <DialogDescription>
                    Workspace preferences and app appearance.
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <div className="settings-layout">
                    <nav className="settings-sidebar">
                      <button
                        className={settingsTab === "workspace" ? "active" : ""}
                        onClick={() => setSettingsTab("workspace")}
                      >
                        <Folder size={15} /> Workspace
                      </button>
                      <button
                        className={settingsTab === "app" ? "active" : ""}
                        onClick={() => setSettingsTab("app")}
                      >
                        <Settings2 size={15} /> App
                      </button>
                    </nav>
                    <div className="settings-body">
                      {settingsTab === "workspace" ? (
                        <>
                          <h3>Current workspace</h3>
                          <label
                            className="field-label"
                            htmlFor="workspace-name"
                          >
                            Name
                          </label>
                          <input
                            id="workspace-name"
                            value={workspace.name}
                            onChange={(event) =>
                              store.renameWorkspace(event.currentTarget.value)
                            }
                          />
                          <label
                            className="field-label"
                            htmlFor="workspace-description"
                          >
                            Description
                          </label>
                          <textarea
                            id="workspace-description"
                            rows={3}
                            value={workspace.description}
                            onChange={(event) =>
                              store.describeWorkspace(event.currentTarget.value)
                            }
                          />
                          <div className="setting-row">
                            <span>Assets</span>
                            <strong>{workspace.assets.length}</strong>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3>Appearance</h3>
                          <div className="setting-row">
                            <label htmlFor="app-theme">Theme</label>
                            <select
                              id="app-theme"
                              value={state.app.theme}
                              onChange={(event) =>
                                changeTheme(
                                  event.currentTarget
                                    .value as State["app"]["theme"],
                                  (theme) => store.patchApp({ theme }),
                                  event.currentTarget,
                                )
                              }
                            >
                              <option value="dark">Dark</option>
                              <option value="light">Light</option>
                              <option value="system">System</option>
                            </select>
                          </div>
                          <div className="setting-row">
                            <label htmlFor="app-density">Density</label>
                            <select
                              id="app-density"
                              value={state.app.density}
                              onChange={(event) =>
                                store.patchApp({
                                  density: event.currentTarget
                                    .value as State["app"]["density"],
                                })
                              }
                            >
                              <option value="compact">Compact</option>
                              <option value="comfortable">Comfortable</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </DialogBody>
              </>
            )}
          </DialogContent>
        )}
      </Dialog>
      {onContinue && <Onboarding onContinue={onContinue} />}
    </>
  );
}

export function WorkspaceApp() {
  const state = useStore();
  const workspace = state.workspaces.find(
    (item) => item.id === state.activeWorkspaceId,
  )!;
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [bottomOpen, setBottomOpen] = useState(
    () => !workspace.dock.hidden.bottom,
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");

  const [, setNavRevision] = useState(0);
  const navigation = useRef(
    new Map<string, { back: string[]; current: string; forward: string[] }>(),
  );
  const [runRequest, setRunRequest] = useState<{
    assetId: string;
    token: number;
  } | null>(null);
  const [identity, setIdentity] = useState<DemoIdentity | null>(() =>
    demoSession.get(),
  );
  const [selectedBrowserIds, setSelectedBrowserIds] = useState<string[]>([]);
  const [browserQuery, setBrowserQuery] = useState("");
  const [browserFilters, setBrowserFilters] = useState<string[]>([]);
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width: 720px)").matches,
  );
  const restoreFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const media = matchMedia("(max-width: 720px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const pref = state.app.theme;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        pref === "system" ? (media.matches ? "dark" : "light") : pref;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [state.app.theme]);
  useEffect(() => {
    setSelectedBrowserIds([]);
    setBrowserQuery("");
    setBrowserFilters([]);
    setBottomOpen(!workspace.dock.hidden.bottom);
  }, [workspace.id]);
  useEffect(() => {
    setSelectedBrowserIds((ids) =>
      ids.filter((id) => workspace.assets.some((asset) => asset.id === id)),
    );
  }, [workspace.assets]);
  useEffect(() => {
    if (!overlay) {
      const target = restoreFocus.current;
      if (target?.isConnected) target.focus();
      else
        document
          .querySelector<HTMLElement>(
            ".asset-browser [data-select-id], .asset-browser-search input, .asset-browser-new",
          )
          ?.focus();
    }
  }, [overlay]);
  function showOverlay(next: Overlay) {
    restoreFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setOverlay(next);
  }
  function command(next: DockCommand): Result {
    const result = store.dispatchDock(next);
    if (result.ok && (next.type === "activate" || next.type === "openAsset")) {
      const id =
        next.type === "activate"
          ? next.panelId
          : (result.panelId ?? `asset-view:${next.assetId}`);
      if (panelSurface(result.layout, id) === "main") {
        const history = navigation.current.get(workspace.id) ?? {
          back: [],
          current: activeMainPanel(workspace.dock),
          forward: [],
        };
        if (history.current !== id) {
          history.back.push(history.current);
          history.current = id;
          history.forward = [];
          navigation.current.set(workspace.id, history);
          setNavRevision((value) => value + 1);
        }
      }
    }
    if (result.ok && "target" in next) {
      if (next.target?.surface === "bottom") setBottomOpen(true);
      if (next.target?.surface === "sidebar" && narrow) setBottomOpen(true);
    }
    if (
      result.ok &&
      next.type === "visibility" &&
      next.surface === "sidebar" &&
      !next.hidden &&
      narrow
    )
      setBottomOpen(true);
    if (result.ok && next.type === "visibility" && next.surface === "bottom")
      setBottomOpen(!next.hidden);
    return result;
  }
  async function openInspector() {
    const existing = Object.values(workspace.dock.panels).find(
      (panel) =>
        panel.kind === "widget" && panel.widget === "docking-inspector",
    );
    const result = existing
      ? null
      : command({
          type: "createWidget",
          widget: "docking-inspector",
          target: { surface: "main", intent: "tab" },
        });
    const id = existing?.id ?? (result?.ok ? result.panelId : undefined);
    if (!id) return;
    await revealPanel(id);
    document
      .querySelector<HTMLElement>(
        `[data-presentation-owner="${CSS.escape(id)}"] .station-heading-handle`,
      )
      ?.focus({ preventScroll: true });
  }
  const nav = navigation.current.get(workspace.id) ?? {
    back: [],
    current: activeMainPanel(workspace.dock),
    forward: [],
  };
  function navigate(direction: "back" | "forward") {
    const history = navigation.current.get(workspace.id) ?? {
      back: [],
      current: activeMainPanel(workspace.dock),
      forward: [],
    };
    const source = direction === "back" ? history.back : history.forward;
    const destination = direction === "back" ? history.forward : history.back;
    while (source.length) {
      const id = source.pop()!;
      if (panelSurface(store.active().dock, id) !== "main") continue;
      destination.push(history.current);
      history.current = id;
      navigation.current.set(workspace.id, history);
      store.dispatchDock({ type: "activate", panelId: id });
      setNavRevision((value) => value + 1);
      break;
    }
  }
  const browserSurface = panelSurface(workspace.dock, BROWSER_ID);
  function toggleBrowser() {
    if (
      browserSurface === "bottom" ||
      (browserSurface === "sidebar" && narrow)
    ) {
      command({ type: "activate", panelId: BROWSER_ID });
      setBottomOpen((value) => !value);
      command({
        type: "visibility",
        surface: browserSurface === "sidebar" ? "sidebar" : "bottom",
        hidden: bottomOpen,
      });
    } else void openBrowser();
  }
  async function openBrowser() {
    await revealPanel(BROWSER_ID);
  }
  function requestDelete(ids: string[]) {
    const valid = [...new Set(ids)].filter((id) =>
      workspace.assets.some((asset) => asset.id === id),
    );
    if (valid.length)
      showOverlay({
        kind: "delete",
        assetIds: valid,
        workspaceId: workspace.id,
      });
  }
  const searchItems = workspaceSearchItems(workspace);
  function openPalette(query = "") {
    setPaletteQuery(query);
    setPaletteOpen(true);
  }
  async function openSearchItem(item: WorkspaceSearchItem) {
    if (item.assetId) {
      const result = command({ type: "openAsset", assetId: item.assetId });
      if (result.ok)
        await revealPanel(result.panelId ?? `asset-view:${item.assetId}`);
    } else if (item.panelId) await revealPanel(item.panelId);
  }
  async function revealPanel(id: string) {
    const layout = store.active().dock;
    const surface = panelSurface(layout, id);
    if (surface) command({ type: "visibility", surface, hidden: false });
    if (surface === "dashboard") {
      command({ type: "visibility", surface: "main", hidden: false });
      command({ type: "activate", panelId: HOME_ID });
    }
    if (layout.maximized && layout.maximized !== id)
      command({ type: "maximize", panelId: null });
    const owners: string[] = [];
    let owner = panelSlot(layout, id)?.target.ownerId;
    while (owner) {
      owners.unshift(owner);
      owner = panelSlot(layout, owner)?.target.ownerId;
    }
    owners.forEach((panelId) => command({ type: "activate", panelId }));
    command({ type: "activate", panelId: id });
    if (surface === "bottom" || (surface === "sidebar" && narrow))
      setBottomOpen(true);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await revealPresentation(id);
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "input,textarea,select,[contenteditable],.cm-editor,[role=dialog],[role=application],canvas",
        ) ||
        event.altKey
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? store.redoLayout() : store.undoLayout();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        store.redoLayout();
        return;
      }
      if (event.ctrlKey || event.metaKey) return;
      if (event.shiftKey && event.key.toLowerCase() === "w") {
        event.preventDefault();
        toggleBrowser();
      }
      if (event.shiftKey && event.key.toLowerCase() === "q") {
        event.preventDefault();
        command({
          type: "visibility",
          surface: "sidebar",
          hidden: !workspace.dock.hidden.sidebar,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    browserSurface,
    narrow,
    bottomOpen,
    workspace.id,
    workspace.dock.hidden.sidebar,
  ]);
  const actions: WidgetActions = {
    capabilities: deps,
    onOpenAsset: (id) => command({ type: "openAsset", assetId: id }),
    onOpenRun: (id) => {
      setRunRequest((previous) => ({
        assetId: id,
        token: (previous?.token ?? 0) + 1,
      }));
      command({ type: "openAsset", assetId: id });
    },
    onOpenBrowser: openBrowser,
    onNewAsset: () => showOverlay({ kind: "create", target: "component" }),
    onGrant: store.setGrant,
  };
  const activePanelId = activeMainPanel(workspace.dock);
  const activePanel = workspace.dock.panels[activePanelId];
  function renderPanel(panel: DockPanel) {
    if (panel.kind === "navigation")
      return (
        <WorkspaceNavigation
          key={workspace.id}
          workspaceId={workspace.id}
          items={searchItems}
          filter={workspace.navigation}
          onFilterChange={store.setNavigation}
          activePanelId={activePanelId}
          activeAssetId={
            activePanel?.kind === "asset" ? activePanel.assetId : undefined
          }
          onOpen={(item) => void openSearchItem(item)}
          onSearch={() => openPalette("search: ")}
          header={
            <>
              <span className="station-brand">Station</span>
              <WorkspaceSwitcher
                shortcut="alt"
                workspaces={state.workspaces.map((item) => ({
                  id: item.id,
                  name: item.name,
                  plan: "Local workspace",
                  detail: `${item.assets.length} assets`,
                }))}
                value={workspace.id}
                onValueChange={store.selectWorkspace}
                onCreate={(name) =>
                  name.trim()
                    ? store.createWorkspace(name.trim())
                    : showOverlay({ kind: "create", target: "workspace" })
                }
              />
            </>
          }
          footer={
            <button
              type="button"
              className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-left text-xs text-fg-3 hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-fg-3"
              onClick={() => showOverlay({ kind: "settings" })}
            >
              <Settings2 size={14} /> Settings
            </button>
          }
        />
      );
    if (panel.kind === "home") return <Dashboard workspace={workspace} />;
    if (panel.kind === "widget")
      return (
        <DockWidget panel={panel} workspace={workspace} actions={actions} />
      );
    if (panel.kind === "web-widget")
      return (
        <DockWebWidget
          panel={panel}
          workspace={workspace}
          onOpen={(id) => command({ type: "openAsset", assetId: id })}
        />
      );
    if (panel.kind === "asset") {
      const asset = workspace.assets.find((item) => item.id === panel.assetId);
      return asset?.kind === "web-content" ? (
        <WebContentView
          asset={asset}
          onAddWidget={() =>
            command({ type: "createWebWidget", assetId: asset.id })
          }
        />
      ) : asset?.kind === "component" ? (
        <ComponentView
          asset={asset}
          workspaceId={workspace.id}
          runRequest={
            runRequest?.assetId === asset.id ? runRequest.token : undefined
          }
          onRestore={(assetId) => showOverlay({ kind: "restore", assetId })}
        />
      ) : (
        <div className="dock-missing">Asset no longer exists.</div>
      );
    }
    return (
      <AssetBrowser
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        assets={workspace.assets}
        selected={selectedBrowserIds}
        onSelectedChange={setSelectedBrowserIds}
        onOpen={(id) => command({ type: "openAsset", assetId: id })}
        onNew={(kind) => showOverlay({ kind: "create", target: kind })}
        onRename={(assetId) => showOverlay({ kind: "rename", assetId })}
        onDelete={requestDelete}
        view={workspace.dock.browserView}
        onViewChange={(view) => command({ type: "browserView", view })}
        query={browserQuery}
        onQueryChange={setBrowserQuery}
        filters={browserFilters}
        onFiltersChange={setBrowserFilters}
        compact={browserSurface === "sidebar" || narrow}
      />
    );
  }
  const paletteActions: CommandGroup[] = [
    {
      heading: "Navigate",
      items: [
        {
          id: "overview",
          label: "Open overview",
          icon: <LayoutGrid size={16} />,
          onSelect: () => revealPanel(HOME_ID),
        },
        {
          id: "browser",
          label: "Toggle asset browser",
          icon: <Box size={16} />,
          shortcut: "shift+w",
          onSelect: toggleBrowser,
        },
        {
          id: "settings",
          label: "Open settings",
          icon: <Settings2 size={16} />,
          onSelect: () => showOverlay({ kind: "settings" }),
        },
        {
          id: "inspector",
          label: "Open docking inspector",
          icon: <LayoutGrid size={16} />,
          onSelect: openInspector,
        },
        {
          id: "sidebar-side",
          label: `Move sidebar ${workspace.dock.sidebarSide === "left" ? "right" : "left"}`,
          icon: <PanelLeftOpen size={16} />,
          onSelect: () =>
            command({
              type: "sidebarSide",
              side: workspace.dock.sidebarSide === "left" ? "right" : "left",
            }),
        },
        {
          id: "sidebar-visibility",
          label: workspace.dock.hidden.sidebar
            ? "Show sidebar"
            : "Hide sidebar",
          icon: <PanelLeftOpen size={16} />,
          onSelect: () =>
            command({
              type: "visibility",
              surface: "sidebar",
              hidden: !workspace.dock.hidden.sidebar,
            }),
        },
        {
          id: "main-visibility",
          label: workspace.dock.hidden.main
            ? "Show main surface"
            : "Hide main surface",
          icon: <PanelTopOpen size={16} />,
          onSelect: () =>
            command({
              type: "visibility",
              surface: "main",
              hidden: !workspace.dock.hidden.main,
            }),
        },
        {
          id: "layout-back",
          label: "Undo layout",
          icon: <Undo2 size={16} />,
          onSelect: () => store.undoLayout(),
        },
        {
          id: "layout-forward",
          label: "Redo layout",
          icon: <Redo2 size={16} />,
          onSelect: () => store.redoLayout(),
        },
        {
          id: "panel-back",
          label: "Back to previous panel",
          icon: <ArrowLeft size={16} />,
          onSelect: () => navigate("back"),
        },
        {
          id: "panel-forward",
          label: "Forward to next panel",
          icon: <ArrowRight size={16} />,
          onSelect: () => navigate("forward"),
        },
      ],
    },
    {
      heading: "Create",
      items: [
        {
          id: "new-web-asset",
          label: "New web content",
          icon: <Plus size={16} />,
          onSelect: () =>
            showOverlay({ kind: "create", target: "web-content" }),
        },
        {
          id: "new-asset",
          label: "New Component",
          icon: <Plus size={16} />,
          onSelect: () => showOverlay({ kind: "create", target: "component" }),
        },
        {
          id: "new-workspace",
          label: "New workspace",
          icon: <Folder size={16} />,
          onSelect: () => showOverlay({ kind: "create", target: "workspace" }),
        },
      ],
    },
  ];
  const sidebarHasPanels = surfacePanels(workspace.dock, "sidebar").length > 0;
  const bottomHasPanels =
    !workspace.dock.hidden.bottom ||
    (narrow && !workspace.dock.hidden.sidebar && sidebarHasPanels);
  useEffect(() => {
    if (narrow && sidebarHasPanels) setBottomOpen(true);
  }, [narrow, sidebarHasPanels]);
  return (
    <DockHost
      key={workspace.id}
      layout={workspace.dock}
      onCommand={command}
      renderPanel={renderPanel}
      panelTitle={(panel) =>
        definitionForPanel(panel, widgetDefinitions(workspace.assets))?.title ??
        panel.id
      }
      debugDropZones={new URLSearchParams(location.search).has(
        "debugDropZones",
      )}
      debugLayout={new URLSearchParams(location.search).has("debugLayout")}
    >
      <WidgetBrowser workspace={workspace} onReveal={revealPanel} />
      <div
        className={`app density-${state.app.density} ${sidebarHasPanels ? "has-sidebar-dock" : ""}`}
        style={{ "--dock-sidebar-width": `clamp(220px, ${workspace.dock.sidebarWidth}px, 55vw)` } as CSSProperties}
        data-sidebar-side={workspace.dock.sidebarSide}
        data-sidebar-hidden={workspace.dock.hidden.sidebar || undefined}
      >
        <WorkspacePalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          query={paletteQuery}
          onQueryChange={setPaletteQuery}
          items={searchItems}
          onOpen={(item) => {
            void openSearchItem(item);
          }}
          actions={paletteActions}
        />
        <main className="shell">
          <div className="work-area">
            {!workspace.dock.hidden.sidebar && (
              <>
                <DockSurface surface="sidebar" className="app-sidebar-dock" />
                <SideDockResize width={workspace.dock.sidebarWidth} side={workspace.dock.sidebarSide} onResize={width => command({ type: "resizeSidebar", width })} />
              </>
            )}
            <PanelGroup
              key={workspace.id}
              direction="vertical"
              className="dock-workspace"
              onLayout={(sizes) => {
                if (sizes[1] > 0)
                  command({ type: "resizeBottom", size: sizes[1] });
              }}
            >
              <Panel
                id="workspace-main"
                defaultSize={
                  bottomOpen && bottomHasPanels
                    ? 100 - workspace.dock.bottomSize
                    : 100
                }
                minSize={40}
              >
                <section className="content">
                  <div className="dock-shell-top">
                    <DockMainTabs />
                  </div>
                  <MainSurfaceToolbar
                    onSearch={() => openPalette("search: ")}
                    history={[
                      {
                        id: "back",
                        label: "Back",
                        secondary: true,
                        icon: <ArrowLeft size={16} />,
                        disabled: !nav.back.some(
                          (id) => panelSurface(workspace.dock, id) === "main",
                        ),
                        onClick: () => navigate("back"),
                      },
                      {
                        id: "forward",
                        label: "Forward",
                        secondary: true,
                        icon: <ArrowRight size={16} />,
                        disabled: !nav.forward.some(
                          (id) => panelSurface(workspace.dock, id) === "main",
                        ),
                        onClick: () => navigate("forward"),
                      },
                    ]}
                    actions={[
                      {
                        id: "sidebar",
                        label: `${workspace.dock.hidden.sidebar ? "Show" : "Hide"} sidebar (Shift+Q)`,
                        icon: workspace.dock.hidden.sidebar ? (
                          <PanelLeftOpen size={16} />
                        ) : (
                          <PanelLeftClose size={16} />
                        ),
                        onClick: () =>
                          command({
                            type: "visibility",
                            surface: "sidebar",
                            hidden: !workspace.dock.hidden.sidebar,
                          }),
                      },
                      {
                        id: "undo",
                        label: "Undo layout",
                        secondary: true,
                        icon: <Undo2 size={16} />,
                        disabled: !store.layoutHistory().canUndo,
                        onClick: () => {
                          store.undoLayout();
                        },
                      },
                      {
                        id: "redo",
                        label: "Redo layout",
                        secondary: true,
                        icon: <Redo2 size={16} />,
                        disabled: !store.layoutHistory().canRedo,
                        onClick: () => {
                          store.redoLayout();
                        },
                      },
                      {
                        id: "main",
                        label: `${workspace.dock.hidden.main ? "Show" : "Hide"} main surface`,
                        secondary: true,
                        icon: workspace.dock.hidden.main ? (
                          <PanelTopOpen size={16} />
                        ) : (
                          <PanelTopClose size={16} />
                        ),
                        onClick: () =>
                          command({
                            type: "visibility",
                            surface: "main",
                            hidden: !workspace.dock.hidden.main,
                          }),
                      },
                      {
                        id: "bottom",
                        label: `${bottomOpen && !workspace.dock.hidden.bottom ? "Hide" : "Show"} bottom dock`,
                        icon:
                          bottomOpen && !workspace.dock.hidden.bottom ? (
                            <PanelBottomClose size={16} />
                          ) : (
                            <PanelBottomOpen size={16} />
                          ),
                        onClick: () =>
                          command({
                            type: "visibility",
                            surface: "bottom",
                            hidden: bottomOpen && !workspace.dock.hidden.bottom,
                          }),
                      },
                      {
                        id: "browser",
                        label: "Toggle asset browser (Shift+W)",
                        icon: <Box size={16} />,
                        onClick: toggleBrowser,
                      },
                      {
                        id: "palette",
                        label: "Command palette (Ctrl+K)",
                        icon: <Command size={16} />,
                        onClick: () => openPalette(),
                      },
                      {
                        id: "inspector",
                        label: "Open docking inspector",
                        icon: <ListTree size={16} />,
                        onClick: () => {
                          void openInspector();
                        },
                      },
                    ]}
                  >
                    <NotificationInbox defaultItems={[]} />
                    <WidgetCatalog />
                    <ThemeToggle
                      theme={state.app.theme}
                      onThemeChange={(theme) => store.patchApp({ theme })}
                    />
                    <UserMenu
                      user={{
                        name:
                          identity?.kind === "demo"
                            ? identity.email?.split("@")[0] || "Demo"
                            : "Guest",
                        email: identity?.email || "Local guest",
                      }}
                      onSignOut={() => {
                        demoSession.set(null);
                        setIdentity(null);
                      }}
                    >
                      <UserMenuItem
                        icon={<Settings2 size={15} />}
                        onClick={() => showOverlay({ kind: "settings" })}
                      >
                        Settings
                      </UserMenuItem>
                      <UserMenuItem
                        icon={<Command size={15} />}
                        onClick={() => openPalette()}
                      >
                        Command palette
                      </UserMenuItem>
                      <UserMenuItem
                        icon={<Command size={15} />}
                        onClick={() => setShortcutsOpen(true)}
                      >
                        Keyboard shortcuts
                      </UserMenuItem>
                    </UserMenu>
                  </MainSurfaceToolbar>
                  <div className="page">
                    {workspace.dock.hidden.main ? (
                      <div className="dock-hidden-message">
                        <span>Main surface hidden</span>
                        <button
                          onClick={() =>
                            command({
                              type: "visibility",
                              surface: "main",
                              hidden: false,
                            })
                          }
                        >
                          Show main
                        </button>
                      </div>
                    ) : (
                      <DockSurface surface="main" />
                    )}
                  </div>
                </section>
              </Panel>
              <PanelHandle
                aria-label="Resize bottom dock"
                className="dock-resize-handle"
                grip
              />
              <Panel
                id="workspace-bottom"
                defaultSize={workspace.dock.bottomSize}
                minSize={24}
                maxSize={60}
                collapsible
                collapsed={!bottomOpen || !bottomHasPanels}
                onCollapsedChange={(collapsed) => setBottomOpen(!collapsed)}
              >
                {narrow ? (
                  <DockMobileSurface />
                ) : (
                  <DockSurface surface="bottom" />
                )}
              </Panel>
            </PanelGroup>
          </div>
        </main>
        <DockBottomEdge />
        <DockFloatingPanels />
        <ShortcutsSheet
          open={shortcutsOpen}
          onOpenChange={setShortcutsOpen}
          groups={[
            {
              heading: "Workspace",
              shortcuts: [
                { keys: "mod+k", label: "Open command palette" },
                { keys: "shift+w", label: "Toggle asset browser" },
              ],
            },
            {
              heading: "Asset browser",
              shortcuts: [
                { keys: "mod+a", label: "Select visible assets" },
                { keys: "delete", label: "Delete selected assets" },
                { keys: "shift+f10", label: "Open context menu" },
              ],
            },
          ]}
        />
        <OverlayHost
          overlay={overlay}
          setOverlay={setOverlay}
          workspace={workspace}
          state={state}
          onContinue={
            !identity
              ? (value) => {
                  demoSession.set(value);
                  setIdentity(value);
                }
              : undefined
          }
        />
      </div>
    </DockHost>
  );
}

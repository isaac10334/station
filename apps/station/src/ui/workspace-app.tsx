import { DeskScene } from "./components/workspace/desk-scene";
import { builtinIconAssets } from "../core/builtin-icons";
import { shellCommandGroups } from "./components/workspace/shell-command-groups";
import { shellActions, createActionRouter, navigationAvailable } from '../features/shell/application/actions';
import { shellActionImplementations } from '../features/shell/application/action-controller';
import { actionState, matchesActionShortcut } from '@loop-kit/ui';
import { SemanticThemeProvider } from './semantic-theme';
import { createPaletteController } from '../features/shell/application/palette';
import { SemanticActionButton, SemanticActionMenuItem } from './components/ui/semantic-action';
import { resolveSlotReference } from "../core/docking";
import { WidgetFrame } from "./components/workspace/widget-frame";
import {
  builtinDeskTemplates,
  isBuiltinDeskTemplate,
} from "../core/desk-templates";
import { AppShellWidget } from "./components/workspace/app-shell-widget";
import {
  builtinWidgetAssets,
  isBuiltinWidgetAsset,
} from "../core/widget-definitions";
import { IconAction } from "./components/ui/icon-action";
import { revealPresentation } from "./docking/presentations";
import { widgetDefinitions, definitionForPanel } from "./widget-catalog";
import { WidgetBrowser } from "./widget-browser";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import type { ShellPorts, ShellWorkspacePort } from "../features/shell/application/ports";
import type { Overlay } from "../features/shell/application/overlays";
import { OverlayHost } from "./components/workspace/shell-overlays";
import { createNavigationHistory } from "../features/navigation/application/history";
import { Dashboard, DockWebWidget, DockWidget } from "./dashboard";
import { CommandOutput } from "./components/workspace/command-output";
import { installedDefinitions } from "../core/contribution-catalog";
import { AssetEditor } from "./components/workspace/asset-editor";
import { ContributionView } from "./contribution-view";
import { ThemeAssets } from "./theme-runtime";
import { EditorPart } from "./components/workspace/editor-workspace";
import { RichTextAssetsContext } from "./components/ui/rich-text-editor";
import { DockHost, useDockController } from "./docking/react";
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
} from "../core/docking";
import { AssetBrowser } from "./asset-browser";
import { type WidgetActions } from "./widget-views";
import { Onboarding, type DemoIdentity } from "./onboarding";
import { WorkspaceSwitcher } from "./components/ui/workspace-switcher";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { WorkspacePalette } from "./components/workspace/workspace-palette";
import { WorkspaceNavigation } from "./components/workspace/workspace-navigation";

import { MainSurfaceToolbar, BuiltinToolbarTool } from "./components/workspace/main-surface-toolbar";
import {
  workspaceSearchItems,
  type WorkspaceSearchItem,
} from "./workspace-search";
import { NotificationInbox } from "./components/ui/notification-inbox";
import { UserMenu, UserMenuItem } from "./components/ui/user-menu";
import { AccountSettings } from "./components/workspace/account-settings";
import { Button } from "./components/ui/button";
import { accountClient } from "../services/account-client";
import { useAccount } from "./lib/use-account";
import { ThemeToggle, changeTheme } from "./components/ui/theme-toggle";
import { ShortcutHost } from "./components/workspace/shortcut-host";
import { ShortcutSettings } from "./components/workspace/shortcut-settings";
import { DEFAULT_SHORTCUTS } from "../core/shortcuts";
import type { State, Workspace } from "../core/workspace-state";

function activeMainPanel(layout: DockLayout): string {
  let active = HOME_ID;
  visitNode(layout.surfaces.main, (node) => {
    if (node.kind === "stack" && active === HOME_ID) active = node.active;
  });
  return active;
}
function useStore(store: Pick<ShellWorkspacePort, "get" | "subscribe">): State {
  // Child effects can initialize owned layouts before the shell's first subscription.
  return useSyncExternalStore(store.subscribe, store.get, store.get);
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

export function WorkspaceApp({ ports }: { ports: ShellPorts }) {
  const { workspace: store, commands: control, capabilities, session: demoSession } = ports;
  const commandOwner = (method: string, params: unknown) => control.execute({ method, params, version: control.version() });
  const state = useStore(store);
  const workspace = state.workspaces.find(
    (item) => item.id === state.activeWorkspaceId,
  )!;
  const definitions = useMemo(
    () => widgetDefinitions(workspace.assets, workspace),
    [workspace],
  );
  const browsableAssets = useMemo(
    () => [
      ...workspace.assets,
      ...builtinWidgetAssets(), ...builtinIconAssets(),
      ...builtinDeskTemplates(),
    ],
    [workspace.assets],
  );
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [bottomOpen, setBottomOpen] = useState(
    () => !workspace.dock.hidden.bottom,
  );
  const palette = useMemo(()=>createPaletteController(),[]);
  const {open:paletteOpen,query:paletteQuery}=useSyncExternalStore(palette.subscribe,palette.getSnapshot,palette.getSnapshot);
  useEffect(()=>()=>palette.dispose(),[palette]);
  const setPaletteOpen=(open:boolean)=>palette.dispatch({type:open?'open':'close'});
  const setPaletteQuery=(query:string)=>palette.dispatch({type:'query',query});
  const openShortcuts = () => setOverlay({ kind: "settings", section: "shortcuts" });

  const [, setNavRevision] = useState(0);
  const navigation = useMemo(() => createNavigationHistory(), []);
  useEffect(() => () => navigation.dispose(), [navigation]);
  const [runRequest, setRunRequest] = useState<{
    assetId: string;
    token: number;
  } | null>(null);
  const [identity, setIdentity] = useState<DemoIdentity | null>(() =>
    demoSession.get(),
  );
  const cloudAccount = useAccount();
  const [accountOpen, setAccountOpen] = useState(false);
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
    const selectedThemeId = store.desk().themeId ?? workspace.themeId;
    if (
      workspace.assets.some(
        (asset) => asset.id === selectedThemeId && asset.kind === "theme",
      )
    )
      return;
    const pref = state.app.theme;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        pref === "system" ? (media.matches ? "dark" : "light") : pref;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [
    state.app.theme,
    workspace.activeDeskId,
    workspace.themeId,
    store.desk().themeId,
  ]);
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
        navigation.record(workspace.id, activeMainPanel(workspace.dock), id);
        setNavRevision(value => value + 1);
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
  const nav = navigation.get(workspace.id, activeMainPanel(workspace.dock));
  function navigate(direction: "back" | "forward") {
    const id = navigation.move(workspace.id, activeMainPanel(workspace.dock), direction,
      id => panelSurface(store.active().dock, id) === "main");
    if (id) { store.dispatchDock({ type: "activate", panelId: id }); setNavRevision(value => value + 1); }
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
  const actions: WidgetActions = {
    onCaptureRecord: (assetId, revision, text) => { commandOwner('capture.create', { assetId, expectedAssetRevision: revision, text }); },
    onConfigureCapture: (assetId, revision, configuration) => { commandOwner('capture.configure', { assetId, expectedAssetRevision: revision, configuration }); },
    capabilities,
    onCreateDataAsset: (kind, name) => store.createDataAsset(kind, name),
    onCanEditSource: store.canEditSource,
    onSaveNoteAsset: (assetId, path, source, expected) => {
      const current = store.active().assets.find(asset => asset.id === assetId);
      if (!current || current.files?.[path] !== expected) throw new Error("Saved note changed. Reload before saving.");
      commandOwner("asset.files.patch", { assetId, expectedAssetRevision: current.revision, patch: { [path]: source } });
    },
    onConfigureBrowser: (panelId, config) =>
      command({ type: "configureBrowser", panelId, config }),
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
    onSearchCommands: () => openPalette(">"),
  };
  const activePanelId = activeMainPanel(workspace.dock);
  const activePanel = workspace.dock.panels[activePanelId];
  function renderPanel(panel: DockPanel): import("react").ReactNode {
    if (
      panel.kind === "widget" &&
      ["navigation", "asset-browser"].includes(panel.widget)
    )
      return (
        <WidgetFrame
          panel={panel}
          title={
            panel.displayName ||
            (panel.widget === "navigation" ? "Navigation" : "Asset browser")
          }
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {renderPanel({
              ...panel,
              kind: panel.widget === "navigation" ? "navigation" : "browser",
            } as DockPanel)}
          </div>
        </WidgetFrame>
      );

    if (panel.kind === "command-output")
      return (
        <CommandOutput
          definitionId={panel.definitionId}
          workspace={workspace}
        />
      );
    if (panel.kind === "contribution")
      return <ContributionView panel={panel} workspace={workspace} />;
    if (panel.kind === "editor-part") return <EditorPart panel={panel} />;
    if (panel.kind === "navigation")
      return (
        <WorkspaceNavigation
          onToggleBrowser={toggleBrowser}
          panelId={panel.id}
          onInitialize={() => commandOwner("navigation.initialize", {panelId:panel.id})}
          initialized={panel.navigation?.areasInitialized}
          key={`${workspace.id}/${panel.id}`}
          workspaceId={workspace.id}
          items={panel.targetRef ? searchItems.filter(item => item.kind === "assets" || (item.panelId && resolveSlotReference(workspace.dock, panel.targetRef!)?.tabs.includes(item.panelId))) : searchItems}
          targetError={panel.targetRef && !resolveSlotReference(workspace.dock, panel.targetRef) ? "Target slot is missing. Choose a target in widget settings." : undefined}
          filter={panel.navigation?.filter??workspace.navigation}
          presentation={panel.navigation?.presentation??'list'}
          onPresentationChange={presentation=>commandOwner('navigation.configure',{panelId:panel.id,presentation})}
          onFilterChange={filter=>commandOwner('navigation.configure',{panelId:panel.id,filter})}
          onSaveDefinition={()=>commandOwner('navigation.saveDefinition',{panelId:panel.id,name:'Navigation variant'})}
          activePanelId={activePanelId}
          activeAssetId={
            activePanel?.kind === "asset" ? activePanel.assetId : undefined
          }
          onOpen={(item) => {
            if(item.assetId)commandOwner('navigation.configure',{panelId:panel.id,selectedAssetId:item.assetId});
            if (!panel.targetRef) { void openSearchItem(item); return; }
            const slot = resolveSlotReference(workspace.dock, panel.targetRef);
            if (!slot) { console.warn("Navigation target is missing. Choose a target in widget settings."); return; }
            if (item.assetId) {
              const existing = slot.tabs.find(id => { const p = workspace.dock.panels[id]; return p?.kind === "asset" && p.assetId === item.assetId; });
              if (existing) command({ type: "activate", panelId: existing });
              else command({ type: "createAssetView", assetId: item.assetId, target: { ...panel.targetRef, intent: "tab" } });
            } else if (item.panelId && slot.tabs.includes(item.panelId)) command({ type: "activate", panelId: item.panelId });
          }}
          onSearch={() => openPalette("search: ")}
          header={
            <>
              <WorkspaceSwitcher
                onSettings={() => showOverlay({ kind: "settings" })}
                onDelete={() => showOverlay({ kind: "delete-workspace", workspaceId: workspace.id })}
                canDelete={state.workspaces.length > 1}
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

        />
      );
    if (panel.kind === "home") return <Dashboard onRename={store.renameWorkspace} workspace={workspace} />;
    if (panel.kind === "widget" && panel.widget !== "asset-browser")
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
      const asset = browsableAssets.find((item) => item.id === panel.assetId);
      return asset ? (
        <AssetEditor
          asset={asset}
          panel={panel}
          workspace={workspace}
          onRestore={(assetId) => showOverlay({ kind: "restore", assetId })}
          runRequest={
            runRequest?.assetId === asset.id ? runRequest.token : undefined
          }
        />
      ) : (
        <div className="dock-missing">Asset no longer exists.</div>
      );
    }
    return (
      <AssetBrowser
        workspace={workspace}
        onFork={asset => { const result = control.execute({ method: "asset.fork", params: { assetId: asset.id, name: `${asset.name.slice(0, 108)} variant` } }).result; setSelectedBrowserIds([result.id]); command({ type: "openAsset", assetId: result.id }); }}
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        assets={browsableAssets}
        onPatchMetadata={(assetId, patch) => {
          control.execute({
            method: "asset.metadata",
            params: { assetId, patch },
          });
        }}
        canEdit={store.canEditSource}
        groups={workspace.assetGroups ?? []}
        onGroupsChange={store.setAssetGroups}
        selected={selectedBrowserIds}
        onSelectedChange={setSelectedBrowserIds}
        onOpen={(id) => command({ type: "openAsset", assetId: id })}
        onNew={(kind, scriptMode) => showOverlay({ kind: "create", target: kind, scriptMode })}
        onRename={(assetId) => {
          if (!isBuiltinWidgetAsset(assetId) && !isBuiltinDeskTemplate(assetId))
            showOverlay({ kind: "rename", assetId });
        }}
        onDelete={(ids) =>
          requestDelete(
            ids.filter(
              (id) => !isBuiltinWidgetAsset(id) && !isBuiltinDeskTemplate(id),
            ),
          )
        }
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
  const shortcutEntries = (workspace.shortcuts ?? DEFAULT_SHORTCUTS).entries;
  const actionGroups = shellActions(workspace).map(group => ({ ...group, items: group.items.map(action => {
    const override = shortcutEntries.find(e => e.action.kind === "shell" && e.action.actionId === action.id);
    return override ? { ...action, shortcut: override.enabled ? override.keys ?? undefined : undefined } : action;
  }) }));
  const condition = (key:string) => {
    if(key==='canUndo')return store.layoutHistory().canUndo;
    if(key==='canRedo')return store.layoutHistory().canRedo;
    if(key==='canBack')return navigationAvailable(store.active(),nav.back);
    if(key==='canForward')return navigationAvailable(store.active(),nav.forward);
    return false;
  };
  const invoke = createActionRouter({condition,command:commandOwner,shell:shellActionImplementations({workspace:store.active,command,revealPanel,toggleBrowser,showOverlay,openInspector,navigate,undo:store.undoLayout,redo:store.redoLayout,palette:()=>openPalette()})});
  const actionById = (id:string) => actionGroups.flatMap(group=>group.items).find(action=>action.id===id)!;
  const paletteActions = shellCommandGroups(actionGroups,invoke,condition);
  useEffect(() => {
    const onKey=(event:KeyboardEvent)=>{
      if (event.repeat || event.isComposing || event.getModifierState('AltGraph') || event.defaultPrevented || document.querySelector('[data-shortcuts-manager]')) return;
      const typing=!!(event.target as Element)?.closest('input,textarea,select,[contenteditable],.cm-editor,[role=dialog],[role=application],canvas');
      const input={...{key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,altKey:event.altKey},typing,composing:event.isComposing,handled:event.defaultPrevented};
      const platform=/Mac|iPhone|iPad/.test(navigator.platform)?'mac':'other';
      if (!typing && event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); openShortcuts(); return; }
      const overridden = new Set(shortcutEntries.filter(e => e.action.kind === 'shell').map(e => e.action.kind === 'shell' ? e.action.actionId : ''));
      const action=actionGroups.flatMap(group=>group.items).find(action=>action.id!=='palette'&&!overridden.has(action.id)&&action.shortcut&&matchesActionShortcut(action.shortcut,input,platform))
        ?? (matchesActionShortcut('mod+y',input,platform)?actionById('redo'):undefined);
      if(action && actionState(action,condition).visible && actionState(action,condition).enabled){event.preventDefault();void invoke(action);}
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[actionGroups,invoke]);

  const sidebarHasPanels = surfacePanels(workspace.dock, "sidebar").length > 0;
  const bottomHasPanels =
    !workspace.dock.hidden.bottom ||
    (narrow && !workspace.dock.hidden.sidebar && sidebarHasPanels);
  useEffect(() => {
    if (narrow && sidebarHasPanels) setBottomOpen(true);
  }, [narrow, sidebarHasPanels]);
  return (
    <RichTextAssetsContext.Provider value={{ createMarkdown: (name, source) => commandOwner("asset.create", { kind: "markdown", name: name.slice(0, 120), files: { "note.md": source } }).result.id, open: id => command({ type: "openAsset", assetId: id }) }}><SemanticThemeProvider workspace={workspace} preference={state.app.theme} resolveSvg={ports.resolveSvg}><DeskScene><DockHost
      key={`${workspace.id}:${workspace.activeDeskId}`}
      layout={workspace.dock}
      onCommand={command}
      renderPanel={renderPanel}
      definitions={definitions}
      definitionSources={{ workspaceId: workspace.id, assets: workspace.assets }}
      onOpenDefinition={(assetId) => {
        store.selectAsset(assetId);
        command({ type: "openAsset", assetId });
      }}
      onForkDefinition={(assetId) => {
        const id = store.forkWidgetDefinition(assetId);
        command({ type: "openAsset", assetId: id });
      }}
      panelTitle={(panel) =>
        (panel.kind === "widget" ? panel.displayName : undefined) ||
        (definitionForPanel(panel, definitions)?.title ?? panel.id)
      }
      debugDropZones={new URLSearchParams(location.search).has(
        "debugDropZones",
      )}
      debugLayout={new URLSearchParams(location.search).has("debugLayout")}
    >
      <ThemeAssets workspace={workspace} />
      <AppShellWidget
        panel={
          workspace.dock.panels[workspace.dock.rootId!] as Extract<
            DockPanel,
            { kind: "widget" }
          >
        }
        workspaceId={workspace.id}
        density={state.app.density}
        narrow={narrow}
        bottomOpen={bottomOpen}
        bottomHasPanels={bottomHasPanels}
        setBottomOpen={setBottomOpen}
        command={command}
        layout={workspace.dock}
        toolbar={
          <MainSurfaceToolbar
            onSearch={() => openPalette("search: ")}
            onAction={invoke}
            history={['back','forward'].map(id=>({action:actionById(id),disabled:!actionState(actionById(id),condition).enabled,secondary:true}))}
            actions={['undo','redo','palette','inspector'].map(id=>({action:actionById(id),disabled:!actionState(actionById(id),condition).enabled,secondary:id==='undo'||id==='redo'}))}
          >
            <BuiltinToolbarTool id="notifications"><NotificationInbox defaultItems={[]} /></BuiltinToolbarTool>
            <BuiltinToolbarTool id="widgets"><WidgetCatalog /></BuiltinToolbarTool>
            <BuiltinToolbarTool id="theme">{(store.desk().themeId ?? workspace.themeId) ? <IconAction label="Edit workspace theme" onClick={() => command({ type: "openAsset", assetId: (store.desk().themeId ?? workspace.themeId)! })}><Settings2 size={15} /></IconAction> : <ThemeToggle
              theme={state.app.theme}
              onThemeChange={(theme) => store.patchApp({ theme })}
            />}
            </BuiltinToolbarTool>
            <BuiltinToolbarTool id="user"><UserMenu
              user={{
                name:
                  cloudAccount.account?.user.name ?? (identity?.kind === "demo"
                    ? identity.email?.split("@")[0] || "Demo"
                    : "Guest"),
                email: cloudAccount.account?.user.email ?? identity?.email ?? "Local guest",
              }}
              onSignOut={async () => {
                if (cloudAccount.account) await accountClient.signOut();
                demoSession.set(null);
                setIdentity(null);
              }}
            >
              <UserMenuItem icon={<Settings2 size={15} />} onClick={() => setAccountOpen(true)}>Account and sessions</UserMenuItem>
              <SemanticActionMenuItem action={actionById('settings')} invoke={invoke} condition={condition}/>
              <SemanticActionMenuItem action={actionById('palette')} invoke={invoke} condition={condition}/>
              <UserMenuItem
                icon={<Command size={15} />}
                onClick={() => openShortcuts()}
              >
                Keyboard shortcuts
              </UserMenuItem>
            </UserMenu></BuiltinToolbarTool>
          </MainSurfaceToolbar>
        }
      >
        <WidgetBrowser workspace={workspace} onReveal={revealPanel} />
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
        <ShortcutHost workspace={workspace} invokeShell={id => { const action = actionGroups.flatMap(g => g.items).find(a => a.id === id); if (action) void invoke(action); }} />
        <OverlayHost
          shortcuts={<ShortcutSettings workspace={workspace} onChange={settings => store.configureShortcuts(settings)} onCreateInbox={files => {
            const id = commandOwner('asset.create', { kind: 'data-source', name: 'Inbox', files }).result.id;
            command({ type: 'createWidget', widget: 'data-view', defaults: { displayName: 'Inbox', dataView: { sourceId: id, presentation: 'table', search: '', descending: true, sortBy: 'created', hiddenColumns: ['created'] } }, target: { surface: 'sidebar', intent: 'tab' } });
            return id;
          }} />}
          store={store}
          overlay={overlay}
          setOverlay={setOverlay}
          workspace={workspace}
          state={state}
          onContinue={
            !identity && !cloudAccount.account && !cloudAccount.loading && !accountOpen && !cloudAccount.notice
              ? (value) => {
                  demoSession.set(value);
                  setIdentity(value);
                }
              : undefined
          }
        />
        <Dialog open={accountOpen} onOpenChange={setAccountOpen}><DialogContent size="md"><DialogHeader><DialogTitle>Account and sessions</DialogTitle></DialogHeader><DialogBody><AccountSettings /></DialogBody></DialogContent></Dialog>
        {cloudAccount.notice && <Dialog open onOpenChange={open => { if (!open) accountClient.dismissNotice(); }}><DialogContent size="sm"><DialogHeader><DialogTitle>Session notification</DialogTitle></DialogHeader><DialogBody><p role="status">{cloudAccount.notice}</p></DialogBody><DialogFooter><Button onClick={() => accountClient.dismissNotice()}>Dismiss</Button></DialogFooter></DialogContent></Dialog>}
      </AppShellWidget>
    </DockHost></DeskScene></SemanticThemeProvider></RichTextAssetsContext.Provider>
  );
}

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Box, Command, Folder, LayoutGrid, PanelLeftClose, PanelLeftOpen, PanelTopClose, PanelTopOpen, Plus, Search, Settings2, Undo2, Redo2, X } from "lucide-react";
import { demoSession, deps } from "./composition";
import { Dashboard, DockWebWidget, DockWidget } from "./dashboard";
import { ComponentView } from "./component-view";
import { WebContentView } from "./web-content-view";
import { DockBottomEdge, DockCatalogItem, DockFloatingPanels, DockHost, DockInspector, DockMainTabs, DockMobileSurface, DockSurface, useDockController } from "./docking/react";
import { BROWSER_ID, HOME_ID, panelSurface, surfacePanels, visitNode, type Command as DockCommand, type DockLayout, type Panel as DockPanel, type Result } from "./docking/core";
import { UnitBrowser } from "./unit-browser";
import { WIDGET_CATALOG, type WidgetActions } from "./widget-views";
import { WIDGET_IDS } from "./panel-layout";
import { Onboarding, type DemoIdentity } from "./onboarding";
import { WorkspaceSwitcher } from "@/components/ui/workspace-switcher";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarItem } from "@/components/ui/sidebar";
import { Panel, PanelGroup, PanelHandle } from "@/components/ui/resizable-panels";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CommandPalette } from "@/components/ui/command-palette";
import { NotificationInbox } from "@/components/ui/notification-inbox";
import { UserMenu, UserMenuItem } from "@/components/ui/user-menu";
import { ThemeToggle, changeTheme } from "@/components/ui/theme-toggle";
import { ShortcutsSheet } from "@/components/ui/shortcuts-sheet";
import type { State, Workspace } from "./model";

const { store } = deps;
function activeMainPanel(layout: DockLayout): string {
  let active = HOME_ID;
  visitNode(layout.surfaces.main, (node) => { if (node.kind === "stack" && active === HOME_ID) active = node.active; });
  return active;
}
function useStore(): State {
  const [state, setState] = useState(store.get());
  useEffect(() => { const unsubscribe = store.subscribe(() => setState(store.get())); return () => { unsubscribe(); }; }, []);
  return state;
}

/** Catalog uses the same drag coordinator as placed panel tabs. */
function WidgetCatalog() {
  const [open, setOpen] = useState(false);
  const { active } = useDockController();
  return <Popover open={open || active?.kind === "widget"} onOpenChange={(value) => { if (!active) setOpen(value); }}>
    <PopoverTrigger variant="ghost" className="widget-catalog-trigger" title="Add widgets" aria-label="Add widgets"><LayoutGrid size={17} /><Plus size={12} /></PopoverTrigger>
    <PopoverContent side="bottom" align="end" size="auto" arrow={false} className="widget-catalog-popover">
      <div className="widget-catalog-heading"><strong>Widgets</strong><span>Drag a tile into the dashboard or a dock.</span></div>
      <div className="widget-library-grid">{WIDGET_IDS.map((id) => {
        const item = WIDGET_CATALOG[id], Icon = item.icon;
        return <div className="widget-library-tile" key={id}>
          <DockCatalogItem widget={id} title={item.title}><Icon size={20} /><strong>{item.title}</strong><small>{item.description}</small></DockCatalogItem>
        </div>;
      })}</div>
      <p className="widget-catalog-hint">While dragging: hold Alt to join tabs, or Shift to split a dock.</p>
    </PopoverContent>
  </Popover>;
}

type Overlay = null | { kind: "create"; target: "component" | "web-content" | "workspace" } | { kind: "rename"; unitId: string } | { kind: "restore"; unitId: string } | { kind: "delete"; unitIds: string[]; workspaceId: string } | { kind: "settings" };
/** Transient dialog host. Neither dialog visibility nor input drafts enter the layout document. */
function OverlayHost({ overlay, setOverlay, workspace, state, onContinue }: { overlay: Overlay; setOverlay: (next: Overlay) => void; workspace: Workspace; state: State; onContinue?: (identity: DemoIdentity) => void }) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (overlay?.kind === "rename") setName(workspace.units.find((unit) => unit.id === overlay.unitId)?.name ?? "");
    else setName("");
  }, [overlay?.kind, overlay?.kind === "rename" ? overlay.unitId : ""]);
  const [settingsTab, setSettingsTab] = useState<"workspace" | "app">("workspace");
  const close = () => setOverlay(null);
  return <><Dialog open={Boolean(overlay)} onOpenChange={(open) => { if (!open) close(); }}>
    {overlay && <DialogContent size={overlay.kind === "settings" ? "lg" : "sm"} className="workspace-dialog">
      {overlay.kind === "create" && <form onSubmit={(event) => {
        event.preventDefault(); const value = name.trim(); if (!value) return;
        if (overlay.target === "workspace") store.createWorkspace(value);
        else { const id = overlay.target === "web-content" ? store.createWebUnit(value) : store.createUnit(value); store.dispatchDock({ type: "openUnit", unitId: id }); }
        close();
      }}><DialogHeader><DialogTitle>New {overlay.target === "component" ? "Component" : overlay.target === "web-content" ? "web content" : "workspace"}</DialogTitle><DialogDescription>{overlay.target === "component" ? "Start with a Rust and WIT source project." : overlay.target === "web-content" ? "Create a local HTML widget in an isolated iframe." : "Create a separate space for units and widgets."}</DialogDescription></DialogHeader>
        <DialogBody><label className="field-label" htmlFor="new-name">Name</label><input id="new-name" autoFocus value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder={overlay.target === "component" ? "My Component" : overlay.target === "web-content" ? "My Widget" : "My Workspace"} /></DialogBody>
        <DialogFooter><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" type="submit">Create</button></DialogFooter>
      </form>}
      {overlay.kind === "rename" && <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) store.renameUnit(overlay.unitId, name.trim()); close(); }}>
        <DialogHeader><DialogTitle>Rename unit</DialogTitle><DialogDescription>Change its display name. Source and artifact identity stay the same.</DialogDescription></DialogHeader>
        <DialogBody><label className="field-label" htmlFor="rename-name">Name</label><input id="rename-name" autoFocus value={name} onChange={(event) => setName(event.currentTarget.value)} /></DialogBody>
        <DialogFooter><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" type="submit">Rename</button></DialogFooter>
      </form>}
      {overlay.kind === "restore" && <><DialogHeader><DialogTitle>Restore Greeting sample?</DialogTitle><DialogDescription>This replaces edited source with the bundled Rust and WIT project. Build it again to run.</DialogDescription></DialogHeader>
        <DialogFooter><button className="secondary" onClick={close}>Cancel</button><button className="primary" onClick={() => { store.resetSample(overlay.unitId); close(); }}>Restore sample</button></DialogFooter></>}
      {overlay.kind === "delete" && <><DialogHeader><DialogTitle>Delete {overlay.unitIds.length === 1 ? workspace.units.find((unit) => unit.id === overlay.unitIds[0])?.name ?? "unit" : `${overlay.unitIds.length} units`}?</DialogTitle><DialogDescription>This removes the selected units and their open views from this workspace. This cannot be undone.</DialogDescription></DialogHeader>
        <DialogFooter><button className="secondary" autoFocus onClick={close}>Cancel</button><button className="primary" onClick={() => { if (store.active().id === overlay.workspaceId) store.deleteUnits(overlay.unitIds); close(); }}>Delete {overlay.unitIds.length === 1 ? "unit" : "units"}</button></DialogFooter></>}
      {overlay.kind === "settings" && <><DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription>Workspace preferences and app appearance.</DialogDescription></DialogHeader>
        <DialogBody><div className="settings-layout"><nav className="settings-sidebar"><button className={settingsTab === "workspace" ? "active" : ""} onClick={() => setSettingsTab("workspace")}><Folder size={15} /> Workspace</button><button className={settingsTab === "app" ? "active" : ""} onClick={() => setSettingsTab("app")}><Settings2 size={15} /> App</button></nav>
          <div className="settings-body">{settingsTab === "workspace" ? <><h3>Current workspace</h3><label className="field-label" htmlFor="workspace-name">Name</label><input id="workspace-name" value={workspace.name} onChange={(event) => store.renameWorkspace(event.currentTarget.value)} /><label className="field-label" htmlFor="workspace-description">Description</label><textarea id="workspace-description" rows={3} value={workspace.description} onChange={(event) => store.describeWorkspace(event.currentTarget.value)} /><div className="setting-row"><span>Units</span><strong>{workspace.units.length}</strong></div></> : <><h3>Appearance</h3><div className="setting-row"><label htmlFor="app-theme">Theme</label><select id="app-theme" value={state.app.theme} onChange={(event) => changeTheme(event.currentTarget.value as State["app"]["theme"], (theme) => store.patchApp({ theme }), event.currentTarget)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></div><div className="setting-row"><label htmlFor="app-density">Density</label><select id="app-density" value={state.app.density} onChange={(event) => store.patchApp({ density: event.currentTarget.value as State["app"]["density"] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></div></>}</div></div></DialogBody>
      </>}
    </DialogContent>}
  </Dialog>{onContinue && <Onboarding onContinue={onContinue} />}</>;
}

export function WorkspaceApp() {
  const state = useStore();
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId)!;
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [bottomOpen, setBottomOpen] = useState(() => surfacePanels(workspace.dock, "bottom").length > 0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [, setNavRevision] = useState(0);
  const navigation = useRef(new Map<string, { back: string[]; current: string; forward: string[] }>());
  const [runRequest, setRunRequest] = useState<{ unitId: string; token: number } | null>(null);
  const [identity, setIdentity] = useState<DemoIdentity | null>(() => demoSession.get());
  const [selectedBrowserIds, setSelectedBrowserIds] = useState<string[]>([]);
  const [browserQuery, setBrowserQuery] = useState("");
  const [browserFilters, setBrowserFilters] = useState<string[]>([]);
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 720px)").matches);
  const restoreFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { const media = matchMedia("(max-width: 720px)"); const update = () => setNarrow(media.matches); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  useEffect(() => { const pref = state.app.theme; const media = matchMedia("(prefers-color-scheme: dark)"); const update = () => { document.documentElement.dataset.theme = pref === "system" ? media.matches ? "dark" : "light" : pref; }; update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, [state.app.theme]);
  useEffect(() => { setSelectedBrowserIds([]); setBrowserQuery(""); setBrowserFilters([]); setBottomOpen(surfacePanels(workspace.dock, "bottom").length > 0); }, [workspace.id]);
  useEffect(() => { setSelectedBrowserIds((ids) => ids.filter((id) => workspace.units.some((unit) => unit.id === id))); }, [workspace.units]);
  useEffect(() => { if (!overlay) { const target = restoreFocus.current; if (target?.isConnected) target.focus(); else document.querySelector<HTMLElement>(".unit-browser [data-select-id], .unit-browser-search input, .unit-browser-new")?.focus(); } }, [overlay]);
  function showOverlay(next: Overlay) { restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOverlay(next); }
  function command(next: DockCommand): Result {
    const result = store.dispatchDock(next);
    if (result.ok && (next.type === "activate" || next.type === "openUnit" && result.panelId)) {
      const id = next.type === "activate" ? next.panelId : result.panelId!;
      if (panelSurface(result.layout, id) === "main") {
        const history = navigation.current.get(workspace.id) ?? { back: [], current: activeMainPanel(workspace.dock), forward: [] };
        if (history.current !== id) { history.back.push(history.current); history.current = id; history.forward = []; navigation.current.set(workspace.id, history); setNavRevision((value) => value + 1); }
      }
    }
    if (result.ok && "target" in next) {
      if (next.target?.surface === "bottom") setBottomOpen(true);
      if (next.target?.surface === "sidebar" && narrow) setBottomOpen(true);
    }
    if (result.ok && next.type === "visibility" && next.surface === "sidebar" && !next.hidden && narrow) setBottomOpen(true);
    return result;
  }
  const nav = navigation.current.get(workspace.id) ?? { back: [], current: activeMainPanel(workspace.dock), forward: [] };
  function navigate(direction: "back" | "forward") {
    const history = navigation.current.get(workspace.id) ?? { back: [], current: activeMainPanel(workspace.dock), forward: [] };
    const source = direction === "back" ? history.back : history.forward;
    const destination = direction === "back" ? history.forward : history.back;
    while (source.length) {
      const id = source.pop()!;
      if (panelSurface(store.active().dock, id) !== "main") continue;
      destination.push(history.current); history.current = id;
      navigation.current.set(workspace.id, history);
      store.dispatchDock({ type: "activate", panelId: id });
      setNavRevision((value) => value + 1); break;
    }
  }
  const browserSurface = panelSurface(workspace.dock, BROWSER_ID);
  function toggleBrowser() {
    if (browserSurface === "bottom" || narrow) {
      command({ type: "activate", panelId: BROWSER_ID });
      setBottomOpen((value) => !value);
      command({ type: "visibility", surface: browserSurface === "sidebar" ? "sidebar" : "bottom", hidden: bottomOpen });
    }
    else command({ type: "activate", panelId: BROWSER_ID });
  }
  function openBrowser() {
    command({ type: "activate", panelId: BROWSER_ID });
    if (browserSurface === "bottom" || narrow) { setBottomOpen(true); command({ type: "visibility", surface: browserSurface === "sidebar" ? "sidebar" : "bottom", hidden: false }); }
  }
  function requestDelete(ids: string[]) {
    const valid = [...new Set(ids)].filter((id) => workspace.units.some((unit) => unit.id === id));
    if (valid.length) showOverlay({ kind: "delete", unitIds: valid, workspaceId: workspace.id });
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable],.cm-editor,[role=dialog],[role=application],canvas") || event.altKey) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? store.redoLayout() : store.undoLayout(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); store.redoLayout(); return; }
      if (event.ctrlKey || event.metaKey) return;
      if (event.shiftKey && event.key.toLowerCase() === "w") { event.preventDefault(); toggleBrowser(); }
      if (event.shiftKey && event.key.toLowerCase() === "q") { event.preventDefault(); command({ type: "visibility", surface: "sidebar", hidden: !workspace.dock.hidden.sidebar }); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [browserSurface, narrow, bottomOpen, workspace.id, workspace.dock.hidden.sidebar]);
  const actions: WidgetActions = {
    onOpenUnit: (id) => command({ type: "openUnit", unitId: id }),
    onOpenRun: (id) => { setRunRequest((previous) => ({ unitId: id, token: (previous?.token ?? 0) + 1 })); command({ type: "openUnit", unitId: id }); },
    onOpenBrowser: openBrowser,
    onNewUnit: () => showOverlay({ kind: "create", target: "component" }),
    onGrant: store.setGrant,
  };
  function renderPanel(panel: DockPanel) {
    if (panel.kind === "navigation") return <Sidebar className="app-sidebar" value="overview" aria-label="Workspace navigation">
      <SidebarHeader><WorkspaceSwitcher shortcut="alt" workspaces={state.workspaces.map((item) => ({ id: item.id, name: item.name, plan: "Local workspace", detail: `${item.units.length} units` }))} value={workspace.id} onValueChange={store.selectWorkspace} onCreate={(name) => name.trim() ? store.createWorkspace(name.trim()) : showOverlay({ kind: "create", target: "workspace" })} /></SidebarHeader>
      <SidebarContent aria-label="Workspace navigation"><SidebarGroup label="Workspace" collapsible><SidebarItem value="overview" icon={<LayoutGrid />} onClick={() => command({ type: "activate", panelId: HOME_ID })}>Overview</SidebarItem></SidebarGroup></SidebarContent>
      <SidebarFooter className="workspace-sidebar-footer"><SidebarItem value="settings" icon={<Settings2 />} onClick={() => showOverlay({ kind: "settings" })}>Settings</SidebarItem></SidebarFooter>
    </Sidebar>;
    if (panel.kind === "home") return <Dashboard workspace={workspace} />;
    if (panel.kind === "widget") return <DockWidget panel={panel} workspace={workspace} actions={actions} />;
    if (panel.kind === "web-widget") return <DockWebWidget panel={panel} workspace={workspace} onOpen={(id) => command({ type: "openUnit", unitId: id })} />;
    if (panel.kind === "unit") {
      const unit = workspace.units.find((item) => item.id === panel.unitId);
      return unit?.kind === "web-content" ? <WebContentView unit={unit} onAddWidget={() => command({ type: "createWebWidget", unitId: unit.id })} /> : unit?.kind === "component" ? <ComponentView unit={unit} workspaceId={workspace.id} runRequest={runRequest?.unitId === unit.id ? runRequest.token : undefined} onRestore={(unitId) => showOverlay({ kind: "restore", unitId })} /> : <div className="dock-missing">Unit no longer exists.</div>;
    }
    return <UnitBrowser workspaceName={workspace.name} units={workspace.units} selected={selectedBrowserIds} onSelectedChange={setSelectedBrowserIds}
      onOpen={(id) => command({ type: "openUnit", unitId: id })} onNew={(kind) => showOverlay({ kind: "create", target: kind })} onRename={(unitId) => showOverlay({ kind: "rename", unitId })}
      onDelete={requestDelete}
      view={workspace.dock.browserView} onViewChange={(view) => command({ type: "browserView", view })} query={browserQuery} onQueryChange={setBrowserQuery}
      filters={browserFilters} onFiltersChange={setBrowserFilters} compact={browserSurface === "sidebar" || narrow} />;
  }
  const sidebarHasPanels = surfacePanels(workspace.dock, "sidebar").length > 0;
  const bottomHasPanels = surfacePanels(workspace.dock, "bottom").length > 0 || narrow && sidebarHasPanels;
  useEffect(() => { if (narrow && sidebarHasPanels) setBottomOpen(true); }, [narrow, sidebarHasPanels]);
  return <DockHost layout={workspace.dock} onCommand={command} renderPanel={renderPanel}
    debugDropZones={new URLSearchParams(location.search).has("debugDropZones")}
    debugLayout={new URLSearchParams(location.search).has("debugLayout")}>
    <div className={`app density-${state.app.density} ${sidebarHasPanels ? "has-sidebar-dock" : ""}`} data-sidebar-side={workspace.dock.sidebarSide} data-sidebar-hidden={workspace.dock.hidden.sidebar || undefined}>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={[{ heading: "Navigate", items: [
        { id: "overview", label: "Open overview", icon: <LayoutGrid size={16} />, onSelect: () => command({ type: "activate", panelId: "workspace-home" }) },
        { id: "browser", label: "Toggle unit browser", icon: <Box size={16} />, shortcut: "shift+w", onSelect: toggleBrowser },
        { id: "settings", label: "Open settings", icon: <Settings2 size={16} />, onSelect: () => showOverlay({ kind: "settings" }) },
        { id: "search", label: "Search workspace", icon: <Search size={16} />, onSelect: () => setSearchOpen(true) },
        { id: "inspector", label: "Toggle docking inspector", icon: <LayoutGrid size={16} />, onSelect: () => setInspectorOpen((value) => !value) },
        { id: "sidebar-side", label: `Move sidebar ${workspace.dock.sidebarSide === "left" ? "right" : "left"}`, icon: <PanelLeftOpen size={16} />, onSelect: () => command({ type: "sidebarSide", side: workspace.dock.sidebarSide === "left" ? "right" : "left" }) },
        { id: "sidebar-visibility", label: workspace.dock.hidden.sidebar ? "Show sidebar" : "Hide sidebar", icon: <PanelLeftOpen size={16} />, onSelect: () => command({ type: "visibility", surface: "sidebar", hidden: !workspace.dock.hidden.sidebar }) },
        { id: "main-visibility", label: workspace.dock.hidden.main ? "Show main surface" : "Hide main surface", icon: <PanelTopOpen size={16} />, onSelect: () => command({ type: "visibility", surface: "main", hidden: !workspace.dock.hidden.main }) },
        { id: "layout-back", label: "Undo layout", icon: <Undo2 size={16} />, onSelect: () => store.undoLayout() },
        { id: "layout-forward", label: "Redo layout", icon: <Redo2 size={16} />, onSelect: () => store.redoLayout() },
        { id: "panel-back", label: "Back to previous panel", icon: <ArrowLeft size={16} />, onSelect: () => navigate("back") },
        { id: "panel-forward", label: "Forward to next panel", icon: <ArrowRight size={16} />, onSelect: () => navigate("forward") },
      ] }, { heading: "Create", items: [
        { id: "new-web-unit", label: "New web content", icon: <Plus size={16} />, onSelect: () => showOverlay({ kind: "create", target: "web-content" }) },
        { id: "new-unit", label: "New Component", icon: <Plus size={16} />, onSelect: () => showOverlay({ kind: "create", target: "component" }) },
        { id: "new-workspace", label: "New workspace", icon: <Folder size={16} />, onSelect: () => showOverlay({ kind: "create", target: "workspace" }) },
      ] }]} />
      <main className="shell"><div className="work-area">
        {!workspace.dock.hidden.sidebar && <DockSurface surface="sidebar" className="app-sidebar-dock" />}
        <PanelGroup key={workspace.id} direction="vertical" className="dock-workspace" onLayout={(sizes) => { if (sizes[1] > 0) command({ type: "resizeBottom", size: sizes[1] }); }}>
          <Panel id="workspace-main" defaultSize={bottomOpen && bottomHasPanels ? 100 - workspace.dock.bottomSize : 100} minSize={40}>
            <section className="content"><div className="dock-shell-top"><DockMainTabs /></div><div className="panel-nav dock-shell-toolbar">
              <button className="icon-button dock-mobile-secondary" title="Back" aria-label="Back" disabled={!nav.back.some((id) => panelSurface(workspace.dock, id) === "main")} onClick={() => navigate("back")}><ArrowLeft size={16} /></button>
              <button className="icon-button dock-mobile-secondary" title="Forward" aria-label="Forward" disabled={!nav.forward.some((id) => panelSurface(workspace.dock, id) === "main")} onClick={() => navigate("forward")}><ArrowRight size={16} /></button>
              <button className="dock-search-button" aria-label="Search workspace" onClick={() => setSearchOpen(true)}><Search size={15} /><span>Search workspace</span></button><span className="spacer" />
              <button className="icon-button" title={workspace.dock.hidden.sidebar ? "Show sidebar (Shift+Q)" : "Hide sidebar (Shift+Q)"} aria-label={workspace.dock.hidden.sidebar ? "Show sidebar" : "Hide sidebar"} onClick={() => command({ type: "visibility", surface: "sidebar", hidden: !workspace.dock.hidden.sidebar })}>{workspace.dock.hidden.sidebar ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
              <button className="icon-button dock-mobile-secondary" title="Undo layout" aria-label="Undo layout" disabled={!store.layoutHistory().canUndo} onClick={() => store.undoLayout()}><Undo2 size={16} /></button>
              <button className="icon-button dock-mobile-secondary" title="Redo layout" aria-label="Redo layout" disabled={!store.layoutHistory().canRedo} onClick={() => store.redoLayout()}><Redo2 size={16} /></button>
              <button className="icon-button dock-mobile-secondary" title={workspace.dock.hidden.main ? "Show main surface" : "Hide main surface"} aria-label={workspace.dock.hidden.main ? "Show main surface" : "Hide main surface"} onClick={() => command({ type: "visibility", surface: "main", hidden: !workspace.dock.hidden.main })}>{workspace.dock.hidden.main ? <PanelTopOpen size={16} /> : <PanelTopClose size={16} />}</button>
              <button className="icon-button" title="Toggle unit browser (Shift+W)" aria-label="Toggle unit browser" onClick={toggleBrowser}><Box size={16} /></button>
              <button className="icon-button" title="Command palette (Ctrl+K)" aria-label="Open command palette" onClick={() => setPaletteOpen(true)}><Command size={16} /></button>
              <NotificationInbox defaultItems={[]} /><WidgetCatalog />
              <ThemeToggle theme={state.app.theme} onThemeChange={(theme) => store.patchApp({ theme })} />
              <UserMenu user={{ name: identity?.kind === "demo" ? identity.email?.split("@")[0] || "Demo" : "Guest", email: identity?.email || "Local guest" }} onSignOut={() => { demoSession.set(null); setIdentity(null); }}>
                <UserMenuItem icon={<Settings2 size={15} />} onClick={() => showOverlay({ kind: "settings" })}>Settings</UserMenuItem>
                <UserMenuItem icon={<Command size={15} />} onClick={() => setPaletteOpen(true)}>Command palette</UserMenuItem>
                <UserMenuItem icon={<Command size={15} />} onClick={() => setShortcutsOpen(true)}>Keyboard shortcuts</UserMenuItem>
              </UserMenu>
            </div><div className="page">{workspace.dock.hidden.main ? <div className="dock-hidden-message"><span>Main surface hidden</span><button onClick={() => command({ type: "visibility", surface: "main", hidden: false })}>Show main</button></div> : <DockSurface surface="main" />}</div></section>
          </Panel>
          <PanelHandle aria-label="Resize bottom dock" className="dock-resize-handle" grip />
          <Panel id="workspace-bottom" defaultSize={workspace.dock.bottomSize} minSize={24} maxSize={60} collapsible collapsed={!bottomOpen || !bottomHasPanels} onCollapsedChange={(collapsed) => setBottomOpen(!collapsed)}>{narrow ? <DockMobileSurface /> : <DockSurface surface="bottom" />}</Panel>
        </PanelGroup>
      </div></main>
      <DockBottomEdge />
      <DockFloatingPanels />
      {inspectorOpen && <DockInspector onClose={() => setInspectorOpen(false)} />}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent><DialogHeader><DialogTitle>Search workspace</DialogTitle></DialogHeader><DialogBody><input autoFocus aria-label="Search panels and units" placeholder="Find a panel or unit" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /><div className="dock-search-results">{[
        ...Object.values(workspace.dock.panels).filter((panel) => panel.kind !== "navigation").map((panel) => ({ id: panel.id, label: panel.kind === "unit" || panel.kind === "web-widget" ? workspace.units.find((unit) => unit.id === panel.unitId)?.name ?? panel.unitId : panel.kind === "widget" ? panel.widget : panel.kind === "home" ? "Overview" : "Unit browser", panelId: panel.id })),
        ...workspace.units.filter((unit) => !workspace.dock.panels[`unit-view:${unit.id}`]).map((unit) => ({ id: unit.id, label: unit.name, unitId: unit.id })),
      ].filter((item) => item.label.toLowerCase().includes(searchQuery.toLowerCase())).map((item) => <button key={item.id} onClick={() => { if ("unitId" in item) command({ type: "openUnit", unitId: item.unitId! }); else command({ type: "activate", panelId: item.panelId! }); const surface = "panelId" in item ? panelSurface(workspace.dock, item.panelId!) : "main"; if (surface) command({ type: "visibility", surface, hidden: false }); setSearchOpen(false); setSearchQuery(""); }}>{item.label}</button>)}</div></DialogBody></DialogContent></Dialog>
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} groups={[{ heading: "Workspace", shortcuts: [
        { keys: "mod+k", label: "Open command palette" }, { keys: "shift+w", label: "Toggle unit browser" },
      ] }, { heading: "Unit browser", shortcuts: [{ keys: "mod+a", label: "Select visible units" }, { keys: "delete", label: "Delete selected units" }, { keys: "shift+f10", label: "Open context menu" }] }]} />
      <OverlayHost overlay={overlay} setOverlay={setOverlay} workspace={workspace} state={state} onContinue={!identity ? (value) => { demoSession.set(value); setIdentity(value); } : undefined} />
    </div>
  </DockHost>;
}

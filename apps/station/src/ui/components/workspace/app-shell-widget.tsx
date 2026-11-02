import type { ReactNode } from "react";
import type {
  Command,
  DockLayout,
  Panel as WidgetPanel,
  Result,
} from "../../../core/docking";
import { HOME_ID, surfacePanels } from "../../../core/docking";
import {
  DockBottomEdge,
  DockFloatingPanels,
  DockMainTabs,
  DockMobileSurface,
  DockSurface,
  useDockController,
} from "../../docking/react";
import { Panel, PanelGroup, PanelHandle } from "../ui/resizable-panels";
import { SideDockResize } from "./side-dock-resize";
import { Button } from "../ui/button";

/** Root layout widget. Named surfaces, retained windows, drawers and transient
 * overlays share the desk's DockHost; changing shells never creates another store.
 * Children are host React composition, never persisted callbacks or authority. */
export function AppShellWidget({
  panel,
  workspaceId,
  density,
  narrow,
  bottomOpen,
  bottomHasPanels,
  setBottomOpen,
  command,
  layout,
  toolbar,
  children,
}: {
  panel: Extract<WidgetPanel, { kind: "widget" }>;
  workspaceId: string;
  density: string;
  narrow: boolean;
  bottomOpen: boolean;
  bottomHasPanels: boolean;
  setBottomOpen: (value: boolean) => void;
  command: (action: Command) => Result;
  layout: DockLayout;
  toolbar: ReactNode;
  children: ReactNode;
}) {
  const desktop = panel.widget === "desktop-shell";
  const { panelTitle, activeFloating, raiseFloating, openCatalog, highlightedWidget } =
    useDockController();
  const sidebarHasPanels = surfacePanels(layout, "sidebar").length > 0;
  const windows = Object.keys(layout.floating).filter(
    (id) => layout.floating[id].presentation !== "peek",
  );
  const mainPanels = surfacePanels(layout, "main").filter(
    (id) => id !== HOME_ID,
  );
  return (
    <div
      className={`app density-${density} ${sidebarHasPanels ? "has-sidebar-dock" : ""} ${desktop ? "station-desktop-shell" : ""}`}
      data-widget-instance={panel.id}
      data-highlighted={highlightedWidget === panel.id || undefined}
      data-root-widget={panel.widget}
      data-sidebar-side={layout.sidebarSide}
      data-sidebar-hidden={layout.hidden.sidebar || undefined}
      style={
        {
          "--dock-sidebar-width": `clamp(220px, ${layout.sidebarWidth}px, 55vw)`,
          backgroundColor: panel.background,
        } as import("react").CSSProperties
      }
    >
      {desktop ? (
        <>
          <main className="station-desktop-canvas" aria-label="Desktop">
            <div className="station-desktop-toolbar">{toolbar}</div>
            {(mainPanels.length > 0 ||
              surfacePanels(layout, "dashboard").length > 0) && (
              <div
                className="station-desktop-main"
                data-empty={!mainPanels.length || undefined}
              >
                <DockMainTabs />
                <DockSurface surface="main" />
              </div>
            )}
          </main>
          <nav className="station-desktop-taskbar" aria-label="Desktop dock">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                openCatalog({ surface: "dashboard", intent: "append" })
              }
            >
              Add widget
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                command({
                  type: "visibility",
                  surface: "bottom",
                  hidden: !layout.hidden.bottom,
                })
              }
            >
              Assets
            </Button>
            {mainPanels.map((id) => (
              <Button
                key={id}
                size="sm"
                variant="ghost"
                onClick={() => command({ type: "activate", panelId: id })}
              >
                {panelTitle(layout.panels[id])}
              </Button>
            ))}
            {windows.map((id) => (
              <Button
                key={id}
                size="sm"
                variant="ghost"
                aria-pressed={
                  !layout.floating[id].hidden && activeFloating === id
                }
                onClick={() => {
                  command({
                    type: "windowVisibility",
                    panelId: id,
                    hidden:
                      !layout.floating[id].hidden && activeFloating === id,
                  });
                  raiseFloating(id);
                }}
              >
                {panelTitle(layout.panels[id])}
              </Button>
            ))}
          </nav>
          {!layout.hidden.bottom && (
            <section
              className="station-desktop-assets"
              aria-label="Asset browser drawer"
            >
              <DockSurface surface="bottom" />
            </section>
          )}
        </>
      ) : (
        <>
          <main className="shell">
            <div className="work-area">
              {!layout.hidden.sidebar && (
                <>
                  <DockSurface surface="sidebar" className="app-sidebar-dock" />
                  <SideDockResize
                    width={layout.sidebarWidth}
                    side={layout.sidebarSide}
                    onResize={(width) =>
                      command({ type: "resizeSidebar", width })
                    }
                  />
                </>
              )}
              <PanelGroup
                key={workspaceId}
                direction="vertical"
                instant
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
                      ? 100 - layout.bottomSize
                      : 100
                  }
                  minSize={40}
                >
                  <section className="content">
                    <div className="dock-shell-top">
                      <DockMainTabs />
                    </div>
                    {toolbar}
                    <div className="page">
                      {layout.hidden.main ? (
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
                  className="bg-frame"
                  defaultSize={layout.bottomSize}
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
        </>
      )}
      <DockBottomEdge />
      <DockFloatingPanels />
      {children}
    </div>
  );
}

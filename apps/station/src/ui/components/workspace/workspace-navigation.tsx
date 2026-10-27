import { useEffect, type ReactNode } from "react";
import { Home, Search, Plus, Folder as FolderOpen } from "../../lib/icons";
import type { NavigationFilter } from "../../../core/navigation-filter";
import type { WorkspaceSearchItem } from "../../workspace-search";
import { DockOwnedLayout, useDockController } from "../../docking/react";
import { Sidebar, SidebarFooter, SidebarHeader } from "../ui/sidebar";
import { Button } from "../ui/button";

type Props = {
  onInitialize: () => void;
  panelId: string;
  initialized?: boolean;
  targetError?: string;
  workspaceId: string;
  header: ReactNode;
  footer?: ReactNode;
  items: WorkspaceSearchItem[];
  filter: NavigationFilter;
  presentation?: "list" | "tree" | "compact";
  onPresentationChange?: (value: "list" | "tree" | "compact") => void;
  onSaveDefinition?: () => void;
  onFilterChange: (filter: NavigationFilter) => void;
  activePanelId: string;
  activeAssetId?: string;
  onOpen: (item: WorkspaceSearchItem) => void;
  onSearch: () => void;
  onToggleBrowser: () => void;
};
/** Navigation is an ordinary owner of docked widget areas. Page organization is owned by its Pages view, independently of Asset browser groups. */
export function WorkspaceNavigation({
  onInitialize,
  panelId,
  initialized,
  header,
  footer,
  items,
  onOpen,
  onSearch,
  onToggleBrowser,
  targetError,
}: Props) {
  const { openCatalog, command, layout } = useDockController();
  useEffect(() => {
    if (!initialized) onInitialize();
  }, [panelId, initialized, onInitialize]);
  const root = layout.containers[panelId];
  const empty = !root || root.kind === "stack" && root.tabs.length === 0;
  return (
    <Sidebar className="app-sidebar" aria-label="Workspace navigation">
      <SidebarHeader className="workspace-sidebar-header">
        {header}
      </SidebarHeader>
      <div className="workspace-navigation-actions space-y-0.5 px-2 pb-6">
        <Button
          variant="ghost"
          size="sm"
          className="workspace-navigation-search w-full justify-start text-fg-3"
          onClick={onSearch}
        >
          <Search className="size-4" />
          Search<span className="ml-auto text-[10px] text-fg-4">Ctrl K</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            const home = items.find((item) => item.panelId === "home");
            if (home) onOpen(home);
            else command({ type: "activate", panelId: "home" });
          }}
        >
          <Home className="size-4" />
          Home
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-fg-2"
          onClick={onToggleBrowser}
        >
          <FolderOpen className="size-4" />
          Asset browser
        </Button>
      </div>
      {targetError && (
        <p role="status" className="px-3 pb-2 text-xs text-danger">
          {targetError}
        </p>
      )}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-2"
        aria-label="Sidebar widget areas"
      >
        <DockOwnedLayout ownerId={panelId} />
      </div>
      <div className="px-2 py-2">
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start text-fg-3"
          onClick={() =>
            openCatalog({
              surface: "sidebar",
              ownerId: panelId,
              intent: empty ? "append" : "bottom",
              nodeId: empty ? undefined : root.id,
            })
          }
        >
          <Plus className="size-3.5" />
          Add sidebar area
        </Button>
      </div>
      {footer && <SidebarFooter className="workspace-sidebar-footer">
        {footer}
      </SidebarFooter>}
    </Sidebar>
  );
}

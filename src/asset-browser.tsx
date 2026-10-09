import { useMemo, useRef } from "react";
import { Box, Code2, Grid2X2, List, Plus, Trash2 } from "lucide-react";
import {
  DragSelect,
  DragSelectArea,
  DragSelectCount,
  DragSelectItem,
} from "@/components/ui/drag-select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  TableToolbar,
  TableToolbarFilter,
  TableToolbarSearch,
  TableToolbarToggle,
} from "@/components/ui/table-toolbar";
import { hasCurrentArtifact, type Asset } from "./model";
import type { BrowserView } from "./panel-layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ASSET_DRAG_TYPE } from "./workspace-search";

type Props = {
  workspaceId: string;
  workspaceName: string;
  assets: Asset[];
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onNew: (kind: "component" | "web-content") => void;
  onRename?: (id: string) => void;
  onDelete: (ids: string[]) => void;
  view: BrowserView;
  onViewChange: (view: BrowserView) => void;
  query: string;
  onQueryChange: (query: string) => void;
  filters: string[];
  onFiltersChange: (filters: string[]) => void;
  compact?: boolean;
};

function status(asset: Asset) {
  if (asset.kind === "web-content") return "Web";
  if (hasCurrentArtifact(asset)) return "Runnable";
  return asset.artifact ? "Changed" : "Source";
}

/** One browser view in either dock. Selection and filters stay with the view while it moves. */
export function AssetBrowser({
  workspaceId,
  workspaceName,
  assets,
  selected,
  onSelectedChange,
  onOpen,
  onNew,
  onRename,
  onDelete,
  view,
  onViewChange,
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  compact = false,
}: Props) {
  const contextSelection = useRef<string[]>([]);
  const visible = useMemo(
    () =>
      assets.filter((asset) => {
        const text = `${asset.name} ${asset.description}`.toLowerCase();
        return (
          text.includes(query.toLowerCase()) &&
          (!filters.length || filters.includes(status(asset).toLowerCase()))
        );
      }),
    [assets, query, filters],
  );
  const list = compact || view === "list";

  return (
    <DragSelect
      className={`asset-browser ${compact ? "is-compact" : ""}`}
      value={selected}
      onValueChange={onSelectedChange}
      onOpenItem={onOpen}
    >
      <TableToolbar
        className="asset-browser-toolbar"
        aria-label="Asset browser tools"
      >
        {selected.length > 0 ? (
          <div className="asset-browser-selection">
            <DragSelectCount noun={["asset", "assets"]} />
          </div>
        ) : (
          <span className="asset-browser-location">
            <Box size={15} strokeWidth={1.6} /> Assets
          </span>
        )}
        <TableToolbarSearch
          value={query}
          onValueChange={onQueryChange}
          shortcut={null}
          placeholder="Find an asset"
          className="asset-browser-search"
        />
        <div className="asset-browser-controls">
          {!compact && (
            <>
              <TableToolbarFilter
                label="Status"
                options={["Web", "Runnable", "Changed", "Source"].map(
                  (label) => ({ label, value: label.toLowerCase() }),
                )}
                value={filters}
                onValueChange={onFiltersChange}
              />
              <TableToolbarToggle
                aria-label="Browser view"
                options={[
                  {
                    value: "grid",
                    label: "Grid view",
                    icon: <Grid2X2 size={15} />,
                  },
                  {
                    value: "list",
                    label: "List view",
                    icon: <List size={15} />,
                  },
                ]}
                value={view}
                onValueChange={(value) => onViewChange(value as BrowserView)}
              />
            </>
          )}
          {selected.length > 0 ? (
            <div className="asset-browser-actions">
              <button
                type="button"
                onClick={() => selected[0] && onOpen(selected[0])}
              >
                {compact ? `Open ${selected.length}` : "Open"}
              </button>
              <button
                type="button"
                className="asset-browser-delete"
                title={`Delete ${selected.length} selected asset${selected.length === 1 ? "" : "s"}`}
                onClick={() => onDelete(selected)}
              >
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
              <button type="button" onClick={() => onSelectedChange([])}>
                Clear
              </button>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                size="sm"
                chevron
                className="asset-browser-new"
              >
                <Plus size={14} /> New asset
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  icon={<Code2 size={15} />}
                  onClick={() => onNew("web-content")}
                >
                  Web content
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<Box size={15} />}
                  onClick={() => onNew("component")}
                >
                  Component
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TableToolbar>
      <DragSelectArea
        label={`Assets in ${workspaceName}`}
        className="asset-browser-scroll"
        gridClassName={`asset-browser-items ${list ? "as-list" : "as-grid"}`}
        onKeyDown={(event) => {
          if (
            (event.key !== "Delete" && event.key !== "Backspace") ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
          )
            return;
          const target = event.target as HTMLElement;
          if (
            target.closest("input,textarea,select,[contenteditable],.cm-editor")
          )
            return;
          const id =
            target.closest<HTMLElement>("[data-select-id]")?.dataset.selectId;
          if (!id) return;
          event.preventDefault();
          onDelete(selected.includes(id) ? selected : [id]);
        }}
      >
        {visible.map((asset) => (
          <ContextMenu key={asset.id}>
            <ContextMenuTrigger
              className="asset-browser-context"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  ASSET_DRAG_TYPE,
                  JSON.stringify({ workspaceId, assetId: asset.id }),
                );
                event.dataTransfer.effectAllowed = "copy";
              }}
              tabIndex={0}
              aria-label={`${asset.name} options`}
              onContextMenu={() => {
                contextSelection.current = selected.includes(asset.id)
                  ? [...selected]
                  : [asset.id];
                if (!selected.includes(asset.id)) onSelectedChange([asset.id]);
              }}
            >
              <DragSelectItem
                value={asset.id}
                label={asset.name}
                className="asset-browser-item"
              >
                <span className="asset-browser-icon">
                  {asset.kind === "web-content" ? (
                    <Code2 size={list ? 20 : 31} strokeWidth={1.35} />
                  ) : (
                    <Box size={list ? 20 : 31} strokeWidth={1.35} />
                  )}
                </span>
                <span className="asset-browser-meta">
                  <strong>{asset.name}</strong>
                  <small>
                    {asset.kind === "web-content" ? "Web content" : "Component"}
                  </small>
                </span>
              </DragSelectItem>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onOpen(asset.id)}>
                Open {asset.name}
              </ContextMenuItem>
              {onRename && (
                <ContextMenuItem onClick={() => onRename(asset.id)}>
                  Rename
                </ContextMenuItem>
              )}
              <ContextMenuItem
                variant="danger"
                onClick={() => onDelete(contextSelection.current)}
              >
                Delete{" "}
                {selected.includes(asset.id) && selected.length > 1
                  ? `${selected.length} assets`
                  : asset.name}
                <ContextMenuShortcut keys="delete" />
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onNew("web-content")}>
                New web content
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onNew("component")}>
                New Component
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
        {visible.length === 0 && (
          <div className="asset-browser-empty">
            {assets.length === 0
              ? "No assets yet. Create one to get started."
              : "No assets match this search."}
          </div>
        )}
      </DragSelectArea>
    </DragSelect>
  );
}

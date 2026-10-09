import { navigationItems, type NavigationFilter } from "@/navigation-filter";
import { useState, type ReactNode } from "react";
import {
  Box,
  Check,
  Code2,
  PanelsTopLeft,
  Pencil,
  Pin,
  Search,
  X,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { IconAction } from "@/components/ui/icon-action";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NavigationFilterEditor } from "./navigation-filter-editor";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { scoreCommand } from "@/lib/command-search";
import { ASSET_DRAG_TYPE, type WorkspaceSearchItem } from "@/workspace-search";

type Props = {
  workspaceId: string;
  header: ReactNode;
  footer: ReactNode;
  items: WorkspaceSearchItem[];
  filter: NavigationFilter;
  onFilterChange: (filter: NavigationFilter) => void;
  activePanelId: string;
  activeAssetId?: string;
  onOpen: (item: WorkspaceSearchItem) => void;
  onSearch: () => void;
};

/** A live saved search with explicit pins and exclusions, hosted by the existing navigation dock panel. */
export function WorkspaceNavigation({
  workspaceId,
  header,
  footer,
  items,
  filter,
  onFilterChange,
  activePanelId,
  activeAssetId,
  onOpen,
  onSearch,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState("");
  const visible = navigationItems(
    items,
    filter,
    (item, query) => scoreCommand(item, query) !== null,
  );
  const patch = (value: Partial<NavigationFilter>) =>
    onFilterChange({ ...filter, ...value });
  function pin(id: string) {
    patch({
      pinned: [...new Set([...filter.pinned, id])],
      excluded: filter.excluded.filter((entry) => entry !== id),
    });
  }
  function remove(id: string) {
    patch({
      pinned: filter.pinned.filter((entry) => entry !== id),
      excluded: [...new Set([...filter.excluded, id])],
    });
  }
  return (
    <Sidebar
      className="app-sidebar group/navigation"
      aria-label="Workspace navigation"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragOver(false);
      }}
      onDrop={(event) => {
        const data = event.dataTransfer.getData(ASSET_DRAG_TYPE);
        if (!data) return;
        event.preventDefault();
        event.stopPropagation();
        setDragOver(false);
        try {
          const value = JSON.parse(data);
          if (
            value.workspaceId === workspaceId &&
            items.some((item) => item.id === `asset:${value.assetId}`)
          ) {
            pin(`asset:${value.assetId}`);
            setNotice("Asset pinned to navigation");
          }
        } catch {
          /* Other drag payloads carry no navigation authority. */
        }
      }}
    >
      <SidebarHeader className="station-brand-header">{header}</SidebarHeader>
      <SidebarContent
        className={cn(
          "relative",
          dragOver && "outline-2 -outline-offset-2 outline-fg-3",
        )}
      >
        <div className="flex min-h-10 items-center justify-between gap-2 px-2 pt-2">
          <span className="text-xs font-medium text-fg-3">Your workspace</span>
          <div className="flex gap-1 opacity-100 pointer-fine:opacity-0 group-hover/navigation:opacity-100 group-focus-within/navigation:opacity-100">
            <Popover
              onOpenChange={(open) => {
                if (open) setEditing(true);
              }}
            >
              <PopoverTrigger
                variant="ghost"
                size="sm"
                aria-label="Edit navigation filter"
                className="size-7 p-0"
              >
                <Pencil size={13} />
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                size="md"
                arrow={false}
                aria-label="Navigation filter"
              >
                <NavigationFilterEditor
                  items={items}
                  filter={filter}
                  onChange={onFilterChange}
                />
              </PopoverContent>
            </Popover>
            {editing && (
              <IconAction
                label="Done editing navigation"
                className="size-7! border-0! bg-transparent!"
                onClick={() => setEditing(false)}
              >
                <Check size={14} />
              </IconAction>
            )}
          </div>
        </div>
        {(filter.query || filter.excluded.length > 0) && (
          <div className="flex items-center gap-1 px-2 pb-1 text-[11px] text-fg-4">
            <Search size={11} />
            <span className="truncate">
              {filter.query || "Custom selection"}
            </span>
            {filter.excluded.length > 0 && (
              <span className="ml-auto shrink-0">
                {filter.excluded.length} hidden
              </span>
            )}
          </div>
        )}
        <nav
          aria-label="Saved navigation"
          className="flex flex-col gap-0.5 p-1"
        >
          {visible.map((item) => {
            const pinned = filter.pinned.includes(item.id);
            const active = item.assetId
              ? item.assetId === activeAssetId
              : item.panelId === activePanelId;
            const Icon =
              item.kind === "panels"
                ? PanelsTopLeft
                : item.hint === "Component"
                  ? Box
                  : Code2;
            return (
              <div
                key={item.id}
                className="group/row flex min-w-0 items-center gap-0.5"
              >
                <button
                  type="button"
                  data-sidebar-row=""
                  aria-current={active ? "page" : undefined}
                  className="flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-fg-2 hover:bg-hover hover:text-fg aria-[current=page]:bg-hover aria-[current=page]:text-fg focus-visible:outline-2 focus-visible:outline-fg-3"
                  onClick={() => onOpen(item)}
                >
                  <Icon size={15} className="shrink-0 text-fg-3" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {pinned && (
                    <Pin
                      size={10}
                      className="shrink-0 text-fg-4"
                      aria-label="Pinned"
                    />
                  )}
                </button>
                {editing && (
                  <IconAction
                    label={`Remove ${item.label} from navigation`}
                    className="size-7! border-0! bg-transparent!"
                    onClick={(event) => {
                      const row = event.currentTarget.parentElement;
                      const next =
                        row?.nextElementSibling?.querySelector<HTMLButtonElement>(
                          "button",
                        ) ??
                        row?.previousElementSibling?.querySelector<HTMLButtonElement>(
                          "button",
                        ) ??
                        row
                          ?.closest("aside")
                          ?.querySelector<HTMLButtonElement>(
                            '[aria-label="Done editing navigation"]',
                          );
                      remove(item.id);
                      requestAnimationFrame(() => {
                        if (next?.isConnected) next.focus();
                      });
                    }}
                  >
                    <X size={12} />
                  </IconAction>
                )}
              </div>
            );
          })}
          {visible.length === 0 && (
            <div className="px-2 py-5 text-xs leading-relaxed text-fg-3">
              No matching items. Edit the filter or pin an asset to keep it
              here.
            </div>
          )}
        </nav>
        <div className="px-3 pt-3 text-[11px] leading-relaxed text-fg-4">
          {dragOver
            ? "Drop to pin this asset"
            : "Drag assets here to pin them."}
        </div>
        <span className="sr-only" role="status">
          {notice}
        </span>
      </SidebarContent>
      <SidebarFooter className="workspace-sidebar-footer">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-2 text-fg-3"
          onClick={onSearch}
        >
          <Search size={14} /> Search workspace
        </Button>
        {footer}
      </SidebarFooter>
    </Sidebar>
  );
}

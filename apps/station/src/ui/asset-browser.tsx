import { isBuiltinIconAsset } from "../core/builtin-icons";
import { scriptAssetLabel } from "../core/script-assets";
import { NewAssetMenu } from "./components/workspace/new-asset-menu";
import { isBuiltinDeskTemplate } from "../core/desk-templates";
const isBuiltinWidgetAsset = (id: string) => isBuiltinWidgetDefinition(id) || isBuiltinIconAsset(id) || isBuiltinDeskTemplate(id);
import { BUILTIN_GROUP_ID, normalizeAssetGroups, type AssetGroup } from "../core/asset-groups";
import { CollectionHierarchy, useCollectionNavigation } from "./components/ui/collection-hierarchy";
import { ContentToolbar } from "./components/ui/content-toolbar";
import { AssetInspector } from "./components/workspace/asset-inspector";
import { IconAction } from "./components/ui/icon-action";
import { FolderPlus, PanelRight } from "lucide-react";
import { isBuiltinWidgetAsset as isBuiltinWidgetDefinition } from "../core/widget-definitions";
import { useEffect, useMemo, useRef, useState } from "react";
import { beginAssetReferenceDrag } from "./lib/asset-reference-drag";
import { deps } from "../composition";
import { stationAssetCatalog as assetCatalog, type AssetCatalog } from "@station/capabilities";
import { Box, Code2, Grid2X2, List, Plus, Trash2 } from "lucide-react";
import {
  DragSelect,
  DragSelectArea,
  DragSelectCount,
  DragSelectItem,
} from "./components/ui/drag-select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from "./components/ui/context-menu";
import {
  TableToolbar,
  TableToolbarFilter,
  TableToolbarSearch,
  TableToolbarToggle,
} from "./components/ui/table-toolbar";
import { hasCurrentArtifact, type Asset } from "../core/asset-state";
import type { BrowserView } from "../core/panel-layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { ASSET_DRAG_TYPE } from "./workspace-search";
import { useDockController } from "./docking/react";
import type { Workspace } from "../core/workspace-state";
import { AssetOpenDialog } from "./components/workspace/asset-open-dialog";

type Props = {
  workspace: Workspace;
  onFork: (asset: Asset) => void;
  workspaceId: string;
  workspaceName: string;
  onPatchMetadata: (id: string, patch: { name?: string; description?: string }) => void;
  canEdit: (id: string) => boolean;
  assets: Asset[];
  groups: AssetGroup[];
  onGroupsChange: (groups: AssetGroup[]) => void;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onNew: (kind: Asset["kind"], scriptMode?: "javascript") => void;
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
  if (asset.kind === "note") return "Rich note";
  if (asset.kind === "markdown") return "Markdown";
  if (asset.kind === "custom") return "Custom document";
  if (asset.kind === "script") return asset.files?.["program.json"] ? "TypeScript" : "JavaScript";
  if (asset.kind === "data-source") return "Data";
  if (asset.kind === "svg") return "SVG";
  if (asset.kind === "decision") return "Decision";
  if (asset.kind === "desk-template") return isBuiltinDeskTemplate(asset.id) ? "Built-in" : "Template";
  if (asset.kind === "widget-definition") return isBuiltinWidgetAsset(asset.id) ? "Built-in" : "Widget";
  if (asset.kind === "web-content") return "Web";
  if (asset.kind !== "component")
    return asset.kind === "theme" ? "Theme" : "Package";
  if (hasCurrentArtifact(asset)) return "Runnable";
  return asset.artifact ? "Changed" : "Source";
}

/** One browser view in either dock. Selection and filters stay with the view while it moves. */
export function AssetBrowser({
  workspace, onFork,
  workspaceId,
  workspaceName,
  assets: suppliedAssets,
  onPatchMetadata,
  canEdit,
  groups: rawGroups,
  onGroupsChange,
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
  const dock = useDockController();
  const catalog = useRef<AssetCatalog | null>(null);
  const [catalogIds, setCatalogIds] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    const scope = deps.openScope(workspaceId, "Asset browser · catalog reader");
    void scope.acquire(assetCatalog).then(handle => {
      if (!active) return;
      catalog.current = handle.value;
      setCatalogIds(handle.value.list().map(a => a.id));
    }).catch(console.error);
    return () => { active = false; catalog.current = null; void scope.revoke().catch(console.error); };
  }, [workspaceId, workspace.activeDeskId]);
  useEffect(() => { if (catalog.current) setCatalogIds(catalog.current.list().map(a => a.id)); }, [suppliedAssets]);
  const catalogEntries = deps.control.execute({ method: "assets.catalog" }).result as { id: string }[];
  const assets = suppliedAssets.filter(a => catalogEntries.some(entry => entry.id === a.id) && (isBuiltinWidgetAsset(a.id) || catalogIds.includes(a.id)));
  const [opening, setOpening] = useState<Asset | null>(null);
  const openAs = (assetId: string, mode: "peek" | "modal" | "full") => {
    const result = dock.command({ type: "openAsset", assetId });
    if (!result.ok) return;
    const panelId = result.panelId ?? `asset-view:${assetId}`;
    if (mode === "peek") dock.command({ type: "presentPanel", panelId, mode: "peek", edge: "right" });
    else if (mode === "modal") dock.focusPanel(panelId);
    else dock.command({ type: "maximize", panelId });
  };
  const groups = useMemo(() => normalizeAssetGroups(rawGroups, assets.filter(asset => !isBuiltinWidgetAsset(asset.id)).map(asset => asset.id)), [rawGroups, assets]);
  const variantRoots = new Map<string, string[]>();
  for (const asset of assets.filter(a => a.origin)) {
    let root = asset.origin!.assetId; const seen = new Set([asset.id]);
    while (!seen.has(root)) { seen.add(root); const parent = assets.find(a => a.id === root)?.origin?.assetId; if (!parent) break; root = parent; }
    variantRoots.set(root, [...(variantRoots.get(root) ?? []), asset.id]);
  }
  const groupedVariants = new Set([...variantRoots].flatMap(([root, children]) => [root, ...children]));
  const builtinCategory = (asset: Asset) => asset.kind === "svg" ? "icons" : asset.kind === "desk-template" ? "desks" : /shell|stack|layout|navigation|widget-list/.test(asset.id) ? "layouts" : /editor|inspector|source|program/.test(asset.id) ? "authoring" : "widgets";
  const builtinGroups = [["icons", "Icons"], ["layouts", "Layouts & navigation"], ["widgets", "Widgets"], ["authoring", "Editors & tools"], ["desks", "Desk templates"]] as const;
  const builtinParent = (id: string) => `${BUILTIN_GROUP_ID}:${builtinCategory(assets.find(a => a.id === id)!)}`;
  const collectionGroups = [...groups.map(group => ({ ...group, itemIds: group.assetIds.filter(id => !groupedVariants.has(id)) })),
    { id: BUILTIN_GROUP_ID, name: "Built-in", parentId: null, itemIds: [], readOnly: true },
    ...builtinGroups.map(([id, name]) => ({ id: `${BUILTIN_GROUP_ID}:${id}`, name, parentId: BUILTIN_GROUP_ID, itemIds: assets.filter(asset => isBuiltinWidgetAsset(asset.id) && builtinCategory(asset) === id && !groupedVariants.has(asset.id)).map(asset => asset.id), readOnly: true })),
    ...[...variantRoots].map(([root, children]) => ({ id: `variants:${root}`, name: `${assets.find(a => a.id === root)?.name ?? "Missing source"} · variants`, parentId: isBuiltinWidgetAsset(root) ? builtinParent(root) : groups.find(g => g.assetIds.includes(root))?.id ?? null, itemIds: [...(assets.some(a => a.id === root) ? [root] : []), ...children], readOnly: true }))];
  const navigation = useCollectionNavigation(collectionGroups);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [parentGroup, setParentGroup] = useState<string | null>(null);
  const editGroup = (id: string) => { const group = groups.find(item => item.id === id); if (group) { setEditingGroup(id); setParentGroup(group.parentId); setGroupName(group.name); setCreatingGroup(true); } };
  const eligibleParents = groups.filter(group => {
    let current: AssetGroup | undefined = group;
    while (current) { if (current.id === editingGroup) return false; current = groups.find(item => item.id === current!.parentId); }
    return true;
  });
  const [groupDrop, setGroupDrop] = useState<string | null>(null), [groupError, setGroupError] = useState("");
  const groupingPointer = useRef<(() => void) | null>(null);
  const referencePointer = useRef<(() => void) | null>(null);
  useEffect(() => () => referencePointer.current?.(), []);
  useEffect(() => () => groupingPointer.current?.(), []);
  const moveAssets = (ids: string[], groupId: string | null) => { try { deps.control.execute({ method: "assets.group.move", params: { assetIds: ids, groupId } }); setGroupError(""); } catch (error) { setGroupError(error instanceof Error ? error.message : String(error)); } };
  const dropAssets = (event: React.DragEvent, groupId: string | null) => {
    event.preventDefault(); event.stopPropagation(); setGroupDrop(null);
    try { const data = JSON.parse(event.dataTransfer.getData(ASSET_DRAG_TYPE)); if (data.workspaceId !== workspaceId) throw new Error("Choose assets from this workspace"); const ids = data.assetIds ?? [data.assetId]; if (!Array.isArray(ids) || ids.some(id => !canEdit(id))) throw new Error("The selected assets are read-only"); moveAssets(ids, groupId); } catch (error) { setGroupError(error instanceof Error ? error.message : String(error)); }
  };
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
  const deletable = selected.filter(id => !isBuiltinWidgetAsset(id));
  const list = view === "list";

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
        <ContentToolbar left={<div className="flex items-center gap-1">{navigation.controls}</div>} center={
        <TableToolbarSearch
          value={query}
          onValueChange={onQueryChange}
          shortcut={null}
          placeholder="Find an asset"
          className="asset-browser-search"
        />
        } right={<div className="asset-browser-controls">
          <IconAction label="New group" disabled={!!navigation.current?.readOnly} onClick={() => { setEditingGroup(null); setGroupName(""); setParentGroup(navigation.current?.id ?? null); setCreatingGroup(true); }}><FolderPlus size={15} /></IconAction>
          <IconAction label="Toggle asset inspector" aria-pressed={inspectorOpen} onClick={() => setInspectorOpen(!inspectorOpen)}><PanelRight size={15} /></IconAction>
          {(
            <>
              <TableToolbarFilter
                label="Status"
                options={["Web", "Runnable", "Changed", "Source", "Widget", "Built-in", "Theme", "Package", "TypeScript", "JavaScript", "Markdown", "Rich note", "Data", "SVG", "Decision", "Template"].map(
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
                    label: "Tree view",
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
                disabled={!deletable.length}
                onClick={() => onDelete(deletable)}
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
                <NewAssetMenu onNew={onNew} />
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>} />
      </TableToolbar>
      <div className="asset-browser-path" onDragOver={e => { if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = navigation.current?.readOnly ? "none" : "move"; } }} onDrop={e => dropAssets(e, navigation.current?.id ?? null)}>{navigation.breadcrumb}{selected.length > 0 && <DragSelectCount noun={["asset", "assets"]} />}</div>
      {creatingGroup && <form className="asset-group-form" onSubmit={event => {
        event.preventDefault(); if (!groupName.trim()) return;
        onGroupsChange(editingGroup ? groups.map(group => group.id === editingGroup ? { ...group, name: groupName.trim(), parentId: parentGroup } : group) : [...groups, { id: crypto.randomUUID(), name: groupName.trim(), parentId: parentGroup, assetIds: [] }]);
        setGroupName(""); setCreatingGroup(false); setEditingGroup(null);
      }}><input autoFocus aria-label="Group name" placeholder="Group name" value={groupName} onChange={event => setGroupName(event.target.value)} />
        <select aria-label="Parent group" value={parentGroup ?? ""} onChange={event => setParentGroup(event.target.value || null)}><option value="">All assets</option>{eligibleParents.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
        <button type="submit">{editingGroup ? "Save group" : "Create group"}</button>
        {editingGroup && <button type="button" onClick={() => { const parent = groups.find(group => group.id === editingGroup)?.parentId ?? null; onGroupsChange(groups.filter(group => group.id !== editingGroup).map(group => group.parentId === editingGroup ? { ...group, parentId: parent } : group)); setCreatingGroup(false); setEditingGroup(null); }}>Remove group</button>}
        <button type="button" onClick={() => setCreatingGroup(false)}>Cancel</button>
      </form>}
      {groupError && <p role="alert" className="px-3 py-2 text-xs text-danger">{groupError}</p>}
      <div className="asset-browser-body" data-group-drop={groupDrop ?? undefined} onDragOver={event => {
        if (!event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-group-id]");
        if (!target) return; event.preventDefault(); event.stopPropagation();
        event.dataTransfer.dropEffect = target.dataset.groupReadonly ? "none" : "move"; setGroupDrop(target.dataset.groupId ?? null);
      }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGroupDrop(null); }} onDrop={event => { const target = (event.target as HTMLElement).closest<HTMLElement>("[data-group-id]"); if (target) dropAssets(event, target.dataset.groupId ?? null); }}>
      <ContextMenu>
      <ContextMenuTrigger render={<div className="flex min-h-0 min-w-0 flex-1 flex-col" />} tabIndex={0} aria-label="Asset collection context menu">
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
        <CollectionHierarchy groups={collectionGroups} items={visible} parentId={navigation.current?.id ?? null} queryActive={!!query || !!filters.length} list={list} navigate={navigation.navigate} onEditGroup={editGroup} renderItem={(asset) => (
          <ContextMenu key={asset.id}>
            <ContextMenuTrigger
              className="asset-browser-context"
              draggable={false}
              onPointerDown={(event) => {
                if (event.button !== 0 || event.pointerType === "touch" || event.ctrlKey || event.metaKey || event.shiftKey || isBuiltinWidgetAsset(asset.id) || (event.target as HTMLElement).closest("[data-asset-reference-drag]")) return;
                event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); groupingPointer.current?.();
                const start = { x: event.clientX, y: event.clientY }, ids = selected.includes(asset.id) ? selected : [asset.id];
                const move = (e: PointerEvent) => { if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return; const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-group-id]"); setGroupDrop(target?.dataset.groupId ?? null); };
                const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); groupingPointer.current = null; setGroupDrop(null); };
                const cancel = () => stop();
                const up = (e: PointerEvent) => { stop(); const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 6; const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-group-id]"); if (moved && target) { if (ids.some(id => !canEdit(id))) setGroupError("The selected assets are read-only"); else moveAssets(ids, target.dataset.groupId ?? null); } else if (!moved) onSelectedChange(ids); };
                groupingPointer.current = stop; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true }); window.addEventListener("pointercancel", cancel, { once: true });
              }}
              onDragStart={(event) => {
                // Read-only definitions may still be referenced. This drag
                // exports identity only; grouping/source edits retain their guards.
                event.dataTransfer.setData(
                  ASSET_DRAG_TYPE,
                  JSON.stringify({ workspaceId, assetId: asset.id, assetIds: selected.includes(asset.id) ? selected : [asset.id] }),
                );
                event.dataTransfer.effectAllowed = "copyMove";
              }}
              tabIndex={0}
              aria-label={`${asset.name} options`}
              onContextMenu={(event) => {
                event.stopPropagation();
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
                <span className="asset-browser-icon data-[reference-dragging]:opacity-50" data-asset-reference-drag draggable title="Drag asset reference to a compatible field" onPointerDown={event => {
                  if (event.button !== 0) return;
                  event.preventDefault(); event.stopPropagation(); referencePointer.current?.();
                  referencePointer.current = beginAssetReferenceDrag(event.nativeEvent, event.currentTarget, { workspaceId, assetId: asset.id });
                }}>
                  {asset.kind === "web-content" ? (
                    <Code2 size={list ? 20 : 31} strokeWidth={1.35} />
                  ) : (
                    <Box size={list ? 20 : 31} strokeWidth={1.35} />
                  )}
                </span>
                <span className="asset-browser-meta">
                  <strong>{asset.name}</strong>
                  <small>
                    {asset.kind === "widget-definition" ? (isBuiltinWidgetAsset(asset.id) ? "Built-in · read-only" : "Widget definition") : asset.kind === "web-content"
                      ? "Web content"
                      : asset.kind === "component"
                        ? "Component"
                        : asset.kind === "theme"
                          ? "Theme"
                          : asset.kind === "markdown" ? "Markdown" : asset.kind === "note" ? "Rich note" : asset.kind === "custom" ? "Custom document" : asset.kind === "data-source" ? "Data source" : asset.kind === "script" ? scriptAssetLabel(asset) : asset.kind === "svg" ? "SVG" : asset.kind === "decision" ? "Decision policy" : "Package"}
                  </small>
                </span>
              </DragSelectItem>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onOpen(asset.id)}>
                Open {asset.name}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => setOpening(asset)}>Open with…</ContextMenuItem>
              <ContextMenuItem onClick={() => onFork(asset)}>Create source variant…</ContextMenuItem>
              <ContextMenuItem onClick={() => openAs(asset.id, "peek")}>Open in side peek</ContextMenuItem>
              <ContextMenuItem onClick={() => openAs(asset.id, "modal")}>Open in modal</ContextMenuItem>
              <ContextMenuItem onClick={() => openAs(asset.id, "full")}>Open full screen</ContextMenuItem>
              {onRename && !isBuiltinWidgetAsset(asset.id) && (
                <ContextMenuItem onClick={() => onRename(asset.id)}>
                  Rename
                </ContextMenuItem>
              )}
              <ContextMenuItem
                disabled={isBuiltinWidgetAsset(asset.id)}
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
              <ContextMenuSub><ContextMenuSubTrigger>New Asset</ContextMenuSubTrigger><ContextMenuSubContent><NewAssetMenu onNew={onNew} /></ContextMenuSubContent></ContextMenuSub>
            </ContextMenuContent>
          </ContextMenu>
        )} />
        {visible.length === 0 && (
          <div className="asset-browser-empty">
            {assets.length === 0
              ? "No assets yet. Create one to get started."
              : "No assets match this search."}
          </div>
        )}
      </DragSelectArea>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuSub><ContextMenuSubTrigger>New Asset</ContextMenuSubTrigger><ContextMenuSubContent><NewAssetMenu onNew={onNew} /></ContextMenuSubContent></ContextMenuSub>
        <ContextMenuItem onClick={() => { setEditingGroup(null); setGroupName(""); setParentGroup(groups.some(g => g.id === navigation.current?.id) ? navigation.current!.id : null); setCreatingGroup(true); }}>New group</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onViewChange(list ? "grid" : "list")}>{list ? "Grid view" : "Tree view"}</ContextMenuItem>
        <ContextMenuItem onClick={() => setInspectorOpen(!inspectorOpen)}>{inspectorOpen ? "Hide inspector" : "Show inspector"}</ContextMenuItem>
        <ContextMenuItem disabled={!selected.length} onClick={() => onSelectedChange([])}>Clear selection</ContextMenuItem>
      </ContextMenuContent>
      </ContextMenu>
      {inspectorOpen && <AssetInspector workspace={workspace} onFork={onFork} onOpenWith={setOpening} onPatchMetadata={onPatchMetadata} canEdit={canEdit} assets={assets.filter(asset => selected.includes(asset.id))} groups={groups} onMove={moveAssets} onOpen={onOpen} onRename={onRename} onClose={() => setInspectorOpen(false)} />}
      </div>
      {opening && <AssetOpenDialog asset={opening} workspace={workspace} onClose={() => setOpening(null)} />}
    </DragSelect>
  );
}

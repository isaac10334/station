import { useMemo, useRef } from "react";
import { Box, Code2, Grid2X2, List, Plus, Trash2 } from "lucide-react";
import { DragSelect, DragSelectArea, DragSelectCount, DragSelectItem } from "@/components/ui/drag-select";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  TableToolbar,
  TableToolbarFilter,
  TableToolbarSearch,
  TableToolbarToggle,
} from "@/components/ui/table-toolbar";
import { hasCurrentArtifact, type Unit } from "./model";
import type { BrowserView } from "./panel-layout";

type Props = {
  workspaceName: string;
  units: Unit[];
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

function status(unit: Unit) {
  if (unit.kind === "web-content") return "Web";
  if (hasCurrentArtifact(unit)) return "Runnable";
  return unit.artifact ? "Changed" : "Source";
}

/** One browser view in either dock. Selection and filters stay with the view while it moves. */
export function UnitBrowser({ workspaceName, units, selected, onSelectedChange, onOpen, onNew, onRename, onDelete, view, onViewChange, query, onQueryChange, filters, onFiltersChange, compact = false }: Props) {
  const contextSelection = useRef<string[]>([]);
  const visible = useMemo(() => units.filter((unit) => {
    const text = `${unit.name} ${unit.description}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (!filters.length || filters.includes(status(unit).toLowerCase()));
  }), [units, query, filters]);
  const list = compact || view === "list";

  return <DragSelect className={`unit-browser ${compact ? "is-compact" : ""}`} value={selected} onValueChange={onSelectedChange} onOpenItem={onOpen}>
    <TableToolbar className="unit-browser-toolbar" aria-label="Unit browser tools">
      {selected.length > 0
        ? <div className="unit-browser-selection"><DragSelectCount noun={["unit", "units"]} /></div>
        : <span className="unit-browser-location"><Box size={15} strokeWidth={1.6} /> Units</span>}
      <TableToolbarSearch value={query} onValueChange={onQueryChange} shortcut={null} placeholder="Find a unit" className="unit-browser-search" />
      <div className="unit-browser-controls">{!compact && <>
        <TableToolbarFilter label="Status" options={["Web", "Runnable", "Changed", "Source"].map((label) => ({ label, value: label.toLowerCase() }))} value={filters} onValueChange={onFiltersChange} />
        <TableToolbarToggle aria-label="Browser view" options={[{ value: "grid", label: "Grid view", icon: <Grid2X2 size={15} /> }, { value: "list", label: "List view", icon: <List size={15} /> }]} value={view} onValueChange={(value) => onViewChange(value as BrowserView)} />
      </>}
      {selected.length > 0 ? <div className="unit-browser-actions">
        <button type="button" onClick={() => selected[0] && onOpen(selected[0])}>{compact ? `Open ${selected.length}` : "Open"}</button>
        <button type="button" className="unit-browser-delete" title={`Delete ${selected.length} selected unit${selected.length === 1 ? "" : "s"}`} onClick={() => onDelete(selected)}><Trash2 size={14} /><span>Delete</span></button>
        <button type="button" onClick={() => onSelectedChange([])}>Clear</button>
      </div> : <div className="unit-browser-actions"><button type="button" className="unit-browser-new" onClick={() => onNew("web-content")}><Plus size={14} /><span>Web content</span></button><button type="button" className="unit-browser-new" onClick={() => onNew("component")}><Plus size={14} /><span>Component</span></button></div>}</div>
    </TableToolbar>
    <DragSelectArea label={`Units in ${workspaceName}`} className="unit-browser-scroll" gridClassName={`unit-browser-items ${list ? "as-list" : "as-grid"}`} onKeyDown={(event) => {
      if (event.key !== "Delete" && event.key !== "Backspace" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable],.cm-editor")) return;
      const id = target.closest<HTMLElement>("[data-select-id]")?.dataset.selectId;
      if (!id) return;
      event.preventDefault();
      onDelete(selected.includes(id) ? selected : [id]);
    }}>
      {visible.map((unit) => <ContextMenu key={unit.id}>
        <ContextMenuTrigger className="unit-browser-context" tabIndex={0} aria-label={`${unit.name} options`} onContextMenu={() => { contextSelection.current = selected.includes(unit.id) ? [...selected] : [unit.id]; if (!selected.includes(unit.id)) onSelectedChange([unit.id]); }}>
        <DragSelectItem value={unit.id} label={unit.name} className="unit-browser-item">
        <span className="unit-browser-icon">{unit.kind === "web-content" ? <Code2 size={list ? 20 : 31} strokeWidth={1.35} /> : <Box size={list ? 20 : 31} strokeWidth={1.35} />}</span>
        <span className="unit-browser-meta"><strong>{unit.name}</strong><small>{unit.kind === "web-content" ? "Web content" : "Component"}</small></span>
        </DragSelectItem></ContextMenuTrigger>
        <ContextMenuContent><ContextMenuItem onClick={() => onOpen(unit.id)}>Open {unit.name}</ContextMenuItem>
          {onRename && <ContextMenuItem onClick={() => onRename(unit.id)}>Rename</ContextMenuItem>}
          <ContextMenuItem variant="danger" onClick={() => onDelete(contextSelection.current)}>Delete {selected.includes(unit.id) && selected.length > 1 ? `${selected.length} units` : unit.name}<ContextMenuShortcut keys="delete" /></ContextMenuItem>
          <ContextMenuSeparator /><ContextMenuItem onClick={() => onNew("web-content")}>New web content</ContextMenuItem><ContextMenuItem onClick={() => onNew("component")}>New Component</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>)}
      {visible.length === 0 && <div className="unit-browser-empty">{units.length === 0 ? "No units yet. Create one to get started." : "No units match this search."}</div>}
    </DragSelectArea>
  </DragSelect>;
}

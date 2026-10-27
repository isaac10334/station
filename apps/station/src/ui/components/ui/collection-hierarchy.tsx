import { Fragment, useState, type ReactNode } from "react";
import { ChevronRight, Folder, Lock, ArrowUp, ArrowLeft, ArrowRight, ScanSearch, Settings2 } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { IconAction } from "./icon-action";

/** View-only groups over stable items. Navigation history and disclosure are independent. */
export type CollectionGroup = { id: string; name: string; parentId: string | null; itemIds: string[]; readOnly?: boolean };
export function useCollectionNavigation(groups: CollectionGroup[]) {
  const [history, setHistory] = useState<(string | null)[]>([null]);
  const [index, setIndex] = useState(0);
  const current = groups.find(group => group.id === history[index]) ?? null;
  const navigate = (id: string | null) => {
    if (id === current?.id || (!id && !current)) return;
    setHistory(previous => [...previous.slice(0, index + 1), id]); setIndex(index + 1);
  };
  const breadcrumbs: CollectionGroup[] = [];
  let ancestor = current;
  while (ancestor && !breadcrumbs.includes(ancestor)) { breadcrumbs.unshift(ancestor); ancestor = groups.find(group => group.id === ancestor!.parentId) ?? null; }
  const controls = <>
    <IconAction label="Back in asset browser" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={14} /></IconAction>
    <IconAction label="Forward in asset browser" disabled={index === history.length - 1} onClick={() => setIndex(index + 1)}><ArrowRight size={14} /></IconAction>
    <IconAction label="Up to parent group" disabled={!current} onClick={() => navigate(current?.parentId ?? null)}><ArrowUp size={14} /></IconAction>
  </>;
  const breadcrumb = <nav className="collection-breadcrumb" aria-label="Asset breadcrumb"><button type="button" onClick={() => navigate(null)}>All assets</button>{breadcrumbs.map(group => <span key={group.id}><ChevronRight size={12} /><button type="button" aria-current={group.id === current?.id ? "location" : undefined} onClick={() => navigate(group.id)}>{group.name}</button></span>)}</nav>;
  return { current, navigate, controls, breadcrumb };
}

/** A flat grid keeps group tiles and expanded members on the same tracks.
 * A subtle continuous run identifies related cells across row wraps. Tree mode
 * keeps the same disclosure/navigation state with ordinary nested branches.
 */
export function CollectionHierarchy<T extends { id: string }>({ groups, items, parentId, queryActive, list, navigate, renderItem, onEditGroup }: {
  groups: CollectionGroup[]; items: T[]; parentId: string | null; queryActive: boolean; list: boolean;
  navigate: (id: string) => void; renderItem: (item: T) => ReactNode; onEditGroup?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Map<string, boolean>>(new Map());
  const [limits, setLimits] = useState<Record<string, number>>({});
  const placed = new Set(groups.flatMap(group => group.itemIds));
  const matches = (group: CollectionGroup): boolean => items.some(item => group.itemIds.includes(item.id)) || groups.some(child => child.parentId === group.id && matches(child));
  const toggle = (id: string, open: boolean) => setExpanded(previous => new Map(previous).set(id, open));
  const render = (parent: string | null, run?: string): ReactNode => <>
    {groups.filter(group => group.parentId === parent && (!queryActive || matches(group))).map(group => {
      const open = expanded.get(group.id) ?? queryActive;
      const children = items.filter(item => group.itemIds.includes(item.id));
      const limit = limits[group.id] ?? 20;
      const count = children.length + groups.filter(item => item.parentId === group.id).length;
      const controls = <>
        <IconAction label={`${open ? "Collapse" : "Expand"} ${group.name}`} aria-expanded={open} onClick={() => toggle(group.id, !open)}><ChevronRight size={14} className={open ? "rotate-90" : ""} /></IconAction>
        {!group.readOnly && onEditGroup && <IconAction label={`Edit ${group.name} group`} onClick={() => onEditGroup(group.id)}><Settings2 size={14} /></IconAction>}
      </>;
      const members = <>{render(group.id, run ?? group.id)}{children.slice(0, limit).map(item => list ? renderItem(item) : <div key={item.id} className="collection-grid-member" data-collection-run={run ?? group.id}>{renderItem(item)}</div>)}{children.length > limit && <button type="button" className="collection-more-tile" data-collection-run={run ?? group.id} onClick={() => setLimits(previous => ({ ...previous, [group.id]: limit + 20 }))}><strong>{children.length - limit} more</strong><span>Show next 20</span></button>}</>;
      if (list) return <section key={group.id} className="collection-tree-group" aria-label={`${group.name} group`}>
        <div className="collection-tree-row" data-group-id={group.id} data-group-readonly={group.readOnly || undefined}><IconAction label={`${open ? "Collapse" : "Expand"} ${group.name}`} aria-expanded={open} onClick={() => toggle(group.id, !open)}><ChevronRight size={14} className={open ? "rotate-90" : ""} /></IconAction><Folder size={16} /><button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => toggle(group.id, !open)}>{group.name}</button>{group.readOnly && <Lock size={12} />}<StatusBadge>{count}</StatusBadge><IconAction label={`Zoom into ${group.name}`} onClick={() => navigate(group.id)}><ScanSearch size={14} /></IconAction>{!group.readOnly && onEditGroup && <IconAction label={`Edit ${group.name} group`} onClick={() => onEditGroup(group.id)}><Settings2 size={14} /></IconAction>}</div>
        {open && <div className="collection-tree-members">{members}{!count && <span className="p-2 text-xs text-fg-3">Empty group</span>}</div>}
      </section>;
      return <Fragment key={group.id}>
        <div className="collection-grid-group" data-group-id={group.id} data-group-readonly={group.readOnly || undefined} data-collection-run={open ? run ?? group.id : run} aria-label={`${group.name} group`}>
          <button type="button" className="collection-group-open" aria-label={`Zoom into ${group.name}`} onClick={() => navigate(group.id)} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); toggle(group.id, event.key === "ArrowRight"); } }}><Folder size={31} strokeWidth={1.35} /><strong>{group.name}</strong><span className="flex items-center gap-1 text-[10px] text-fg-3">{group.readOnly && <Lock size={10} />}{count} {count === 1 ? "item" : "items"}</span></button>
          <div className="collection-grid-actions">{controls}</div>
        </div>
        {open && members}
      </Fragment>;
    })}
    {parent === null && items.filter(item => !placed.has(item.id)).map(renderItem)}
  </>;
  return <>{render(parentId)}{parentId && items.filter(item => groups.find(group => group.id === parentId)?.itemIds.includes(item.id)).map(renderItem)}</>;
}

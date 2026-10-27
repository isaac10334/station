import { collectionView, type CollectionSource } from "@loop-kit/ui";
import { collectionTree } from "../../collection-adapter";
import { TreeView } from "./tree-view";
import { Button } from "./button";

/** One portable source supports three trusted presentations. Identity and
 * selection belong to the caller; presentation never copies or mutates data. */
export function CollectionView<T>({ source, presentation, label, selected, onSelect }: {
  source: CollectionSource<T>; presentation: "tree" | "list" | "grid"; label: string;
  selected?: string; onSelect: (id: string) => void;
}) {
  if (presentation === "tree") return <TreeView aria-label={label} items={collectionTree(source)} selected={selected ? [selected] : []} onSelectedChange={ids => { if (ids[0]) onSelect(ids[0]); }} />;
  const items = collectionView(source);
  return <div role="group" aria-label={label} className={presentation === "grid" ? "grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2" : "flex flex-col gap-1"}>
    {!items.length && <p className="p-2 text-xs text-fg-3">No items.</p>}
    {items.map(item => <Button key={item.id} size="sm" variant="ghost" className="h-auto min-h-8 min-w-0 justify-start whitespace-normal break-words text-left aria-pressed:bg-selected" aria-pressed={item.id === selected} onClick={() => onSelect(item.id)}>{item.label}</Button>)}
  </div>;
}

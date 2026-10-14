import { useEffect, useMemo, useState } from "react";
import { sourceTree, sourceAncestors } from "../../../core/source-tree";
import { TreeView } from "../ui/tree-view";
import { IconAction } from "../ui/icon-action";
import { Plus, Pencil, Trash } from "../../lib/icons";

/** Editor-owned presentation state; source changes are supplied by the editor session. */
export function SourceFileTree({
  paths,
  selected,
  onSelect,
  onNew,
  onRename,
  onDelete,
  editable = true,
}: {
  editable?: boolean;
  paths: string[];
  selected: string;
  onSelect: (path: string) => void;
  onNew: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const items = useMemo(() => sourceTree(paths), [paths.join("\0")]);
  const [expanded, setExpanded] = useState(() => sourceAncestors(selected));
  useEffect(() => {
    setExpanded((previous) => [
      ...new Set([...previous, ...sourceAncestors(selected)]),
    ]);
  }, [selected]);
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-b border-line px-2 py-1.5">
        <span className="whitespace-nowrap text-xs tabular-nums text-fg-2">
          {paths.length} {paths.length === 1 ? "file" : "files"}
        </span>
        <div className="flex flex-wrap items-center gap-0.5">
          <IconAction
            label="New file"
            className="size-7 border-transparent bg-transparent"
            disabled={!editable}
            onClick={onNew}
          >
            <Plus size={14} />
          </IconAction>
          <IconAction
            label="Rename file (F2)"
            className="size-7 border-transparent bg-transparent"
            disabled={!editable || !selected}
            onClick={() => onRename(selected)}
          >
            <Pencil size={14} />
          </IconAction>
          <IconAction
            label="Delete file"
            className="size-7 border-transparent bg-transparent hover:text-danger"
            disabled={!editable || !selected}
            onClick={() => onDelete(selected)}
          >
            <Trash size={14} />
          </IconAction>
        </div>
      </div>
      <TreeView
        aria-label="Project files"
        className="station-file-tree min-h-0 flex-1"
        items={items}
        selectionFollowsFocus
        expanded={expanded}
        onExpandedChange={setExpanded}
        selected={selected ? [`file:${selected}`] : []}
        onSelectedChange={(ids) => {
          if (ids[0]?.startsWith("file:")) onSelect(ids[0].slice(5));
        }}
        onAction={(node) => {
          if (node.id.startsWith("file:")) onSelect(node.id.slice(5));
        }}
        onKeyDown={(event) => {
          if (!editable && (event.key === "F2" || event.key === "Delete")) {
            event.preventDefault();
            return;
          }
          const row = (event.target as Element).closest<HTMLElement>(
            "[data-tree-id]",
          );
          const id = row?.dataset.treeId;
          if (!id?.startsWith("file:")) return;
          if (event.key === "F2") {
            event.preventDefault();
            onRename(id.slice(5));
          }
          if (event.key === "Delete") {
            event.preventDefault();
            onDelete(id.slice(5));
          }
        }}
      />
    </>
  );
}

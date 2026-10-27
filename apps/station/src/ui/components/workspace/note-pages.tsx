import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File as FileText,
  Plus,
  MoreH as MoreHorizontal,
} from "../../lib/icons";
import type { Workspace } from "../../../core/workspace-state";
import {
  moveRecord,
  type DataViewConfiguration,
} from "../../../core/data-sources";
import { visitNode } from "../../../core/docking";
import { useDockController } from "../../docking/react";
import { Button } from "../ui/button";
import { NativeSelect } from "../ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type Placement = NonNullable<DataViewConfiguration["pages"]>[number];
/** Page placement belongs to the view. Sources, names, revisions and sharing belong to assets. Missing references remain recoverable. */
export function NotePages({
  workspace,
  onCreate,
  config,
  change,
}: {
  workspace: Workspace;
  onCreate: () => string;
  config: DataViewConfiguration;
  change: (patch: Partial<DataViewConfiguration>) => void;
}) {
  const { command } = useDockController();
  const [collapsed, setCollapsed] = useState<string[]>([]),
    [dragged, setDragged] = useState<string>(),
    [over, setOver] = useState<string>(),
    [error, setError] = useState("");
  let activeAssetId: string | undefined;
  visitNode(workspace.dock.surfaces.main, (node) => {
    if (node.kind === "stack") {
      const panel = workspace.dock.panels[node.active];
      if (panel?.kind === "asset") activeAssetId = panel.assetId;
    }
  });
  const notes = workspace.assets.filter(
    (a) => a.kind === "note" || a.kind === "markdown",
  );
  const pages: Placement[] =
    config.pages ?? notes.map((a) => ({ id: a.id, assetId: a.id }));
  const open = (assetId: string) => command({ type: "openAsset", assetId });
  const create = (parentId?: string) => {
    try {
      const assetId = onCreate();
      change({
        pages: [...pages, { id: crypto.randomUUID(), assetId, parentId }],
      });
      open(assetId);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  const descendants = (id: string): Set<string> => {
    const result = new Set([id]);
    let count = 0;
    while (count !== result.size) {
      count = result.size;
      for (const p of pages)
        if (p.parentId && result.has(p.parentId)) result.add(p.id);
    }
    return result;
  };
  const reorder = (id: string, before?: string) => {
    const ids = moveRecord(
      pages.map((p) => p.id),
      id,
      before,
    );
    change({ pages: ids.map((id) => pages.find((p) => p.id === id)!) });
  };
  const render = (parentId?: string, depth = 0): React.ReactNode =>
    pages
      .filter((p) => p.parentId === parentId)
      .map((page) => {
        const asset = notes.find((a) => a.id === page.assetId),
          label = asset?.name ?? "Missing note",
          children = pages.some((p) => p.parentId === page.id),
          hidden =
            config.presentation === "tree" && collapsed.includes(page.id),
          excluded = descendants(page.id);
        if (
          config.search &&
          !label.toLowerCase().includes(config.search.toLowerCase()) &&
          !pages.some(
            (p) =>
              excluded.has(p.id) &&
              notes
                .find((a) => a.id === p.assetId)
                ?.name.toLowerCase()
                .includes(config.search.toLowerCase()),
          )
        )
          return null;
        return (
          <li key={page.id} className="min-w-0">
            <div
              className="group/page flex min-h-9 min-w-0 items-center gap-1 rounded-lg px-1 text-[13px] text-fg-2 hover:bg-hover focus-within:bg-hover"
              style={{
                paddingLeft: depth * 14 + 4,
                ...(over === page.id
                  ? { boxShadow: "inset 0 2px var(--focus-ring)" }
                  : {}),
              }}
              draggable={!config.sortBy && !config.readOnly}
              onDragStart={(e) => {
                setDragged(page.id);
                e.dataTransfer.setData("application/x-station-page", page.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (
                  dragged &&
                  pages.find((p) => p.id === dragged)?.parentId ===
                    page.parentId
                ) {
                  e.preventDefault();
                  setOver(page.id);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (
                  dragged &&
                  pages.find((p) => p.id === dragged)?.parentId ===
                    page.parentId
                )
                  reorder(dragged, page.id);
                setDragged(undefined);
                setOver(undefined);
              }}
              onDragEnd={() => {
                setDragged(undefined);
                setOver(undefined);
              }}
              onKeyDown={(e) => {
                if (
                  !config.readOnly &&
                  !(e.target as HTMLElement).closest(
                    "input,textarea,select,[contenteditable=true]",
                  ) &&
                  e.altKey &&
                  ["ArrowUp", "ArrowDown"].includes(e.key)
                ) {
                  e.preventDefault();
                  const siblings = pages.filter((p) => p.parentId === parentId),
                    index = siblings.findIndex((p) => p.id === page.id);
                  if (e.key === "ArrowUp" && index > 0)
                    reorder(page.id, siblings[index - 1].id);
                  if (e.key === "ArrowDown" && index < siblings.length - 1)
                    reorder(siblings[index + 1].id, page.id);
                }
              }}
            >
              {children && config.presentation === "tree" ? (
                <button
                  className="shrink-0 rounded p-0.5 hover:bg-hover"
                  aria-label={`${hidden ? "Expand" : "Collapse"} ${label}`}
                  aria-expanded={!hidden}
                  onClick={() =>
                    setCollapsed(
                      hidden
                        ? collapsed.filter((id) => id !== page.id)
                        : [...collapsed, page.id],
                    )
                  }
                >
                  {hidden ? (
                    <ChevronRight className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                </button>
              ) : (
                <FileText className="ml-0.5 size-3.5 shrink-0 text-fg-3" />
              )}
              <button
                className="min-w-0 flex-1 truncate py-1.5 text-left aria-[current=page]:font-medium aria-[current=page]:text-fg focus-visible:outline-2 focus-visible:outline-fg-3"
                onClick={() => asset && open(asset.id)}
                aria-label={`Open ${label}`}
                aria-current={
                  !!asset && activeAssetId === asset.id ? "page" : undefined
                }
              >
                {label}
              </button>
              {!config.readOnly && (
                <Popover>
                  <PopoverTrigger
                    variant="ghost"
                    size="sm"
                    aria-label={`Page settings for ${label}`}
                    className="size-6 p-0 opacity-0 group-hover/page:opacity-100 group-focus-within/page:opacity-100 pointer-coarse:opacity-100"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </PopoverTrigger>
                  <PopoverContent
                    arrow={false}
                    align="start"
                    className="space-y-3 p-3"
                    aria-label={`${label} page settings`}
                  >
                    <label className="block space-y-1 text-xs">
                      <span>Move under</span>
                      <NativeSelect
                        aria-label={`Parent of ${label}`}
                        value={page.parentId ?? ""}
                        onChange={(e) =>
                          change({
                            pages: pages.map((p) =>
                              p.id === page.id
                                ? {
                                    ...p,
                                    parentId: e.target.value || undefined,
                                  }
                                : p,
                            ),
                          })
                        }
                      >
                        <option value="">Top level</option>
                        {pages
                          .filter((p) => !excluded.has(p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {notes.find((a) => a.id === p.assetId)?.name ??
                                "Missing note"}
                            </option>
                          ))}
                      </NativeSelect>
                    </label>
                    {!asset && (
                      <label className="block space-y-1 text-xs">
                        Recover reference
                        <NativeSelect
                          aria-label="Replacement note"
                          value=""
                          onChange={(e) =>
                            change({
                              pages: pages.map((p) =>
                                p.id === page.id
                                  ? { ...p, assetId: e.target.value }
                                  : p,
                              ),
                            })
                          }
                        >
                          <option value="">Choose a note…</option>
                          {notes.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </NativeSelect>
                      </label>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => create(page.id)}
                    >
                      Add subpage
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        change({
                          pages: pages
                            .filter((p) => p.id !== page.id)
                            .map((p) =>
                              p.parentId === page.id
                                ? { ...p, parentId: page.parentId }
                                : p,
                            ),
                        })
                      }
                    >
                      Remove from this view
                    </Button>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {children && !hidden && (
              <ul>
                {render(
                  page.id,
                  config.presentation === "tree" ? depth + 1 : 0,
                )}
              </ul>
            )}
          </li>
        );
      });
  return (
    <div className="min-h-0 flex-1 overflow-auto p-1">
      <ul aria-label="Pages">{render()}</ul>
      {!pages.length && (
        <p className="px-2 py-4 text-xs text-fg-3">A place for your notes.</p>
      )}
      {!config.readOnly && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 w-full justify-start text-fg-3"
          onClick={() => create()}
        >
          <Plus className="size-3.5" />
          New page
        </Button>
      )}
      {config.pages && !config.readOnly && (
        <Popover>
          <PopoverTrigger variant="ghost" size="sm" className="mt-1 text-fg-3">
            Link existing page
          </PopoverTrigger>
          <PopoverContent
            arrow={false}
            className="p-2"
            aria-label="Link existing page"
          >
            {notes.map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant="ghost"
                className="w-full justify-start"
                onClick={() =>
                  change({
                    pages: [
                      ...pages,
                      { id: crypto.randomUUID(), assetId: a.id },
                    ],
                  })
                }
              >
                {a.name}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      )}
      {error && (
        <p role="alert" className="p-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

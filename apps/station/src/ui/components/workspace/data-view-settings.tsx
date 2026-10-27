import { useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Grip as GripVertical,
  Pin,
  Sliders as SlidersHorizontal,
} from "../../lib/icons";
import type {
  DataSnapshot,
  DataViewConfiguration,
} from "../../../core/data-sources";
import { moveRecord, orderRecords } from "../../../core/data-sources";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type Page = NonNullable<DataViewConfiguration["pinnedMenus"]>[number];
const names: Record<Page, string> = {
  source: "Data source",
  layout: "Layout",
  filter: "Filter",
  sort: "Sort",
  properties: "Properties",
};
/** One settings body powers both the main menu and explicitly pinned toolbar menus. */
export function DataViewSettings({
  config,
  data,
  source,
  change,
}: {
  config: DataViewConfiguration;
  data?: DataSnapshot;
  source: ReactNode;
  change: (patch: Partial<DataViewConfiguration>) => void;
}) {
  const [page, setPage] = useState<Page>();
  const [dragged, setDragged] = useState<string>();
  const [over, setOver] = useState<string>();
  const columns = orderRecords(data?.columns ?? [], config.columnOrder);
  const pin = (id: Page) =>
    change({
      pinnedMenus: config.pinnedMenus?.includes(id)
        ? config.pinnedMenus.filter((p) => p !== id)
        : [...(config.pinnedMenus ?? []), id],
    });
  const field = (
    label: string,
    key: "sortBy" | "groupBy" | "labelBy" | "edgeTo",
  ) => (
    <label className="block space-y-1.5 text-xs">
      <span className="text-fg-3">{label}</span>
      <NativeSelect
        aria-label={label}
        value={config[key] ?? ""}
        onChange={(e) => change({ [key]: e.target.value || undefined })}
      >
        <option value="">
          {key === "sortBy" ? "Manual order" : "Automatic / none"}
        </option>
        {data?.columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
  const body = (id: Page) => (
    <div className="space-y-4 p-3">
      {id === "source" && (
        <>
          {source}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={config.readOnly ?? false}
              onChange={(e) => change({ readOnly: e.target.checked })}
            />
            Read-only view
          </label>
        </>
      )}
      {id === "filter" && (
        <Input
          autoFocus
          aria-label="Search records"
          placeholder="Filter records…"
          value={config.search}
          onChange={(e) => change({ search: e.target.value })}
        />
      )}
      {id === "sort" && (
        <>
          {field("Sort records by", "sortBy")}
          {config.sortBy ? (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={config.descending}
                onChange={(e) => change({ descending: e.target.checked })}
              />
              Descending order
            </label>
          ) : (
            <p className="text-xs leading-relaxed text-fg-3">
              Drag a row to reorder. Use Alt + ↑ or ↓ on a focused row for
              keyboard ordering.
            </p>
          )}
        </>
      )}
      {id === "layout" && (
        <>
          <label className="block space-y-1.5 text-xs">
            <span className="text-fg-3">Show as</span>
            <NativeSelect
              aria-label="Data view presentation"
              value={config.presentation}
              onChange={(e) =>
                change({
                  presentation: e.target
                    .value as DataViewConfiguration["presentation"],
                })
              }
            >
              {(config.collection === "notes"
                ? ["list", "tree"]
                : ["table", "board", "graph"]
              ).map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </NativeSelect>
          </label>
          {!config.collection && (
            <>
              {field("Group by", "groupBy")}
              {field("Record title", "labelBy")}
              {field("Graph links", "edgeTo")}
            </>
          )}
        </>
      )}
      {id === "properties" && (
        <div className="space-y-1" aria-label="Visible properties">
          {columns.map((c) => (
            <div
              key={c.id}
              draggable
              tabIndex={0}
              aria-label={`${c.label} property. Alt plus arrow keys to reorder`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
              style={
                over === c.id
                  ? { boxShadow: "inset 0 2px var(--focus-ring)" }
                  : undefined
              }
              onDragStart={(e) => {
                setDragged(c.id);
                e.dataTransfer.setData("application/x-station-column", c.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragged) {
                  e.preventDefault();
                  setOver(c.id);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged)
                  change({
                    columnOrder: moveRecord(
                      columns.map((c) => c.id),
                      dragged,
                      c.id,
                    ),
                  });
                setDragged(undefined);
                setOver(undefined);
              }}
              onDragEnd={() => {
                setDragged(undefined);
                setOver(undefined);
              }}
              onKeyDown={(e) => {
                if (e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
                  e.preventDefault();
                  const ids = columns.map((c) => c.id),
                    index = ids.indexOf(c.id);
                  if (e.key === "ArrowUp" && index > 0)
                    change({
                      columnOrder: moveRecord(ids, c.id, ids[index - 1]),
                    });
                  if (e.key === "ArrowDown" && index < ids.length - 1)
                    change({
                      columnOrder: moveRecord(ids, ids[index + 1], c.id),
                    });
                }
              }}
            >
              <GripVertical className="size-3.5 text-fg-4" aria-hidden />
              <span className="flex-1 truncate">{c.label}</span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`${config.hiddenColumns.includes(c.id) ? "Show" : "Hide"} ${c.label}`}
                aria-pressed={!config.hiddenColumns.includes(c.id)}
                onClick={() =>
                  change({
                    hiddenColumns: config.hiddenColumns.includes(c.id)
                      ? config.hiddenColumns.filter((id) => id !== c.id)
                      : [...config.hiddenColumns, c.id],
                  })
                }
              >
                {config.hiddenColumns.includes(c.id) ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
          ))}
          {!columns.length && (
            <p className="text-xs text-fg-3">
              This view has no configurable columns.
            </p>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              change({ columnOrder: undefined, hiddenColumns: [] })
            }
          >
            Restore properties
          </Button>
        </div>
      )}
    </div>
  );
  const heading = (id: Page, back = false) => (
    <div className="flex items-center gap-1 border-b border-line p-2">
      {back && (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Back to view settings"
          onClick={() => setPage(undefined)}
        >
          <ChevronLeft className="size-4" />
        </Button>
      )}
      <span className="flex-1 px-1 text-xs font-medium">{names[id]}</span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`${config.pinnedMenus?.includes(id) ? "Unpin" : "Pin"} ${names[id]}`}
        aria-pressed={config.pinnedMenus?.includes(id) ?? false}
        onClick={() => pin(id)}
      >
        <Pin className="size-3.5" />
      </Button>
    </div>
  );
  return (
    <>
      {[...new Set(config.pinnedMenus ?? [])].map((id) => (
        <Popover key={id}>
          <PopoverTrigger size="sm" variant="ghost">
            {names[id]}
          </PopoverTrigger>
          <PopoverContent
            arrow={false}
            align="end"
            size="sm"
            className="overflow-hidden p-0"
            aria-label={`${names[id]} settings`}
          >
            {heading(id)}
            {body(id)}
          </PopoverContent>
        </Popover>
      ))}
      <Popover
        onOpenChange={(open) => {
          if (!open) setPage(undefined);
        }}
      >
        <PopoverTrigger size="sm" variant="ghost" aria-label="View settings">
          <SlidersHorizontal className="size-4" />
        </PopoverTrigger>
        <PopoverContent
          arrow={false}
          align="end"
          size="sm"
          className="overflow-hidden p-0"
          aria-label="Data view settings"
        >
          {page ? (
            <>
              {heading(page, true)}
              {body(page)}
            </>
          ) : (
            <>
              <p className="px-4 pt-3 pb-2 text-xs font-medium">
                View settings
              </p>
              <div className="space-y-0.5 p-1.5">
                {(Object.keys(names) as Page[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-fg-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-fg-3"
                    onClick={() => setPage(id)}
                  >
                    <span className="flex-1">{names[id]}</span>
                    {id === "sort" && !config.sortBy && (
                      <span className="text-fg-4">Manual</span>
                    )}
                    {id === "layout" && (
                      <span className="text-fg-4">{config.presentation}</span>
                    )}
                    {id === "filter" && config.search && (
                      <span className="max-w-20 truncate text-fg-4">
                        {config.search}
                      </span>
                    )}
                    <ChevronRight className="size-3.5 text-fg-4" />
                  </button>
                ))}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

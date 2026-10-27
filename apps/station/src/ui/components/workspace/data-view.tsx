import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  Search,
  Plus,
} from "lucide-react";
import {
  viewConfigurationSchema,
  orderRecords,
  moveRecord,
  type DataSnapshot,
  type DataViewConfiguration,
  type DataRecord,
} from "../../../core/data-sources";
import type { Workspace } from "../../../core/workspace-state";
import { deps } from "../../../composition";
import { controlOperation } from "../../lib/control-operation";
import { AssetReferencePicker } from "./asset-reference-picker";
import { RecordGraph } from "./record-graph";
import { Button } from "../ui/button";
import { PropertyEditor } from "../ui/property-editor";
import { NativeSelect } from "../ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "../ui/dialog";

import { DataViewSettings } from "./data-view-settings";
import { IconAction } from "../ui/icon-action";
import { Input } from "../ui/input";
import { NotePages } from "./note-pages";
import { Grip } from "../../lib/icons";
import { useWidgetToolbarControls } from "./widget-frame";
const PAGE_SIZE = 25;
function CellValue({ value, type }: { value: unknown; type: string }) {
  if (type === "boolean")
    return <span className="text-fg-3">{value ? "Yes" : "No"}</span>;
  if (type === "select" && value)
    return (
      <span className="inline-flex max-w-full truncate rounded-md border border-line bg-hover px-2 py-0.5 text-xs text-fg-2">
        {String(value)}
      </span>
    );
  return (
    <span
      className={
        value === null || value === "" || value === undefined
          ? "text-fg-3"
          : "text-fg-2"
      }
    >
      {String(value ?? "") || "—"}
    </span>
  );
}

/** View settings own no records. Commands enforce source authority/revision;
 * read-only presentation only narrows editing, never overrides provider policy. */
export function DataView({
  workspace,
  configuration,
  onChange,
  fixedSource = false,
}: {
  workspace: Workspace;
  configuration: DataViewConfiguration;
  onChange: (value: DataViewConfiguration) => void;
  fixedSource?: boolean;
}) {
  const toolbarControls = useWidgetToolbarControls();
  const [searchOpen, setSearchOpen] = useState(false);
  const [data, setData] = useState<DataSnapshot>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const [editingCell, setEditingCell] = useState<string>();
  const [dragged, setDragged] = useState<string>(),
    [over, setOver] = useState<string>();
  const [page, setPage] = useState(0),
    [selected, setSelected] = useState<string>();
  const config = viewConfigurationSchema.parse(configuration),
    source = workspace.assets.find((a) => a.id === config.sourceId && a.kind === "data-source");
  const change = (patch: Partial<DataViewConfiguration>) =>
    onChange(viewConfigurationSchema.parse({ ...config, ...patch }));
  const queryKey = JSON.stringify({
    sourceId: config.sourceId,
    search: config.search,
    sortBy: config.sortBy,
    descending: config.descending,
  });
  useEffect(() => {
    setPage(0);
    setSelected(undefined);
  }, [config.sourceId, config.search, config.sortBy, config.descending]);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    if (!config.sourceId) {
      setData(undefined);
      setLoading(false);
      return;
    }
    setData((current) =>
      current?.sourceId === config.sourceId ? current : undefined,
    );
    setLoading(true);
    void controlOperation<DataSnapshot>(
      "data.query",
      { assetId: config.sourceId, view: config },
      controller.signal,
    )
      .then(
        (value) => {
          if (!controller.signal.aborted) setData(value);
        },
        (reason) => {
          if (!controller.signal.aborted) {
            setData(undefined);
            setError(String(reason));
          }
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [queryKey, workspace.assets]);
  const readOnly = !!(data?.readOnly || config.readOnly),
    current =
      data?.sourceId === config.sourceId
        ? data && !config.sortBy
          ? { ...data, records: orderRecords(data.records, config.manualOrder) }
          : data
        : undefined;
  const mutate = (record: DataRecord) => {
    if (!current || readOnly || loading)
      throw new Error("Wait for the current editable source.");
    try {
      deps.control.execute({
        method: "data.mutate",
        version: deps.control.version(),
        params: {
          assetId: current.sourceId,
          expectedAssetRevision: current.revision,
          record,
        },
      });
      setError("");
    } catch (reason) {
      setError(String(reason));
      throw reason;
    }
  };
  const columns = orderRecords(
    current?.columns ?? [],
    config.columnOrder,
  ).filter((c) => !config.hiddenColumns.includes(c.id));
  const groupColumn =
    current?.columns.find((c) => c.id === config.groupBy) ??
    current?.columns.find((c) => c.type === "select");
  const groupBy = groupColumn?.id,
    groupEditable =
      !!groupColumn && ["select", "text"].includes(groupColumn.type);
  const groupValue = (record: DataRecord) =>
    String(record.values[groupBy ?? ""] ?? "");
  const groups = [
    ...new Set([
      ...(groupColumn?.options ?? []),
      ...(current?.records.map(groupValue) ?? []),
    ]),
  ];
  const pageCount = Math.max(
      1,
      Math.ceil((current?.records.length ?? 0) / PAGE_SIZE),
    ),
    activePage = Math.min(page, pageCount - 1);
  const records =
    current?.records.slice(
      activePage * PAGE_SIZE,
      (activePage + 1) * PAGE_SIZE,
    ) ?? [];
  const record = current?.records.find((r) => r.id === selected);
  const titleKey = config.labelBy ?? current?.columns[0]?.id ?? "";
  const title = (row: DataRecord) =>
    String(row.values[titleKey] ?? "") || "Untitled record";
  const add = () => {
    if (!current) return;
    try {
      const id = crypto.randomUUID();
      mutate({
        id,
        values: Object.fromEntries(
          current.columns
            .filter((c) => c.type !== "formula")
            .map((c) => [
              c.id,
              c.type === "boolean" ? false : c.type === "number" ? 0 : "",
            ]),
        ),
      });
      setSelected(id);
    } catch {} // The shared mutation already exposes its error in the view.
  };
  return (
    <section
      className="station-data-view flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Data source view"
      aria-busy={loading}
    >
      <div className="station-data-toolbar flex shrink-0 flex-wrap items-center gap-1 px-3 py-1">
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-fg-3">
          {config.collection === "notes"
            ? "Pages"
            : (source?.name ?? "Data view")}
        </span>
        {toolbarControls}
        <IconAction label="Search records" className="size-7 border-0 bg-transparent" onClick={() => setSearchOpen(value => !value)} aria-expanded={searchOpen}><Search size={14} /></IconAction>
        <DataViewSettings
          config={config}
          data={current}
          change={change}
          source={
            <div className="space-y-3">
              {!fixedSource && (
                <NativeSelect
                  aria-label="Data collection"
                  value={config.collection ?? "source"}
                  onChange={(e) =>
                    change({
                      collection:
                        e.target.value === "notes" ? "notes" : undefined,
                      sourceId: undefined,
                      presentation:
                        e.target.value === "notes" ? "tree" : "table",
                    })
                  }
                >
                  <option value="source">Data source asset</option>
                  <option value="notes">Workspace notes</option>
                </NativeSelect>
              )}
              {!config.collection &&
                (!fixedSource ? (
                  <AssetReferencePicker
                    label="data source"
                    workspaceId={workspace.id}
                    options={workspace.assets
                      .filter((a) => a.kind === "data-source")
                      .map((a) => ({ assetId: a.id, label: a.name }))}
                    value={
                      config.sourceId ? { assetId: config.sourceId } : undefined
                    }
                    onChange={(r) => change({ sourceId: r?.assetId })}
                    onCreate={(name) => ({
                      assetId: deps.control.execute({
                        method: "asset.create",
                        version: deps.control.version(),
                        params: { name, kind: "data-source" },
                      }).result.id,
                    })}
                  />
                ) : (
                  <p className="text-xs text-fg-3">{source?.name}</p>
                ))}
            </div>
          }
        />
        {current && !readOnly && (
          <Button size="sm" variant="ghost" disabled={loading} onClick={add}>
            <Plus size={14} />
            New
          </Button>
        )}
      </div>
      {searchOpen && <div className="border-b border-line px-3 pb-2"><Input autoFocus aria-label="Filter view records" placeholder="Search records…" value={config.search} onChange={event => change({ search: event.target.value })} onKeyDown={event => { if (event.key === "Escape") setSearchOpen(false); }} /></div>}
      {config.collection === "notes" && (
        <NotePages
          workspace={workspace}
          config={config}
          change={change}
          onCreate={() =>
            deps.control.execute({
              method: "asset.create",
              version: deps.control.version(),
              params: { name: "Untitled", kind: "note" },
            }).result.id
          }
        />
      )}
      {error && (
        <p
          role="alert"
          className="border-b border-line px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}
      {!source && !config.collection && (
        <div className="m-auto w-full max-w-sm space-y-4 p-6">
          <div className="space-y-2">
            <LayoutList aria-hidden className="size-6 text-fg-3" />
            <h3 className="text-sm font-medium">{config.sourceId ? "Reconnect your data" : "What would you like to see?"}</h3>
            <p className="text-xs leading-relaxed text-fg-3">{config.sourceId ? "The selected source is unavailable. Choose a replacement to keep using this view." : "Connect a data source for a table, board or graph, or browse your workspace notes."}</p>
          </div>
          {!fixedSource ? <>
            <AssetReferencePicker label="data source" workspaceId={workspace.id} options={workspace.assets.filter(asset => asset.kind === "data-source").map(asset => ({ assetId: asset.id, label: asset.name }))} value={config.sourceId ? { assetId: config.sourceId } : undefined} onChange={reference => change({ sourceId: reference?.assetId })} onCreate={name => ({ assetId: deps.control.execute({ method: "asset.create", version: deps.control.version(), params: { name, kind: "data-source" } }).result.id })} />
            <div className="border-t border-line pt-3"><Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => change({ collection: "notes", sourceId: undefined, presentation: "tree" })}>Browse workspace notes</Button></div>
          </> : <p role="status" className="text-xs text-fg-3">Restore the referenced data source to reconnect this fixed view.</p>}
        </div>
      )}
      {source && !current && loading && (
        <p role="status" className="p-6 text-sm text-fg-3">
          Loading records…
        </p>
      )}
      {current && (
        <>
          <div
            className="min-h-0 flex-1 overflow-auto"
            inert={loading ? true : undefined}
          >
            {config.presentation === "table" ? (
              <table className="w-full border-collapse text-left text-xs">
                <caption className="sr-only">
                  {source?.name} records. Open a record to edit its properties.
                </caption>
                <thead className="sticky top-0 z-10 bg-frame">
                  <tr>
                    <th scope="col" className="w-8">
                      <span className="sr-only">Manual order</span>
                    </th>
                    {columns.map((c) => (
                      <th
                        scope="col"
                        key={c.id}
                        aria-sort={
                          config.sortBy === c.id
                            ? config.descending
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                        className="border-b border-line font-medium"
                      >
                        <button
                          className="flex w-full items-center gap-2 px-4 py-3 text-left text-fg-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                          onClick={() =>
                            change(
                              config.sortBy !== c.id
                                ? { sortBy: c.id, descending: false }
                                : !config.descending
                                  ? { descending: true }
                                  : { sortBy: undefined, descending: false },
                            )
                          }
                        >
                          <span className="flex-1">
                            {c.label}
                            {c.type === "formula" ? " ƒ" : ""}
                          </span>
                          {config.sortBy === c.id ? (
                            config.descending ? (
                              <ArrowDown size={12} />
                            ) : (
                              <ArrowUp size={12} />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="opacity-40" />
                          )}
                        </button>
                      </th>
                    ))}
                    <th scope="col">
                      <span className="sr-only">Record</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      aria-label={title(row)}
                      style={
                        over === row.id
                          ? { boxShadow: "inset 0 2px var(--focus-ring)" }
                          : undefined
                      }
                      onDragStart={(e) => {
                        setDragged(row.id);
                        e.dataTransfer.setData(
                          "application/x-station-row",
                          row.id,
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        if (dragged) {
                          e.preventDefault();
                          setOver(row.id);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragged)
                          change({
                            manualOrder: moveRecord(
                              current.records.map((r) => r.id),
                              dragged,
                              row.id,
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
                        if (
                          !config.sortBy &&
                          !(e.target as HTMLElement).closest(
                            "input,textarea,select,[contenteditable=true]",
                          ) &&
                          e.altKey &&
                          ["ArrowUp", "ArrowDown"].includes(e.key)
                        ) {
                          e.preventDefault();
                          const ids = current.records.map((r) => r.id),
                            i = ids.indexOf(row.id);
                          if (e.key === "ArrowUp" && i > 0)
                            change({
                              manualOrder: moveRecord(ids, row.id, ids[i - 1]),
                            });
                          if (e.key === "ArrowDown" && i < ids.length - 1)
                            change({
                              manualOrder: moveRecord(ids, ids[i + 1], row.id),
                            });
                        }
                      }}
                      className="group border-b border-line hover:bg-hover"
                    >
                      <td className="w-8 px-1">
                        <button
                          type="button"
                          draggable={!config.sortBy}
                          disabled={!!config.sortBy}
                          aria-label={`Move ${title(row)}`}
                          title="Drag to reorder · Alt + arrow keys"
                          className="grid size-6 cursor-grab place-items-center rounded text-fg-4 hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-fg-3 disabled:opacity-30"
                        >
                          <Grip className="size-3.5" />
                        </button>
                      </td>
                      {columns.map((c) => (
                        <td
                          key={c.id}
                          className={`max-w-80 truncate px-4 py-2.5 ${c.type === "number" || c.type === "formula" ? "text-right tabular-nums" : ""}`}
                        >
                          {readOnly || c.type === "formula" ? (
                            <CellValue value={row.values[c.id]} type={c.type} />
                          ) : editingCell === `${row.id}/${c.id}` ? (
                            <div
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  e.stopPropagation();
                                  setEditingCell(undefined);
                                }
                              }}
                            >
                              <PropertyEditor
                                field={{
                                  key: c.id,
                                  label: `${c.label} for ${title(row)}`,
                                  type: c.type,
                                  options: c.options,
                                }}
                                value={row.values[c.id]}
                                onCommit={(value) => {
                                  mutate({
                                    ...row,
                                    values: {
                                      ...row.values,
                                      [c.id]: value as
                                        string | number | boolean | null,
                                    },
                                  });
                                  setEditingCell(undefined);
                                }}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="min-h-7 w-full rounded px-1 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-fg-3"
                              aria-label={`Edit ${c.label} for ${title(row)}`}
                              onClick={() =>
                                setEditingCell(`${row.id}/${c.id}`)
                              }
                            >
                              <CellValue
                                value={row.values[c.id]}
                                type={c.type}
                              />
                            </button>
                          )}
                        </td>
                      ))}
                      <td className="w-12 px-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Open ${title(row)}`}
                          onClick={() => setSelected(row.id)}
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!records.length && (
                    <tr>
                      <td
                        colSpan={columns.length + 2}
                        className="p-8 text-center text-fg-3"
                      >
                        {config.search
                          ? "No matching records. Try a different filter."
                          : "No records yet. Add your first record."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : config.presentation === "board" ? (
              <div className="flex min-h-full items-start gap-3 p-3">
                {groups.map((group) => (
                  <section
                    key={group}
                    className="w-60 min-w-52 shrink-0 rounded-lg border border-line bg-frame"
                    aria-label={`${group || "Unassigned"} records`}
                    onDragOver={(e) => {
                      if (!readOnly && groupEditable) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (readOnly || !groupEditable || !groupBy || !source)
                        return;
                      try {
                        const payload = JSON.parse(
                          e.dataTransfer.getData(
                            "application/x-station-record",
                          ),
                        );
                        if (
                          payload.workspaceId !== workspace.id ||
                          payload.sourceId !== source.id
                        )
                          return;
                        const row = current.records.find(
                          (r) => r.id === payload.recordId,
                        );
                        if (row)
                          mutate({
                            ...row,
                            values: { ...row.values, [groupBy]: group },
                          });
                      } catch (reason) {
                        setError(String(reason));
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 border-b border-line p-3">
                      <h3 className="min-w-0 flex-1 truncate text-xs! font-medium! leading-normal!">
                        {group || "Unassigned"}
                      </h3>
                      <span className="text-xs tabular-nums text-fg-3">
                        {
                          current.records.filter((r) => groupValue(r) === group)
                            .length
                        }
                      </span>
                    </div>
                    <div className="space-y-2 p-2">
                      {current.records
                        .filter((r) => groupValue(r) === group)
                        .map((row) => (
                          <button
                            key={row.id}
                            draggable={!readOnly && groupEditable}
                            onDragStart={(e) =>
                              e.dataTransfer.setData(
                                "application/x-station-record",
                                JSON.stringify({
                                  workspaceId: workspace.id,
                                  sourceId: source?.id,
                                  recordId: row.id,
                                }),
                              )
                            }
                            onClick={() => setSelected(row.id)}
                            className="block w-full space-y-2 rounded-md border border-line bg-raised p-3 text-left shadow-sm hover:border-fg-3 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] active:bg-hover"
                          >
                            <span className="block break-words text-sm font-medium">
                              {title(row)}
                            </span>
                            {columns
                              .filter(
                                (c) => c.id !== groupBy && c.id !== titleKey,
                              )
                              .slice(0, 3)
                              .map((c) => (
                                <span
                                  key={c.id}
                                  className="flex items-center justify-between gap-2 text-xs"
                                >
                                  <span className="text-fg-3">{c.label}</span>
                                  <CellValue
                                    value={row.values[c.id]}
                                    type={c.type}
                                  />
                                </span>
                              ))}
                          </button>
                        ))}
                      {!current.records.some(
                        (r) => groupValue(r) === group,
                      ) && (
                        <p className="p-3 text-center text-xs text-fg-3">
                          No records
                        </p>
                      )}
                    </div>
                  </section>
                ))}
                {!groupBy && (
                  <p className="p-4 text-xs text-fg-3">
                    Add a select property or choose a grouping property in View
                    settings.
                  </p>
                )}
              </div>
            ) : (
              <RecordGraph
                records={current.records}
                labelBy={config.labelBy ?? columns[0]?.id}
                edgeTo={config.edgeTo}
              />
            )}
          </div>
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 py-2 text-xs text-fg-3">
            <span className="mr-auto min-w-0 truncate">
              {current.records.length} records ·{" "}
              {readOnly ? "Read only" : "Shared source"}
            </span>
            <span role="status" aria-live="polite">
              {loading ? "Updating…" : ""}
            </span>
            {config.presentation === "table" && pageCount > 1 && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Previous records"
                  disabled={activePage === 0}
                  onClick={() => setPage(activePage - 1)}
                >
                  <ChevronLeft size={14} />
                </Button>
                <span className="tabular-nums">
                  {activePage + 1} / {pageCount}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Next records"
                  disabled={activePage + 1 === pageCount}
                  onClick={() => setPage(activePage + 1)}
                >
                  <ChevronRight size={14} />
                </Button>
              </>
            )}
          </footer>
          <Dialog
            open={!!record}
            onOpenChange={(open) => {
              if (!open) setSelected(undefined);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{record ? title(record) : "Record"}</DialogTitle>
              </DialogHeader>
              <DialogBody>
                {record && (
                  <div className="space-y-4">
                    {current.columns.map((c) => (
                      <div key={c.id} className="space-y-1.5">
                        <p className="text-xs font-medium text-fg-3">
                          {c.label}
                          {c.type === "formula" ? " · formula" : ""}
                        </p>
                        <PropertyEditor
                          key={`${record.id}:${c.id}`}
                          field={{
                            key: c.id,
                            label: c.label,
                            type: c.type === "formula" ? "text" : c.type,
                            options: c.options,
                            readOnly: c.type === "formula",
                          }}
                          value={record.values[c.id]}
                          readOnly={readOnly}
                          onCommit={(value) =>
                            mutate({
                              ...record,
                              values: {
                                ...record.values,
                                [c.id]: value as
                                  string | number | boolean | null,
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                    <p className="text-xs text-fg-3">
                      {readOnly
                        ? "This view is read only."
                        : "Changes save to the shared source on Enter or when you leave a field."}
                    </p>
                  </div>
                )}
                {error && (
                  <p role="alert" className="mt-3 text-xs text-danger">
                    {error}
                  </p>
                )}
              </DialogBody>
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}

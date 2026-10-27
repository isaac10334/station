import { z } from "zod";
/** Portable records and stable column IDs. Views never own a second copy of rows. */
export const cellSchema = z.union([z.string().max(8192), z.number().finite(), z.boolean(), z.null()]);
export const columnSchema = z.object({ id: z.string().regex(/^[a-zA-Z][\w-]{0,63}$/), label: z.string().min(1).max(120), type: z.enum(["text", "number", "boolean", "select", "formula"]), options: z.array(z.string().max(120)).max(32).optional(), formula: z.string().max(4096).optional() }).strict().refine(c => c.type !== "formula" || !!c.formula?.trim(), { message: "Formula columns require an expression" });
export const recordSchema = z.object({ id: z.string().min(1).max(120), values: z.record(z.string(), cellSchema) }).strict();
export const dataDocumentSchema = z.object({ version: z.literal(1), provider: z.string().min(1).max(120), scriptId: z.string().min(1).max(200).optional(), columns: z.array(columnSchema).max(32), records: z.array(recordSchema).max(500) }).strict().superRefine((d, ctx) => { if (new Set(d.columns.map(c => c.id)).size !== d.columns.length || new Set(d.records.map(r => r.id)).size !== d.records.length) ctx.addIssue({ code: "custom", message: "Column and record IDs must be unique" }); for (const row of d.records) for (const [key, value] of Object.entries(row.values)) { const c = d.columns.find(c => c.id === key); if (!c || (value !== null && ((c.type === "number" && typeof value !== "number") || (c.type === "boolean" && typeof value !== "boolean") || (["text", "select"].includes(c.type) && typeof value !== "string")))) ctx.addIssue({ code: "custom", message: `Invalid cell ${row.id}/${key}` }); } });
export type DataDocument = z.infer<typeof dataDocumentSchema>;
export type DataRecord = z.infer<typeof recordSchema>;
export const viewConfigurationSchema = z.object({ sourceId: z.string().max(200).optional(), readOnly: z.boolean().optional(), collection: z.enum(["notes"]).optional(), pages: z.array(z.object({ id: z.string().min(1).max(120), assetId: z.string().min(1).max(200), parentId: z.string().max(120).optional() }).strict()).max(500).optional(), manualOrder: z.array(z.string().max(200)).max(500).optional(), columnOrder: z.array(z.string().max(64)).max(32).optional(), pinnedMenus: z.array(z.enum(["source", "layout", "filter", "sort", "properties"])).max(5).optional(), presentation: z.enum(["table", "board", "graph", "list", "tree"]).default("table"), search: z.string().max(200).default(""), sortBy: z.string().max(64).optional(), descending: z.boolean().default(false), groupBy: z.string().max(64).optional(), labelBy: z.string().max(64).optional(), edgeTo: z.string().max(64).optional(), hiddenColumns: z.array(z.string().max(64)).max(32).default([]) }).strict().superRefine((view, ctx) => {
  if (view.collection && view.sourceId) ctx.addIssue({code:"custom",message:"Choose one data collection"});
  if (view.collection === "notes" ? !["list","tree"].includes(view.presentation) : ["list","tree"].includes(view.presentation)) ctx.addIssue({code:"custom",message:"Choose a compatible presentation for the collection"});
  const pages = view.pages ?? []; const byId = new Map(pages.map(p => [p.id, p]));
  if (byId.size !== pages.length) ctx.addIssue({ code: "custom", message: "Page placement IDs must be unique" });
  for (const page of pages) { const seen = new Set([page.id]); let parent = page.parentId;
    while (parent) { if (seen.has(parent) || !byId.has(parent)) { ctx.addIssue({ code: "custom", message: "Page parents must exist and cannot form cycles" }); break; } seen.add(parent); parent = byId.get(parent)?.parentId; }
  }
});
export type DataViewConfiguration = z.infer<typeof viewConfigurationSchema>;
export const dataSnapshotSchema = z.object({ sourceId: z.string(), revision: z.number(), provider: z.string(), readOnly: z.boolean(), columns: z.array(columnSchema), records: z.array(recordSchema) });
export type DataSnapshot = z.infer<typeof dataSnapshotSchema>;
export const DEFAULT_DATA: DataDocument = { version: 1, provider: "local.table", columns: [{ id: "name", label: "Name", type: "text" }, { id: "status", label: "Status", type: "select", options: ["Open", "Done"] }, { id: "amount", label: "Amount", type: "number" }], records: [{ id: "record-1", values: { name: "First record", status: "Open", amount: 4 } }, { id: "record-2", values: { name: "Second record", status: "Done", amount: 7 } }] };
/** Provider adapters are trusted registrations, not code loaded from a data file.
 * Integrations must register a new adapter with their own authority contract. */
export interface DataSourceProvider { id: string; readOnly: boolean; query(document: DataDocument): Pick<DataSnapshot, "columns" | "records"> }
export function queryDataSource(document: DataDocument, providers: readonly DataSourceProvider[], view: DataViewConfiguration): Omit<DataSnapshot, "sourceId" | "revision"> {
  const provider = providers.find(p => p.id === document.provider); if (!provider) throw new Error(`Data provider unavailable: ${document.provider}`);
  const data = provider.query(document);
  let records = data.records.filter(r => !view.search || Object.values(r.values).some(v => String(v ?? "").toLowerCase().includes(view.search.toLowerCase())));
  if (view.sortBy) { const key = view.sortBy; records = [...records].sort((a, b) => { const x = a.values[key], y = b.values[key]; return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""))) * (view.descending ? -1 : 1); }); }
  if (!view.sortBy) records = orderRecords(records, view.manualOrder);
  return { provider: provider.id, readOnly: provider.readOnly, columns: data.columns, records };
}

/** Stable per-view order; newly discovered rows retain provider order at the end. */
export function orderRecords<T extends { id: string }>(records: readonly T[], order: readonly string[] = []): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...records].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}
/** Reordering changes presentation only, never source records or asset identity. */
export function moveRecord(order: readonly string[], id: string, before?: string): string[] {
  if (id === before || !order.includes(id) || (before && !order.includes(before))) return [...order];
  const next = order.filter(value => value !== id); next.splice(before ? next.indexOf(before) : next.length, 0, id); return next;
}

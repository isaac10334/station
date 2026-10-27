import type { Panel } from "../../../core/docking";
import type { Workspace } from "../../../core/workspace-state";
import { notePath } from "../../../core/notes";
import type { WidgetActions } from "../../widget-actions";
import { useDockController } from "../../docking/react";
import { PropertyEditor } from "../ui/property-editor";
import { assetReferenceSchema } from "../../../core/asset-references";
import { RichTextEditor } from "../ui/rich-text-editor";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";

/** A value can stay inline or reference an independently revisioned asset.
 * Switching references never discards the widget's retained inline source. */
export function NoteWidget({ panel, workspace, actions }: { panel: Panel; workspace: Workspace; actions: WidgetActions }) {
  const { command } = useDockController();
  const selected = workspace.assets.find(asset => asset.id === panel.sourceAssetId && (asset.kind === "note" || asset.kind === "markdown"));
  const format = selected?.kind === "note" ? "note" : selected?.kind === "markdown" ? "markdown" : panel.note?.format ?? "markdown";
  const path = notePath(format), source = selected ? selected.files?.[path] ?? "" : panel.note?.source ?? "";
  return <div className="flex min-h-0 flex-1 flex-col"><div className="order-last flex shrink-0 justify-end px-3 pb-1"><Popover><PopoverTrigger className="rounded px-2 py-1 text-xs text-fg-3 hover:bg-hover">Note source</PopoverTrigger><PopoverContent className="p-3"><PropertyEditor field={{ key: "source", label: "note asset", type: "asset" }} reference={{ workspaceId: workspace.id, options: workspace.assets.filter(asset => asset.kind === "note" || asset.kind === "markdown").map(asset => ({ assetId: asset.id, label: asset.name })), onOpen: actions.onOpenAsset, onCreate: name => ({ assetId: actions.onCreateDataAsset("note", name) }) }} value={panel.sourceAssetId ? { assetId: panel.sourceAssetId } : undefined} onCommit={value => { const reference = assetReferenceSchema.optional().parse(value); const result = command({ type: "configureNote", panelId: panel.id, sourceAssetId: reference?.assetId ?? null }); if (!result.ok) throw new Error(result.reason); }} /></PopoverContent></Popover></div>
    {panel.sourceAssetId && !selected ? <p role="status" className="p-3 text-sm text-fg-3">Note asset unavailable. Choose a replacement or clear the reference to return to your inline note.</p> : <RichTextEditor compact key={selected?.id ?? panel.id} label="Note body" source={source} format={format} allowCreateAsset={!selected} readOnly={!!selected && !(actions.onCanEditSource?.(selected.id) ?? false)} onCommit={(next, expected) => {
      if (selected) { if (!actions.onSaveNoteAsset) throw new Error("Note editing is unavailable"); actions.onSaveNoteAsset(selected.id, path, next, expected); }
      else { if (source !== expected) throw new Error("Inline note changed"); const result = command({ type: "configureNote", panelId: panel.id, value: { format, source: next } }); if (!result.ok) throw new Error(result.reason); }
    }} />}
  </div>;
}

import { useEffect, useId, useRef, useState } from "react";
import { ASSET_REFERENCE_DROP } from "../../lib/asset-reference-drag";
import type { AssetReference } from "../../../core/asset-references";
import { ASSET_DRAG_TYPE } from "../../workspace-search";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";
import { Input } from "./input";
import { CircleDot, Plus, X } from "lucide-react";

export type ReferenceOption = AssetReference & { label: string; error?: string; url?: string };
/** Trusted, consumer-scoped reference context. Never persist callbacks, available
 * assets or authority in a PropertyField. Creation and opening remain host actions.
 * @example <PropertyEditor field={{key:'source',label:'Source',type:'asset'}} reference={{workspaceId,options}} value={source} onCommit={save} /> */
export type AssetReferenceEditorContext = {
  workspaceId: string;
  options: readonly ReferenceOption[];
  onOpen?: (id: string) => void;
  onCreate?: (name: string) => AssetReference | Promise<AssetReference>;
};
/** Identity picker shared by data properties. Compatibility is supplied by the
 * consumer and checked again at commit; a drag from another workspace is rejected.
 */
export function AssetReferencePicker({ label, workspaceId, options, value, onChange, onOpen, onCreate, disabled = false, clearable = true }: {
  label: string; workspaceId: string; options: readonly ReferenceOption[]; value?: AssetReference;
  onChange: (value?: AssetReference) => void | Promise<void>; onOpen?: (id: string) => void; disabled?: boolean;
  /** Required reference properties can omit Clear while retaining search/drop. */
  clearable?: boolean;
  /** Consumer creates a compatible source through its authorized command service. */
  onCreate?: (name: string) => AssetReference | Promise<AssetReference>;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [error, setError] = useState("");
  const [creating, setCreating] = useState(false), [saving, setSaving] = useState(false);
  const pending = useRef(false), errorId = useId();
  const drop = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.assetId === value?.assetId && o.path === value?.path);
  const commit = async (reference?: AssetReference) => {
    if (disabled || pending.current) return;
    pending.current = true; setSaving(true); setError("");
    try { await onChange(reference); setOpen(false); setQuery(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save reference"); }
    finally { pending.current = false; setSaving(false); }
  };
  const choose = (option: ReferenceOption) => {
    if (disabled || option.error || pending.current) return;
    void commit({ assetId: option.assetId, ...(option.path !== undefined ? { path: option.path } : {}) });
  };
  const accept = (data: { workspaceId?: string; assetId?: string }) => {
    const option = data?.workspaceId === workspaceId && options.find(o => o.assetId === data.assetId && !o.error);
    if (!option) throw new Error("Drop a compatible asset from this workspace"); choose(option);
  };
  useEffect(() => {
    const element = drop.current;
    const receive = (event: Event) => {
      if (disabled) return;
      try { accept((event as CustomEvent).detail); } catch (reason) { setError(reason instanceof Error ? reason.message : "Invalid reference"); }
    };
    element?.addEventListener(ASSET_REFERENCE_DROP, receive);
    return () => element?.removeEventListener(ASSET_REFERENCE_DROP, receive);
  }, [disabled, workspaceId, options, onChange]);
  const message = error || selected?.error || (value && !selected ? "Referenced asset is missing or incompatible" : "");
  const busy = creating || saving;
  return <div ref={drop} data-asset-reference-drop aria-busy={busy || undefined} className="min-w-0 rounded-md data-[reference-hover]:ring-2 data-[reference-hover]:ring-[var(--focus-ring)]" onDragOver={e => { if (!disabled && !pending.current && e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) e.preventDefault(); }} onDrop={e => {
    if (disabled) return; e.preventDefault(); e.stopPropagation();
    try { accept(JSON.parse(e.dataTransfer.getData(ASSET_DRAG_TYPE))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Invalid reference"); }
  }}>
    <div className="flex min-w-0 items-center rounded-md border border-line-2 bg-raised">
      {value && onOpen ? <Button size="sm" variant="ghost" className="min-w-0 flex-1 justify-start truncate" onClick={() => onOpen(value.assetId)}>{selected?.label ?? `Missing: ${value.assetId}`}</Button> : <span className="min-w-0 flex-1 truncate px-3 text-xs text-fg-2">{selected?.label ?? (value ? `Missing: ${value.assetId}` : `Choose ${label}…`)}</span>}
      <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery(""); }}><PopoverTrigger size="sm" variant="ghost" aria-label={`Choose ${label}`} aria-invalid={!!message || undefined} aria-describedby={message ? errorId : undefined} disabled={disabled || busy}><CircleDot size={15} /></PopoverTrigger><PopoverContent aria-label={`Choose ${label}`} align="end" size="md" className="p-3">
        <Input aria-label={`Search ${label}`} placeholder="Search compatible assets…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto" aria-label={`Compatible ${label}`}>
          {options.filter(o => `${o.label} ${o.assetId}`.toLowerCase().includes(query.toLowerCase())).map(o => <Button key={`${o.assetId}:${o.path ?? ""}`} size="sm" variant="ghost" disabled={disabled || busy || !!o.error} title={o.error} aria-pressed={o === selected} className="justify-start text-left aria-pressed:bg-selected" onClick={() => choose(o)}>{o.url && <img src={o.url} alt="" className="size-4" />}<span className="truncate">{o.label}</span></Button>)}
          {!options.some(o => `${o.label} ${o.assetId}`.toLowerCase().includes(query.toLowerCase())) && <p className="p-2 text-xs text-fg-3">No compatible assets.</p>}
        </div>
        {onCreate && <Button size="sm" variant="outline" className="mt-2 w-full justify-start" disabled={busy || disabled} aria-busy={creating} onClick={async () => {
          if (pending.current) return;
          pending.current = true;
          setCreating(true); setError("");
          try { const reference = await onCreate(query.trim() || `New ${label}`); await onChange(reference); setOpen(false); setQuery(""); }
          catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
          finally { pending.current = false; setCreating(false); }
        }}><Plus size={14} />{creating ? "Creating…" : query.trim() ? `Create “${query.trim()}”` : `Create ${label}`}</Button>}
      </PopoverContent></Popover>
      {value && clearable && <Button size="sm" variant="ghost" aria-label={`Clear ${label}`} disabled={disabled || busy} onClick={() => void commit(undefined)}><X size={14} /></Button>}
    </div>
    {message && <p id={errorId} role="alert" className="mt-1 text-xs text-danger">{message}</p>}
  </div>;
}

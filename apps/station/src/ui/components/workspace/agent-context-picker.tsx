import { useEffect, useId, useMemo, useState, type RefObject } from "react";
import type { PromptContextPort, PromptSource } from "../../../features/ai/contracts/context";
import { MAX_ATTACHMENTS } from "../../../features/ai/application/context";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Input } from "../ui/input";
import { X } from "../../lib/icons";
import { ASSET_DRAG_TYPE } from "../../workspace-search";
import { ASSET_REFERENCE_DROP } from "../../lib/asset-reference-drag";
import { useRef } from "react";

const identity = (source: PromptSource) => `${source.assetId}\u0000${source.path ?? ""}`;

/** Explicit composition of source references. @ searches metadata; choosing and
 * sending are separate user actions. Source snapshots are read only on Send. */
export function AgentComposer({ workspaceId, context, value, onChange, references, onReferences, onSend, disabled, composer }: {
  workspaceId: string; context?: PromptContextPort; value: string; onChange(value: string): void;
  references: readonly PromptSource[]; onReferences(value: PromptSource[]): void;
  onSend(): void; disabled: boolean; composer: RefObject<HTMLTextAreaElement | null>;
}) {
  const uid = useId(), drop = useRef<HTMLDivElement>(null);
  const [sources, setSources] = useState<readonly PromptSource[]>([]);
  const [query, setQuery] = useState(""), [open, setOpen] = useState(false), [active, setActive] = useState(0), [error, setError] = useState("");
  const [dismissed, setDismissed] = useState("");
  const mention = value.match(/(?:^|\s)@([^@\n]*)$/);
  const mentioning = !!mention && value !== dismissed;
  useEffect(() => { if (!context) return; const update = () => setSources(context.list(workspaceId)); update(); return context.subscribe(update); }, [context, workspaceId]);
  const search = mentioning ? mention![1]! : query;
  const results = useMemo(() => sources.filter(source => !references.some(item => identity(item) === identity(source)) && `${source.name} ${source.path ?? ""} ${source.kind}`.toLowerCase().includes(search.toLowerCase())).slice(0, 30), [sources, references, search]);
  useEffect(() => setActive(0), [search]);
  const choose = (source: PromptSource) => {
    if (disabled) return;
    if (references.length >= MAX_ATTACHMENTS) { setError(`Attach at most ${MAX_ATTACHMENTS} sources.`); return; }
    if (!references.some(item => identity(item) === identity(source))) onReferences([...references, source]);
    if (mentioning) onChange(value.slice(0, value.lastIndexOf("@")));
    setOpen(false); setQuery(""); setError(""); composer.current?.focus();
  };
  useEffect(() => {
    const element = drop.current;
    const receive = (event: Event) => {
      if (disabled) return;
      const data = (event as CustomEvent).detail;
      const source = data?.workspaceId === workspaceId && sources.find(item => item.assetId === data.assetId && !item.path);
      if (source) choose(source); else setError("Choose an asset from this workspace.");
    };
    element?.addEventListener(ASSET_REFERENCE_DROP, receive);
    return () => element?.removeEventListener(ASSET_REFERENCE_DROP, receive);
  }, [disabled, workspaceId, sources, references, value]);
  const choices = <div id={`${uid}-sources`} role="listbox" aria-label="Sources to share" className="max-h-56 overflow-y-auto">
    {results.map((source, index) => <button key={identity(source)} id={`${uid}-source-${index}`} type="button" role="option" aria-selected={index === active} className={`flex min-h-10 w-full flex-col rounded-md px-3 py-2 text-left text-xs focus-visible:outline focus-visible:outline-ring ${index === active ? "bg-hover" : ""}`} onPointerMove={() => setActive(index)} onClick={() => choose(source)}>
      <span className="max-w-full truncate font-medium text-fg">{source.name}{source.path ? ` / ${source.path}` : ""}</span>
      <span className="text-fg-3">{source.path ? "File" : source.kind} · revision {source.revision}</span>
    </button>)}
    {!results.length && <p className="p-3 text-xs text-fg-3">No matching sources. Try a note or file name.</p>}
  </div>;
  return <div ref={drop} data-asset-reference-drop className="min-w-0 space-y-2 rounded-lg data-[reference-hover]:ring-2 data-[reference-hover]:ring-ring" onDragOver={event => { if (!disabled && event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) event.preventDefault(); }} onDrop={event => {
    if (disabled) return; event.preventDefault();
    try { const data = JSON.parse(event.dataTransfer.getData(ASSET_DRAG_TYPE)); const source = data.workspaceId === workspaceId && sources.find(item => item.assetId === data.assetId && !item.path); if (!source) throw new Error(); choose(source); } catch { setError("Choose an asset from this workspace."); }
  }}>
    {!!references.length && <ul aria-label="Attached sources" className="flex flex-wrap gap-1">{references.map(source => <li key={identity(source)} className="flex max-w-full items-center gap-1 rounded-md border border-line bg-muted px-2 py-1 text-xs"><span className="truncate" title={`${source.assetId}${source.path ? ` / ${source.path}` : ""} · revision ${source.revision}`}>{source.name}{source.path ? ` / ${source.path}` : ""}</span><button type="button" aria-label={`Remove ${source.name}${source.path ? ` / ${source.path}` : ""} attachment`} disabled={disabled} className="shrink-0 rounded p-1 focus-visible:outline focus-visible:outline-ring" onClick={() => onReferences(references.filter(item => identity(item) !== identity(source)))}><X size={12} /></button></li>)}</ul>}
    {mentioning && choices}
    <label htmlFor={`${uid}-message`} className="sr-only">Message Station</label>
    <textarea ref={composer} id={`${uid}-message`} placeholder="Ask Station to work on something… Type @ to add notes and files" value={value} maxLength={8000} rows={2} disabled={disabled} aria-autocomplete="list" aria-controls={mentioning ? `${uid}-sources` : undefined} aria-activedescendant={mentioning && results[active] ? `${uid}-source-${active}` : undefined}
      className="w-full resize-none rounded-lg border border-line-2 bg-frame p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50" onChange={event => { onChange(event.target.value); setDismissed(""); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (mentioning) {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDismissed(value); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(0, Math.min(results.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); return; }
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (results[active]) choose(results[active]!); return; }
        }
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!disabled) onSend(); }
      }} />
    {context && <Popover open={open} onOpenChange={setOpen}><PopoverTrigger render={<Button type="button" size="sm" variant="ghost" disabled={disabled || references.length >= MAX_ATTACHMENTS}>@ Add context</Button>} /><PopoverContent><Input aria-label="Find notes and files" placeholder="Find notes, assets or files…" value={query} onChange={event => setQuery(event.target.value)} />{choices}</PopoverContent></Popover>}
    <p className="text-[11px] text-fg-3">Attached source snapshots are shared with your selected model when you send.</p>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}

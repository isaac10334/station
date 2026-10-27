import { useEffect, useRef, useState } from "react";
import { vectorCommandInfoSchema, type VectorCommandInfo } from "../../../core/vector-editor";
import type { CommandPorts } from "../../../contracts/command-ports";
import { Button } from "../ui/button";
import { CodeInput } from "../ui/code-input";
import { NativeSelect } from "../ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "../ui/dialog";
type Session = ReturnType<NonNullable<CommandPorts["vectorEditors"]>["get"]>;
type Registration = Session & { workspaceId: string; assetId: string; panelId: string; revision: number };
type Props = { normalize(source: string): string; preview(source: string): string; workspaceId: string; assetId: string; ownerId: string; revision: number; source: string; editable: boolean; onCommit(source: string, expected: string): void; register(session: Registration): () => void; run<T>(method: string, params: unknown, signal?: AbortSignal): Promise<T> };

/** An opaque frame lends bounded document operations, never its Window/API.
 * The application registry authorizes commands; Apply alone saves asset source. */
export function VectorcraftEditor(props: Props) {
  if (!props.editable) return <p className="p-4 text-sm text-fg-3">Read-only SVG. Fork this asset to edit it in VectorCraft.</p>;
  return <VectorcraftSession {...props} />;
}
function VectorcraftSession({ workspaceId, assetId, ownerId, revision, source, onCommit, register, run, normalize, preview }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null), container = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false), [commandOpen, setCommandOpen] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setStarted(true); observer.disconnect(); } });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const [generation, setGeneration] = useState(0), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState({ source, revision });
  const [catalog, setCatalog] = useState<VectorCommandInfo[]>([]), [commandId, setCommandId] = useState("shape.rectangle"), [params, setParams] = useState('{"x":4,"y":4,"width":12,"height":8}'), [result, setResult] = useState(""), [filter, setFilter] = useState("");
  useEffect(() => {
    if (!started || loaded) return;
    const timer = setTimeout(() => setError("VectorCraft did not load. Reload to retry, or use Source/the SVG editor; your saved source is retained."), 45000);
    return () => clearTimeout(timer);
  }, [started, loaded, generation]);
  const pending = useRef(new Map<string, { resolve(value: any): void; reject(error: Error): void }>());
  const saved = useRef(baseline); saved.current = baseline;
  const stale = source !== baseline.source || revision !== baseline.revision;
  const request = (action: string, extra: object = {}, signal?: AbortSignal): Promise<any> => new Promise((resolve, reject) => {
    const rect = iframe.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight) { reject(new Error("Open the visible VectorCraft drawing before issuing commands")); return; }
    if (signal?.aborted) { reject(new Error("Operation cancelled")); return; }
    const id = crypto.randomUUID();
    const settle = (error?: Error, value?: unknown) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); pending.current.delete(id); error ? reject(error) : resolve(value); };
    const abort = () => settle(new Error("Cancelled. The vendor may have begun editing its draft; inspect before applying."));
    const timer = setTimeout(() => settle(new Error("Reply timed out. Reload saved source before retrying.")), 30000);
    pending.current.set(id, { resolve: value => settle(undefined, value), reject: error => settle(error) });
    signal?.addEventListener("abort", abort, { once: true });
    iframe.current?.contentWindow?.postMessage({ type: "station:vectorcraft", requestId: id, action, ...extra }, "*");
  });
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.origin !== "null" || event.data?.type !== "station:vectorcraft") return;
      if (event.data.requestId === "ready") {
        if (event.data.error) { setError(String(event.data.error)); return; }
        try { preview(saved.current.source); } catch (error) { setError(String(error)); return; }
        void request("load", { source: saved.current.source }).then(() => { setLoaded(true); setError(""); }, error => setError(String(error)));
        return;
      }
      const receiver = pending.current.get(event.data.requestId);
      if (event.data.error) receiver?.reject(new Error(String(event.data.error).slice(0, 1000)));
      else receiver?.resolve(event.data.result);
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); for (const receiver of [...pending.current.values()]) receiver.reject(new Error("Editor closed")); };
  }, [generation]);
  useEffect(() => {
    if (!loaded) return;
    return register({ workspaceId, assetId, panelId: ownerId, revision: baseline.revision,
      commands: async signal => vectorCommandInfoSchema.array().max(4096).parse(await request("commands", {}, signal)),
      execute: (command, signal) => request("execute", { command }, signal),
      export: async signal => { const output = await request("export", {}, signal); if (typeof output?.source !== "string") throw new Error("Invalid export"); return { source: output.source }; },
    });
  }, [loaded, workspaceId, assetId, ownerId, baseline.revision, generation, register]);
  const normalizeExport = (raw: string) => {
    const document = new DOMParser().parseFromString(raw, "image/svg+xml");
    if (document.querySelector("parsererror")) throw new Error("Invalid exported SVG");
    for (const node of Array.from(document.querySelectorAll("[data-name]"))) node.removeAttribute("data-name");
    return normalize(new XMLSerializer().serializeToString(document));
  };
  const apply = async () => {
    setBusy(true); setError("");
    try {
      const output = await run<{source: string}>("vector.editor.export", { assetId, panelId: ownerId, revision: baseline.revision });
      const latest = normalizeExport(output.source);
      if (latest !== draft) { setDraft(latest); setNotice("Drawing changed since preview. Review the updated export, then Apply again."); return; }
      onCommit(latest, baseline.source); setBaseline({ source: latest, revision: revision + 1 }); setNotice("SVG applied"); setDraft("");
    } catch (error) { setError(String(error)); } finally { setBusy(false); }
  };
  const invoke = async (action: "commands" | "execute" | "export") => {
    setBusy(true); setError(""); setNotice("");
    try {
      const value = await run<any>(`vector.editor.${action}`, { assetId, panelId: ownerId, revision: baseline.revision, ...(action === "execute" ? { command: { id: commandId, params: JSON.parse(params) } } : {}) });
      if (action === "commands") setCatalog(value);
      else if (action === "execute") { setDraft(""); setResult(JSON.stringify(value, null, 2)); setNotice("Command changed the drawing draft. Preview export before applying."); }
      else {
        setDraft(normalizeExport(value.source));
        setNotice("Export ready. Apply saves this revision to the asset.");
      }
    } catch (error) { setError(String(error)); } finally { setBusy(false); }
  };
  return <div ref={container} className="vectorcraft-editor flex min-h-0 flex-1 flex-col" aria-busy={busy}>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line p-2"><strong className="mr-auto text-sm">VectorCraft</strong><Button size="sm" variant="outline" disabled={!loaded || busy || stale} onClick={() => void invoke("export")}>Preview export</Button><Button size="sm" disabled={!draft || busy || stale} onClick={() => void apply()}>Apply SVG</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => { setLoaded(false); setBaseline({ source, revision }); setDraft(""); setError(""); setGeneration(value => value + 1); }}>Reload saved source</Button></div>
    {stale && <p role="status" className="p-2 text-xs text-fg-3">Saved source changed. Your drawing remains here; reload before applying.</p>}
    {error && <p role="alert" className="p-2 text-xs text-danger">{error}</p>}
    {!loaded && !error && <p role="status" className="p-2 text-xs text-fg-3">Starting VectorCraft · the first load includes its drawing engine.</p>}
    {started && <iframe key={generation} ref={iframe} title="VectorCraft drawing application" src="/integrations/vectorcraft/editor" sandbox="allow-scripts" className="min-h-[180px] w-full flex-1 border-0" />}
    <div className="shrink-0 border-t border-line p-2"><Button size="sm" variant="outline" onClick={() => setCommandOpen(true)}>Commands</Button></div><Dialog open={commandOpen} onOpenChange={setCommandOpen}><DialogContent size="lg"><DialogHeader><DialogTitle>VectorCraft commands</DialogTitle></DialogHeader><DialogBody><div className="mt-3 grid gap-3 @min-[640px]:grid-cols-2"><div className="space-y-2"><Button size="sm" variant="outline" disabled={!loaded || busy || stale} onClick={() => void invoke("commands")}>Refresh command catalog</Button><input aria-label="Find VectorCraft command" placeholder="Find a command" value={filter} onChange={event => setFilter(event.target.value)} className="w-full rounded border border-line bg-frame p-2 text-sm" /><NativeSelect aria-label="VectorCraft command" value={commandId} onChange={event => setCommandId(event.target.value)}>{!catalog.length && <option value="shape.rectangle">Rectangle</option>}{catalog.filter(item => item.allowed && `${item.id} ${item.label}`.toLowerCase().includes(filter.toLowerCase())).map(item => <option key={item.id} value={item.id} disabled={!item.enabled}>{item.label} · {item.id}</option>)}</NativeSelect><p className="break-words text-xs text-fg-3">{catalog.find(item => item.id === commandId)?.params ?? "{x, y, width, height}"}</p></div><div className="space-y-2"><CodeInput label="VectorCraft parameters" value={params} onChange={setParams} path="parameters.json" /><Button size="sm" disabled={!loaded || busy || stale} onClick={() => void invoke("execute")}>Run document command</Button></div></div>{result && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{result}</pre>}{busy && <p role="status" className="p-2 text-xs text-fg-3">Running document operation�</p>}{error && <p role="alert" className="p-2 text-xs text-danger">{error}</p>}{notice && <p role="status" className="p-2 text-xs text-fg-3">{notice}</p>}</DialogBody></DialogContent></Dialog>
    {draft && <section aria-label="Exported SVG preview" className="flex shrink-0 items-center gap-3 border-t border-line p-3"><img src={preview(draft)} alt="Pending SVG export" className="size-24 object-contain" /><p className="text-xs text-fg-3">Pending export · the asset changes only when you Apply.</p></section>}
    {notice && <p role="status" className="p-2 text-xs text-fg-3">{notice}</p>}
  </div>;
}

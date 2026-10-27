import { useEffect, useState } from "react";
import { deps } from "../../../composition";
import { Input } from "../ui/input";

/** Read-only timeline over the same schema-checked operation used by scoped
 * agents. Host lifecycle is owner-only; external tasks see their own activity.
 */
export function RuntimeTimeline() {
  const [, refresh] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => deps.control.subscribe(() => refresh(n => n + 1)), []);
  const snapshot = deps.control.execute({ method: "runtime.inspect", params: {} }).result;
  const lifecycle = snapshot.lifecycle;
  const events = [...(lifecycle?.events ?? []).map((e: any) => ({ key: `host:${e.sequence}`, at: e.at, label: e.label, kind: e.kind, state: e.state, detail: e.subjectId })),
    ...snapshot.activity.map((e: any) => ({ key: `command:${e.sequence}`, at: e.at, label: e.method, kind: "command", state: e.outcome, detail: e.taskId }))]
    .filter(e => `${e.label} ${e.kind} ${e.state} ${e.detail}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.at - a.at).slice(0, 200);
  return <div className="space-y-3 py-3">
    <div className="grid grid-cols-2 gap-2 text-xs @min-[500px]:grid-cols-4">{[["Providers", lifecycle?.providers ?? 0], ["Scopes", lifecycle?.scopes ?? 0], ["Acquisitions", lifecycle?.acquisitions ?? 0], ["Revision", snapshot.revision]].map(([label, count]) => <div key={label} className="rounded-md border border-line p-2"><span className="text-fg-3">{label}</span><strong className="block text-lg font-medium tabular-nums">{count}</strong></div>)}</div>
    <Input aria-label="Filter runtime timeline" placeholder="Filter commands, scopes, providers…" value={query} onChange={e => setQuery(e.target.value)} />
    <p className="text-xs text-fg-3">Session history · newest first · up to 200 matching events. Metadata only; no source, credentials, arguments or service values. Reload starts a new history.</p>
    <ol className="divide-y divide-line" aria-label="Runtime event timeline">{events.map(event => <li key={event.key} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 py-2 text-xs"><time className="tabular-nums text-fg-3">{new Date(event.at).toLocaleTimeString()}</time><div className="min-w-0"><p className="break-all font-medium">{event.label}</p><p className="text-fg-3">{event.kind} · {event.state}</p><code className="break-all text-[10px] text-fg-3">{event.detail}</code></div></li>)}</ol>
    {!events.length && <p className="text-xs text-fg-3">No matching activity. Acquire a capability or open an asset to inspect its lifecycle.</p>}
  </div>;
}

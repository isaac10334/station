import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ModelMessage } from "ai";
import { Button } from "./components/ui/button";
import { AISettingsEditor } from "./components/workspace/ai-settings-editor";
import { aiConversation } from "./ai-capabilities";
import { AI_GRANTS, createAITools, type DraftProposal } from "./ai-tools";
import type { WorkspaceCapabilityRuntime } from "./workspace-capabilities";
import type { GrantedWidgetScope } from "./widget-grants";

/** Built-in chat instance. Grants, transcript and pending approvals live only for
 * this mounted widget. Workspace changes, grant edits and removal cancel owned work.
 */
export function AIChatWidget({ workspaceId, instanceId, runtime }: { workspaceId: string; instanceId: string; runtime: WorkspaceCapabilityRuntime }) {
  const uid = useId();
  const settings = useSyncExternalStore(runtime.aiSettings.subscribe, runtime.aiSettings.get);
  const [grants, setGrants] = useState<Set<string>>(() => new Set());
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [activity, setActivity] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<DraftProposal | null>(null);
  const history = useRef<ModelMessage[]>([]);
  const active = useRef<{ controller: AbortController; scope: GrantedWidgetScope; review?: (allow: boolean) => void } | null>(null);
  const mounted = useRef(true);
  const stop = () => {
    const turn = active.current;
    if (!turn) return;
    turn.controller.abort(); turn.review?.(false); void turn.scope.revoke().catch(() => {});
    active.current = null;
    if (mounted.current) { setBusy(false); setProposal(null); }
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); history.current = []; };
  }, [workspaceId, instanceId]);
  useEffect(() => runtime.aiSettings.subscribe(() => { stop(); history.current = []; }), [runtime]);

  async function send() {
    if (active.current || !input.trim() || !settings.apiKey || !grants.has(aiConversation.id)) return;
    setError("");
    const text = input.trim();
    if (text.length > 8000) { setError("Keep messages under 8,000 characters."); return; }
    let scope: GrantedWidgetScope;
    try { scope = runtime.openWidgetScope(workspaceId, instanceId, grants); }
    catch { setError("This widget is no longer available."); return; }
    const turn = { controller: new AbortController(), scope, review: undefined as ((allow: boolean) => void) | undefined };
    active.current = turn;
    setInput(""); setBusy(true); setActivity([]);
    setMessages(previous => [...previous.slice(-38), { role: "You", text }, { role: "Station", text: "" }]);
    const current = () => mounted.current && active.current === turn && !turn.controller.signal.aborted;
    const review = (draft: DraftProposal) => new Promise<boolean>(resolve => {
      if (!current()) { resolve(false); return; }
      turn.review = allow => { turn.review = undefined; if (current()) setProposal(null); resolve(allow); };
      setProposal(draft);
    });
    try {
      const ai = await scope.acquire(aiConversation);
      const next: ModelMessage[] = [...history.current, { role: "user", content: text }];
      if (JSON.stringify(next).length > 128_000) throw new Error("Conversation limit");
      const tools = createAITools(scope, grants, review, message => { if (current()) setActivity(previous => [...previous, message]); });
      const response = await ai.run(next, tools, turn.controller.signal, delta => {
        if (current()) setMessages(previous => previous.map((message, index) => index === previous.length - 1 ? { ...message, text: message.text + delta } : message));
      });
      if (current()) history.current = [...next, ...response];
    } catch {
      if (current()) setError("Request failed. Check your Gateway key, model, credits and connection. For a full conversation, start a new chat.");
    } finally {
      if (active.current === turn) { turn.review?.(false); active.current = null; if (mounted.current) { setBusy(false); setProposal(null); } }
      await scope.revoke();
    }
  }
  return <div className="min-w-0 space-y-4 p-4 text-sm" aria-label="AI chat">
    <details open={!settings.apiKey}><summary className="cursor-pointer font-medium">AI settings</summary><div className="mt-3"><AISettingsEditor key={`${settings.model}:${settings.rememberKey}:${Boolean(settings.apiKey)}`} settings={runtime.aiSettings} /></div></details>
    <details open={!grants.has(aiConversation.id)}><summary className="cursor-pointer font-medium">Tools · {grants.size} granted</summary>
      <p className="my-2 text-xs text-muted-foreground">Allow this widget to use these capabilities for this session. Tool results may be sent to your model.</p>
      <fieldset className="space-y-3"><legend className="sr-only">Widget capability grants</legend>{AI_GRANTS.map((grant, index) => <label key={grant.id} htmlFor={`${uid}-grant-${index}`} className="flex items-start gap-2">
        <input id={`${uid}-grant-${index}`} type="checkbox" className="mt-1" checked={grants.has(grant.id)} onChange={event => {
          stop(); history.current = [];
          setGrants(previous => { const next = new Set(previous); if (event.target.checked) next.add(grant.id); else next.delete(grant.id); return next; });
          setError("Tool access changed. The next message starts a fresh model conversation.");
        }} /><span><span className="block font-medium">{grant.name}</span><span className="block text-xs text-muted-foreground">{grant.description}</span></span>
      </label>)}</fieldset>
    </details>
    {messages.length === 0 && <p className="py-3 text-muted-foreground">Ask a question, explore your assets, or describe a web widget to draft. Enable the tools you want Station to use.</p>}
    <div role="log" aria-label="Conversation" className="space-y-3">{messages.map((message, index) => <div key={index} className="min-w-0"><strong className="text-xs text-muted-foreground">{message.role}</strong><p className="whitespace-pre-wrap break-words leading-relaxed">{message.text || (busy ? "Thinking…" : "Response stopped.")}</p></div>)}</div>
    {activity.length > 0 && <ul aria-label="Tool activity" className="space-y-1 text-xs text-muted-foreground">{activity.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    {proposal && <section aria-label="Review web draft" className="space-y-2 rounded-lg border border-border p-3"><h3 className="font-medium">Save “{proposal.name}”?</h3><p className="text-xs text-muted-foreground">Creates a new asset. Review the HTML before saving; you can open its isolated preview from the Asset browser.</p><pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{proposal.html}</pre><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => active.current?.review?.(true)}>Save draft</Button><Button size="sm" variant="outline" onClick={() => active.current?.review?.(false)}>Decline</Button></div></section>}
    {error && <p role="status" className="text-xs text-muted-foreground">{error}</p>}
    <form className="space-y-2" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label htmlFor={`${uid}-message`} className="sr-only">Message Station</label><textarea id={`${uid}-message`} placeholder="Message Station…" value={input} maxLength={8000} rows={3} disabled={busy} className="w-full resize-y rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50" onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy) void send(); } }} />
      <div className="flex flex-wrap gap-2">{busy ? <Button type="button" size="sm" variant="outline" onClick={stop}>Stop response</Button> : <Button type="submit" size="sm" disabled={!input.trim() || !settings.apiKey || !grants.has(aiConversation.id)}>Send</Button>}<Button type="button" variant="ghost" size="sm" onClick={() => { stop(); history.current = []; setMessages([]); setActivity([]); setError(""); }}>New chat</Button></div>
      <p className="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</p>
    </form>
  </div>;
}

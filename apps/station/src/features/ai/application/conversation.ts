/** React-free conversation owner. One controller per retained widget instance.
 * start subscribes; dispose cancels reviews/turns and removes subscriptions. Layout
 * movement never recreates this object. Provider history and authority are ephemeral.
 * @example
 * const chat = createConversation(ports, workspaceId, instanceId);
 * const release = chat.start();
 * try { await chat.send("Hello"); } finally { release(); }
 */
import type { ModelMessage } from "ai";
import { aiConversation } from "../../../contracts/ai-conversation";
import type { GrantedWidgetScope } from "../../../contracts/widget-runtime";
import type { ChatPorts, ChatMessage, DraftProposal } from "../contracts/chat";
import type { PromptReference, PromptAttachment } from "../contracts/context";
import { composePrompt } from "./context";

export function createConversation(ports: ChatPorts, workspaceId: string, instanceId: string) {
  let state = { messages: [] as ChatMessage[], busy: false, error: "", notice: "", proposal: null as DraftProposal | null, taskId: "", grants: new Set<string>() as ReadonlySet<string>, lastPrompt: "" };
  let history: ModelMessage[] = [];
  let lastAttachments: readonly PromptAttachment[] = [];
  let active: { controller: AbortController; scope: GrantedWidgetScope; review?: (allow: boolean) => void } | undefined;
  let started = false;
  let releases: (() => void)[] = [];
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const tail = (patch: (value: ChatMessage) => ChatMessage) => publish({ messages: state.messages.map((value, i) => i === state.messages.length - 1 ? patch(value) : value) });
  function stop() {
    const turn = active;
    if (!turn) return;
    active = undefined;
    turn.controller.abort();
    turn.review?.(false);
    void turn.scope.revoke().catch(() => {});
    publish({ busy: false, proposal: null, messages: state.messages.map(message => message.status === "streaming" ? { ...message, status: "stopped", tools: message.tools?.map(event => event.state === "running" ? { ...event, state: "error", result: "Stopped" } : event) } : message) });
  }
  function fresh(notice = "") {
    stop(); history = []; lastAttachments = [];
    publish({ messages: [], error: "", notice, lastPrompt: "" });
  }
  function dispose() {
    started = false;
    releases.splice(0).forEach(release => release());
    stop(); history = [];
  }
  async function send(prompt: string, retry = false, references: readonly PromptReference[] = []) {
    const text = prompt.trim();
    if (!started || active || !text || !ports.settings.get().apiKey || !state.grants.has(aiConversation.id)) return;
    if (!retry && state.messages.length >= 80) { publish({ error: "Chat limit reached. Start a new chat." }); return; }
    if (text.length > 8000) { publish({ error: "Keep messages under 8,000 characters." }); return; }
    let attachments: readonly PromptAttachment[], composed: string;
    try {
      if (references.length && !ports.context) throw new Error("Source attachments are unavailable.");
      attachments = retry ? lastAttachments : references.map(reference => ports.context!.read(workspaceId, reference));
      composed = composePrompt(text, attachments);
    } catch (reason) { publish({ error: reason instanceof Error ? reason.message : "Could not attach source." }); return; }
    let scope: GrantedWidgetScope;
    try { scope = ports.openScope(workspaceId, instanceId, state.grants); }
    catch { publish({ error: "This widget is no longer available." }); return; }
    const turn = { controller: new AbortController(), scope, review: undefined as ((allow: boolean) => void) | undefined };
    active = turn;
    lastAttachments = attachments;
    const current = () => started && active === turn && !turn.controller.signal.aborted;
    scope.signal.addEventListener("abort", () => { if (active === turn) stop(); }, { once: true, signal: turn.controller.signal });
    publish({ error: "", notice: "", lastPrompt: text, busy: true, messages: [...(retry ? state.messages.slice(0, -2) : state.messages), { role: "You", text, attachments }, { role: "Station", text: "", status: "streaming" }] });
    try {
      scope.signal.throwIfAborted();
      const ai = await scope.acquire(aiConversation);
      if (!current()) return;
      const next: ModelMessage[] = [...history, { role: "user", content: composed }];
      if (JSON.stringify(next).length > 128_000) throw new Error("Conversation limit");
      const tools = ports.tools({ taskId: state.taskId, scope, grants: state.grants,
        review: draft => new Promise<boolean>(resolve => {
          if (!current() || turn.review) { resolve(false); return; }
          turn.review = allow => { turn.review = undefined; if (current()) publish({ proposal: null }); resolve(allow); };
          publish({ proposal: draft });
        }),
        activity: message => { if (current()) tail(item => ({ ...item, activity: [...(item.activity ?? []).slice(-19), message] })); },
        context: read => { if (current()) tail(item => ({ ...item, context: [...(item.context ?? []), read].slice(-20) })); },
      });
      const response = await ai.run(next, tools, turn.controller.signal,
        delta => { if (current()) tail(item => ({ ...item, text: item.text + delta })); },
        event => { if (current()) tail(item => ({ ...item, tools: [...(item.tools ?? []).filter(t => t.id !== event.id), event].slice(-20) })); });
      if (current()) { history = [...next, ...response]; tail(item => ({ ...item, status: "done" })); }
    } catch {
      if (current()) {
        tail(item => ({ ...item, status: "error" }));
        publish({ error: "Request failed. Check your Gateway key, model, credits and connection. For a full conversation, start a new chat." });
      }
    } finally {
      turn.review?.(false);
      if (active === turn) { active = undefined; publish({ busy: false, proposal: null }); }
      turn.controller.abort();
      await scope.revoke().catch(() => {});
    }
  }
  return {
    get: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      if (started) throw new Error("Conversation already started");
      started = true;
      releases = [ports.settings.subscribe(() => fresh("AI settings changed. Started a fresh chat.")), ports.tasks.subscribe(() => {
        if (state.taskId) { try { ports.tasks.check(state.taskId); } catch { stop(); } }
        publish({});
      })];
      return dispose;
    },
    send, stop, fresh, dispose,
    review: (allow: boolean) => active?.review?.(allow),
    setGrants(grants: Iterable<string>) { fresh("Tool access changed. Started a fresh chat."); publish({ grants: new Set(grants) }); },
    setTask(taskId: string) { if (taskId) ports.tasks.check(taskId); fresh("Task changed. Started a fresh chat."); publish({ taskId }); },
    selectModel(model: string) { try { ports.settings.save({ ...ports.settings.get(), model }); } catch { publish({ error: "Could not save the model selection." }); } },
  };
}

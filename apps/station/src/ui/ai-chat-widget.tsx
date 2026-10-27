import {
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ModelPicker,
  type ModelCapability,
  type Model,
} from "./components/ui/model-picker";
import { CHAT_MODELS } from "../core/chat-models";
import { BUILTIN_AUTHORED_SURFACES, type AuthoredSurface } from "../core/authored-surface";
import { AuthoredSurfaceView } from "./components/workspace/authored-surface";
import {
  formatModelPrice,
  type CatalogModel,
} from "../features/ai/contracts/catalog";
import { ChatModelCatalog } from "./components/workspace/chat-model-catalog";
import { ChatGrantsDialog } from "./components/workspace/chat-grants-dialog";
import { useChatServices } from "./chat-services";
import { createConversation } from "../features/ai/application/conversation";
import { NativeSelect } from "./components/ui/native-select";
import { AgentComposer } from "./components/workspace/agent-context-picker";
import type { PromptSource } from "../features/ai/contracts/context";
import { AgentAccessSettings } from "./components/workspace/agent-access-settings";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody } from "./components/ui/dialog";

import {
  StreamingText,
} from "./components/ui/streaming-text";
import { CopyButton } from "./components/ui/copy-button";
import { ActionTooltip } from "./components/ui/action-tooltip";
import { IconAction } from "./components/ui/icon-action";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
} from "./components/ui/popover";
import { Settings, Plus, ArrowUp, Square } from "./lib/icons";
import { Button } from "./components/ui/button";
import { AISettingsEditor } from "./components/workspace/ai-settings-editor";
import { aiConversation } from "../contracts/ai-conversation";
/** Built-in chat instance. Grants, transcript and pending approvals live only for
 * this mounted widget. Workspace changes, grant edits and removal cancel owned work.
 */
export function AIChatWidget({
  workspaceId,
  instanceId,
  surface = BUILTIN_AUTHORED_SURFACES["ai-chat"],
}: {
  workspaceId: string;
  instanceId: string;
  surface?: AuthoredSurface;
}) {
  const uid = useId();
  const ports = useChatServices();
  const conversation = useMemo(() => createConversation(ports, workspaceId, instanceId), [ports, workspaceId, instanceId]);
  useEffect(() => conversation.start(), [conversation]);
  const { taskId, grants, messages, busy, error, proposal, notice, lastPrompt } = useSyncExternalStore(conversation.subscribe, conversation.get);
  const settings = useSyncExternalStore(ports.settings.subscribe, ports.settings.get);
  const [catalog, setCatalog] = useState<readonly CatalogModel[]>(CHAT_MODELS);
  useEffect(() => {
    const controller = new AbortController();
    void ports.catalog.load(controller.signal).then(result => { if (!controller.signal.aborted) setCatalog(result.models); }).catch(() => {});
    return () => controller.abort();
  }, [ports]);
  const recommended = CHAT_MODELS.map(
    (model) => catalog.find((item) => item.id === model.id) ?? model,
  );
  const selected = catalog.find((model) => model.id === settings.model);
  if (selected && !recommended.some((model) => model.id === selected.id))
    recommended.push(selected);
  const models: Model[] = recommended.map((model) => ({
    value: model.id,
    name: model.name,
    description: `$${formatModelPrice(model.input)} input / $${formatModelPrice(model.output)} output per M tokens`,
    capabilities: model.tags.flatMap((tag) =>
      tag === "tool-use" || tag === "tools"
        ? ["tools" as ModelCapability]
        : ["reasoning", "vision", "long-context"].includes(tag)
          ? [tag as ModelCapability]
          : [],
    ),
  }));
  if (!models.some((model) => model.value === settings.model))
    models.push({
      value: settings.model,
      name: settings.model,
      description: "Custom Gateway model",
      capabilities: [],
      speed: undefined,
      cost: undefined,
    });
  const [input, setInput] = useState("");
  const [references, setReferences] = useState<PromptSource[]>([]);
  const [accessOpen, setAccessOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // Adapted from Stealth chat-thread: follow growth only within 32px of the
  // bottom. Never scroll an ancestor or force a reader off old messages.
  const pinned = useRef(true);
  const hasMessages = useRef(false); hasMessages.current = messages.length > 0;
  const [atBottom, setAtBottom] = useState(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (scroller.current && (!messages.length || pinned.current))
      scroller.current.scrollTop = messages.length ? scroller.current.scrollHeight : 0;
  }, [messages, proposal]);
  useEffect(() => {
    if (!content.current) return;
    const observer = new ResizeObserver(() => {
      if (hasMessages.current && pinned.current && scroller.current)
        scroller.current.scrollTop = scroller.current.scrollHeight;
    });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  const stop = conversation.stop;
  const fresh = (message = "") => {
    conversation.fresh(message);
    setReferences([]);
    pinned.current = true;
    setAtBottom(true);
  };
  const selectModel = conversation.selectModel;
  async function send(retry?: string) {
    const prompt = retry ?? input;
    const pending = conversation.send(prompt, retry !== undefined, retry === undefined ? references : []);
    if (conversation.get().busy) { setInput(""); setReferences([]); }
    await pending.finally(() => {
      requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
    });
  }
  return (
    <div
      className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden text-sm"
      aria-label="Station agent"
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <ModelPicker
            className="max-w-full"
            models={models}
            value={settings.model}
            label="Chat model"
            disabled={busy}
            onValueChange={selectModel}
          />
        </div>
        <ChatModelCatalog onSelect={selectModel} onCatalog={setCatalog} />
        <span className="sr-only" role="status">
          {busy ? "Working…" : ""}
        </span>
        <Popover>
          <ActionTooltip label="AI settings">
            <PopoverTrigger aria-label="AI settings" size="sm" variant="ghost">
              <Settings />
            </PopoverTrigger>
          </ActionTooltip>
          <PopoverContent>
            <PopoverHeader title="AI settings" />
            <AISettingsEditor
              key={`${settings.model}:${settings.rememberKey}:${Boolean(settings.apiKey)}`}
              settings={ports.settings}
            />
          </PopoverContent>
        </Popover>
        <ChatGrantsDialog
          grants={grants}
          onApply={(next) => {
            fresh("Tool access changed. Started a fresh chat.");
            conversation.setGrants(next);
          }}
        />
        <IconAction
          label="New chat"
          className="size-7 border-transparent bg-transparent"
          onClick={() => {
            fresh();
            setInput("");
          }}
        >
          <Plus />
        </IconAction>
      </div>
      {settings.apiKey && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
        <label htmlFor={`${uid}-task`}>Task</label>
        <NativeSelect id={`${uid}-task`} aria-label="Authorized chat task" value={taskId} disabled={busy} onChange={e => { fresh("Task changed. Started a fresh chat."); conversation.setTask(e.target.value); }}>
          <option value="">Reviewed drafts only</option>
          {ports.tasks.list(workspaceId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </NativeSelect>
        <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
          <DialogTrigger render={<Button type="button" size="sm" variant="ghost" disabled={busy}>Workspace tools</Button>} />
          <DialogContent><DialogHeader><DialogTitle>Authorize workspace tools</DialogTitle><DialogDescription>Choose what this agent can read, create or change for the next hour. Existing assets start unselected.</DialogDescription></DialogHeader><DialogBody><AgentAccessSettings forAgent onAuthorized={id => { conversation.setTask(id); setAccessOpen(false); }} /></DialogBody></DialogContent>
        </Dialog>
      </div>}
      <div
        ref={scroller}
        tabIndex={0}
        onScroll={() => {
          const el = scroller.current!;
          pinned.current =
            el.scrollHeight - el.scrollTop - el.clientHeight <= 32;
          setAtBottom(pinned.current);
        }}
        className="min-h-32 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4 focus-visible:outline focus-visible:outline-ring"
        aria-label="Chat messages"
      >
        <div ref={content}>
          {notice && (
            <p role="status" className="mb-3 text-xs text-fg-3">
              {notice}
            </p>
          )}
          {messages.length === 0 && (
            <div className="space-y-4 py-4">
              <h2 className="text-xl font-semibold tracking-tight text-fg">What would you like to work on?</h2>
              <p className="max-w-md text-sm leading-relaxed text-fg-3">Bring your notes, files and ideas together. Share context with @, then ask Station to turn it into something useful.</p>
              {!settings.apiKey ? <section aria-label="Set up Station agent" className="space-y-3 rounded-lg border border-line p-4"><h3 className="font-medium">Connect your AI model</h3><p className="text-xs text-fg-3">Add your Gateway key to get started. Your selected model receives the messages and sources you share.</p><AISettingsEditor settings={ports.settings} /></section> : !grants.has(aiConversation.id) ? <section className="space-y-3 rounded-lg border border-line p-4"><h3 className="font-medium">Ready when you are</h3><p className="text-xs text-fg-3">Start a conversation with your model. You can review additional tools separately.</p><Button size="sm" onClick={() => conversation.setGrants([aiConversation.id])}>Enable conversation</Button></section> : <div className="flex flex-wrap gap-2">{["Turn these notes into a clear action plan", "Summarize the decisions and open questions", "Help me build a useful Station tool"].map(prompt => <Button key={prompt} size="sm" variant="outline" onClick={() => { setInput(prompt); composer.current?.focus(); }}>{prompt}</Button>)}</div>}
            </div>
          )}
          <div aria-label="Conversation" aria-live="off" className="space-y-5">
            {messages.map((message, index) => (
              <article
                key={index}
                className={`min-w-0 space-y-2 ${message.role === "You" ? "rounded-lg bg-muted p-3" : ""}`}
                aria-label={`${message.role} turn ${Math.floor(index / 2) + 1}`}
              >
                <strong className="text-xs text-muted-foreground">
                  {message.role}
                </strong>
                {!!message.attachments?.length && <details className="rounded-lg border border-line p-2 text-xs"><summary>Shared context · {message.attachments.length} sources</summary>{message.attachments.map((source, at) => <details key={at} className="mt-2"><summary>{source.name}{source.path ? ` / ${source.path}` : ""} · revision {source.revision}</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-2">{source.content}</pre></details>)}</details>}
                {message.role === "You" ? (
                  <p className="whitespace-pre-wrap break-words">
                    {message.text}
                  </p>
                ) : (
                  <>
                    <StreamingText
                      text={message.text}
                      status={message.status}
                      smooth={false}
                      onRetry={
                        index === messages.length - 1 && !busy
                          ? () => void send(lastPrompt)
                          : undefined
                      }
                      onContinue={
                        index === messages.length - 1 && !busy
                          ? () => void send(lastPrompt)
                          : undefined
                      }
                    />
                    {message.text && (
                      <CopyButton value={message.text} label="Copy reply" />
                    )}
                    {message.tools?.map((tool) => (
                      <details
                        key={tool.id}
                        className="rounded-lg border border-line p-2 text-xs"
                      >
                        <summary>
                          {tool.name} ·{" "}
                          {message.status === "error" &&
                          tool.state === "running"
                            ? "error"
                            : tool.state}
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap break-all">
                          {tool.result ||
                            (message.status === "streaming"
                              ? "Waiting for tool result…"
                              : "Tool did not finish.")}
                        </pre>
                      </details>
                    ))}
                    {!!message.context?.length && (
                      <details className="rounded-lg border border-line p-2 text-xs">
                        <summary>
                          Context inspector · {message.context.length} resource
                          reads
                        </summary>
                        <p className="py-2 text-fg-3">
                          Granted resource results sent as data, never
                          instructions.
                        </p>
                        {message.context.map((read, at) => (
                          <details key={at}>
                            <summary>{read.resource}</summary>
                            <pre className="whitespace-pre-wrap break-all py-2">
                              {read.content}
                            </pre>
                          </details>
                        ))}
                      </details>
                    )}
                    {!!message.activity?.length && (
                      <ul
                        aria-label="Tool activity"
                        className="space-y-1 text-xs text-fg-3"
                      >
                        {message.activity.map((activity, at) => (
                          <li key={at}>{activity}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </article>
            ))}
          </div>
          {proposal && (
            <section
              aria-label={proposal.format === "markdown" ? "Review Markdown draft" : "Review web draft"}
              className="space-y-2 rounded-lg border border-border p-3"
            >
              <h3 className="font-medium">Save “{proposal.name}”?</h3>
              <p className="text-xs text-muted-foreground">
                {proposal.format === "markdown" ? "Review the Markdown below. Save creates a new editable note in the Asset browser." : "Review the HTML below. Save creates source only; it never installs, activates or runs it."}
              </p>
              <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
                {proposal.format === "markdown" ? proposal.markdown : proposal.html}
              </pre>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={proposal.format === "markdown" ? proposal.markdown : proposal.html} label="Copy draft source" />
                <Button
                  size="sm"
                  onClick={() => conversation.review(true)}
                >
                  Save draft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => conversation.review(false)}
                >
                  Decline
                </Button>
              </div>
            </section>
          )}
          {error && (
            <p
              role="status"
              className="mt-3 rounded-lg border border-line-2 p-3 text-xs text-fg-2"
            >
              {error}
            </p>
          )}
        </div>
      </div>
      {!atBottom && (
        <div className="flex shrink-0 justify-center border-t border-line p-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              pinned.current = true;
              setAtBottom(true);
              if (scroller.current)
                scroller.current.scrollTop = scroller.current.scrollHeight;
            }}
          >
            Jump to latest
          </Button>
        </div>
      )}
      {settings.apiKey && <form
        className="shrink-0 space-y-2 border-t border-line p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <AgentComposer workspaceId={workspaceId} context={ports.context} value={input} onChange={setInput} references={references} onReferences={setReferences} onSend={() => void send()} disabled={busy} composer={composer} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-fg-3">
            {!settings.apiKey
              ? "Add a Gateway key in AI settings"
              : !grants.has(aiConversation.id)
                ? "Enable AI conversation in Chat tools"
                : "Enter to send · Shift+Enter for a new line"}
          </span>
          {busy ? (
            <IconAction
              label="Stop response"
              onClick={() => {
                stop();
                requestAnimationFrame(() =>
                  composer.current?.focus({ preventScroll: true }),
                );
              }}
            >
              <Square />
            </IconAction>
          ) : (
            <IconAction
              type="submit"
              label="Send message"
              disabled={
                !input.trim() ||
                !settings.apiKey ||
                !grants.has(aiConversation.id)
              }
            >
              <ArrowUp />
            </IconAction>
          )}
        </div>
      </form>}
    </div>
  );
}

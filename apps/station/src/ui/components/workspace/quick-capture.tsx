import { useState } from "react";
import type { Workspace } from "../../../core/workspace-state";
import type { Panel } from "../../../core/docking";
import { DEFAULT_SHORTCUTS } from "../../../core/shortcuts";
import { dataDocumentSchema } from "../../../core/data-sources";
import { previewCapture, readCaptureRules, validateCaptureSource, type CaptureRules } from "../../../core/capture-rules";
import { Button } from "../ui/button";
import { CaptureRulesEditor } from "./capture-rules-editor";

/** Ordinary widget over the shared data command service. Native hotkeys only
 * reveal its retained instance; they never store records or receive data access. */
export function QuickCapture({ workspace, panel, onCapture, onConfigure, onOpenSource, onViewInbox }: {
  workspace: Workspace; panel: Panel;
  onCapture?: (assetId: string, revision: number, text: string) => void;
  onConfigure?: (assetId: string, revision: number, configuration: CaptureRules) => void;
  onOpenSource?: (assetId: string) => void;
  onViewInbox?: (assetId: string) => void;
}) {
  const [text, setText] = useState(""), [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false), [editorKey, setEditorKey] = useState(0);
  const sourceId = panel.sourceAssetId ?? (workspace.shortcuts ?? DEFAULT_SHORTCUTS).inboxSourceId;
  const source = workspace.assets.find(asset => asset.id === sourceId && asset.kind === "data-source");
  let problem = "", rules: CaptureRules | undefined, statuses: string[] = [], preview = "";
  try {
    if (!source?.files) throw new Error("Choose or create an Inbox in Keyboard shortcuts settings to start capturing.");
    const document = dataDocumentSchema.parse(JSON.parse(source.files["data.json"] ?? ""));
    validateCaptureSource(document);
    rules = readCaptureRules(source.files["capture.json"]);
    statuses = document.columns.find(column => column.id === "status")?.options ?? [];
    if (text.trim()) { const result = previewCapture(text, rules); preview = `Save to ${result.status}${result.ruleId ? " · automation applied" : ""}`; }
  } catch (reason) { problem = reason instanceof Error ? reason.message : String(reason); }
  return <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4"><form className="flex min-h-48 flex-1 flex-col gap-3" onSubmit={e => {
    e.preventDefault(); if (!text.trim()) return;
    try {
      if (problem || !source) throw new Error(problem || "Inbox unavailable.");
      if (!onCapture) throw new Error("Capture service is unavailable");
      onCapture(source.id, source.revision, text.trim());
      setText(""); setNotice("Saved to inbox");
      window.dispatchEvent(new CustomEvent("station:capture-saved", { detail: { panelId: panel.id, workspaceId: workspace.id } }));
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : String(reason)); }
  }}>
    <div className="flex items-center justify-between gap-2"><label className="text-sm font-medium text-fg" htmlFor={`capture-${panel.id}`}>What’s on your mind?</label>{source && <Button type="button" size="sm" variant="ghost" aria-expanded={editing} onClick={() => setEditing(!editing)}>Automations{rules?.rules.filter(rule => rule.enabled).length ? ` · ${rules.rules.filter(rule => rule.enabled).length}` : ""}</Button>}</div>
    <textarea id={`capture-${panel.id}`} data-quick-capture-input data-autofocus autoFocus maxLength={8192} rows={4} className="min-h-24 w-full flex-1 resize-none rounded-lg border border-line-2 bg-raised p-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" value={text} placeholder="A task, an idea, something to remember…" onChange={e => { setText(e.target.value); setNotice(""); }} onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
    {problem && <div role="status" className="space-y-2 rounded-lg border border-line p-3 text-xs text-fg-2"><p>{problem}</p>{source && <Button type="button" size="sm" variant="outline" onClick={() => onOpenSource?.(source.id)}>Open inbox source</Button>}</div>}
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-fg-3">{source?.name ?? "Set up your inbox"} · Ctrl+Enter to save</span><div className="flex items-center gap-2">{source && onViewInbox && <Button type="button" size="sm" variant="ghost" onClick={() => { try { onViewInbox(source.id); } catch (reason) { setNotice(reason instanceof Error ? reason.message : String(reason)); } }}>View inbox</Button>}<Button type="submit" disabled={!text.trim() || !!problem || !onCapture}>Save to inbox</Button></div></div>
    <p role="status" className="min-h-4 text-xs text-fg-2">{notice || preview}</p>
  </form>
    {editing && source && rules && onConfigure && <CaptureRulesEditor key={`${source.id}:${editorKey}`} configuration={rules} revision={source.revision} currentRevision={source.revision} statuses={statuses} sample={text} onSave={(revision, value) => onConfigure(source.id, revision, value)} onReload={() => setEditorKey(key => key + 1)} />}
  </div>;
}

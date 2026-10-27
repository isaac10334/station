import { useState } from "react";
import { captureRulesSchema, previewCapture, type CaptureRules, type CaptureRule } from "../../../core/capture-rules";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { Switch } from "../ui/switch";

/** Edits source-owned inert rules; saving never processes existing records. */
export function CaptureRulesEditor({ configuration, revision, currentRevision, statuses, sample, onSave, onReload }: {
  configuration: CaptureRules; revision: number; currentRevision: number; statuses: readonly string[]; sample: string;
  onSave: (revision: number, value: CaptureRules) => void; onReload: () => void;
}) {
  const [rules, setRules] = useState(configuration.rules);
  const [expected, setExpected] = useState(revision);
  const [notice, setNotice] = useState("");
  const patch = (id: string, update: Partial<CaptureRule>) => { setRules(previous => previous.map(rule => rule.id === id ? { ...rule, ...update } : rule)); setNotice(""); };
  let preview = "Type a capture above to preview its result.";
  try { if (sample.trim()) { const result = previewCapture(sample, { version: 1, rules }); preview = `${result.ruleId ? "Matching rule" : "No matching rule"} → ${result.status}: ${result.text}`; } }
  catch (reason) { preview = reason instanceof Error ? reason.message : String(reason); }
  return <section aria-label="Inbox automations" className="space-y-3 border-t border-line pt-3">
    <div><h3 className="text-sm font-medium">Inbox automations</h3><p className="mt-1 text-xs text-fg-3">First enabled match wins, ignoring case. Rules apply to new quick captures in this inbox.</p></div>
    {rules.map((rule, index) => <div key={rule.id} className="space-y-2 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-2"><Switch label={`Rule ${index + 1}`} size="sm" checked={rule.enabled} onCheckedChange={enabled => patch(rule.id, { enabled })} /><Button type="button" size="sm" variant="ghost" aria-label={`Remove rule ${index + 1}`} onClick={() => setRules(previous => previous.filter(item => item.id !== rule.id))}>Remove</Button></div>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label={`Match for rule ${index + 1}`} value={rule.match} onChange={event => patch(rule.id, { match: event.target.value as CaptureRule["match"], stripPrefix: false })}><option value="contains">Text contains</option><option value="starts-with">Text starts with</option></NativeSelect>
        <Input aria-label={`Text for rule ${index + 1}`} value={rule.text} maxLength={200} placeholder="e.g. #done" className="min-w-24 flex-1" onChange={event => patch(rule.id, { text: event.target.value })} />
      </div>
      <label className="flex flex-wrap items-center gap-2 text-xs text-fg-2">Set status to {statuses.length ? <NativeSelect aria-label={`Status for rule ${index + 1}`} value={rule.status} onChange={event => patch(rule.id, { status: event.target.value })}>{statuses.map(status => <option key={status}>{status}</option>)}</NativeSelect> : <Input aria-label={`Status for rule ${index + 1}`} maxLength={120} value={rule.status} onChange={event => patch(rule.id, { status: event.target.value })} />}</label>
      {rule.match === "starts-with" && <Switch size="sm" label="Remove the matching prefix" checked={rule.stripPrefix} onCheckedChange={stripPrefix => patch(rule.id, { stripPrefix })} />}
    </div>)}
    <Button type="button" variant="outline" size="sm" disabled={rules.length >= 20} onClick={() => setRules(previous => [...previous, { id: crypto.randomUUID(), enabled: true, match: "starts-with", text: "#done", status: statuses.includes("Done") ? "Done" : statuses[0] ?? "Done", stripPrefix: true }])}>Add rule</Button>
    <p aria-label="Automation preview" className="break-words rounded-lg bg-muted p-3 text-xs text-fg-2">{preview}</p>
    {currentRevision !== expected && <p role="status" className="text-xs text-danger">Inbox changed. Reload rules before saving. Your unsaved edits remain here.</p>}
    <div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" disabled={currentRevision !== expected} onClick={() => {
      try { const next = captureRulesSchema.parse({ version: 1, rules }); onSave(expected, next); setExpected(expected + 1); setRules(next.rules); setNotice("Rules saved. Existing items are unchanged."); }
      catch (reason) { setNotice(reason instanceof Error ? reason.message : String(reason)); }
    }}>Save rules</Button><Button type="button" variant="ghost" size="sm" onClick={onReload}>Reload saved rules</Button></div>
    <p role="status" className="text-xs text-fg-2">{notice}</p>
  </section>;
}

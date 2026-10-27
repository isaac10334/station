import { useState } from "react";
import type { DataAsset } from "../../../core/asset-state";
import type { Workspace } from "../../../core/workspace-state";
import { DEFAULT_EDITOR_POLICY, editorPolicySchema, resolveEditor, type EditorPolicy } from "../../../core/asset-routing";
import { installedDefinitions } from "../../../core/contribution-catalog";
import { deps } from "../../../composition";
import { patchOwnerFiles } from "../../lib/owner-commands";
import { useSourceEditing } from "../../lib/use-source-editing";
import { Button } from "../ui/button";
import { NativeSelect } from "../ui/native-select";
import { SettledInput } from "../ui/settled-input";
import { AssetReferencePicker } from "./asset-reference-picker";
import { EditorWorkspace, useEditorOwner } from "./editor-workspace";

/** Declarative first-match decision editor. It runs no model, script or side effect.
 * An editor reference is validated again against installed compatibility on use.
 */
export function DecisionAssetEditor({ asset, ownerId, workspace }: { asset: DataAsset; ownerId: string; workspace: Workspace }) {
  const session = useEditorOwner(asset, ownerId), editable = useSourceEditing(asset.id);
  const [code, setCode] = useState(false), [error, setError] = useState("");
  const [testId, setTestId] = useState<string | undefined>();
  const parsed = editorPolicySchema.safeParse((() => { try { return JSON.parse(asset.files["decision.json"] ?? ""); } catch { return null; } })());
  const policy = parsed.success ? parsed.data : DEFAULT_EDITOR_POLICY;
  const choices = [{ id: "station", title: "Station editor" }, ...installedDefinitions(workspace).filter(i => i.contribution.role === "editor").map(i => ({ id: i.id, title: i.contribution.title }))];
  const patch = (change: (policy: EditorPolicy) => EditorPolicy) => {
    try { const current = deps.store.active().assets.find(a => a.id === asset.id); if (!current || !editable) throw new Error("Policy is read-only"); const policy = editorPolicySchema.parse(JSON.parse(current.files!["decision.json"])); const next = editorPolicySchema.parse(change(policy)); patchOwnerFiles(asset.id, { "decision.json": JSON.stringify(next, null, 2) }); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Policy edit failed"); }
  };
  const test = workspace.assets.find(a => a.id === testId);
  const outcome = test ? resolveEditor(workspace, { ...test, editorPolicyId: asset.id }) : null;
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2"><Button size="sm" variant={!code ? "secondary" : "ghost"} onClick={() => setCode(false)}>Rules</Button><Button size="sm" variant={code ? "secondary" : "ghost"} onClick={() => setCode(true)}>Source</Button><Button size="sm" variant="outline" disabled={!parsed.success} onClick={() => { try { deps.control.execute({ method: "routing.configure", params: { policyId: asset.id } }); setError(""); } catch (e) { setError(String(e)); } }}>Use for workspace</Button>{workspace.editorPolicyId === asset.id && <span className="self-center text-xs text-fg-3">Workspace default</span>}</div>
    {code ? <EditorWorkspace session={session} ownerId={ownerId} /> : <div className="space-y-5 overflow-auto p-4">
      <p className="text-xs text-fg-3">First matching rule chooses an editor. A missing or incompatible editor falls back to Station. Policy decisions never grant capabilities or bypass placement rules.</p>
      {policy.rules.map((rule, index) => <div key={index} className="flex flex-wrap items-end gap-2 border-b border-line pb-3">
        <label className="min-w-32 flex-1 space-y-1 text-xs">Asset type<NativeSelect disabled={!editable} value={rule.kind ?? ""} onChange={e => patch(p => ({ ...p, rules: p.rules.map((r, i) => i === index ? { ...r, kind: e.target.value || undefined } : r) }))}><option value="">Any type</option>{["component", "web-content", "theme", "package", "widget-definition", "desk-template", "svg", "decision", "data-source", "script", "custom"].map(kind => <option key={kind}>{kind}</option>)}</NativeSelect></label>
        <label className="min-w-32 flex-1 space-y-1 text-xs">Name contains<SettledInput label="Name contains" validate={value => value.length > 120 ? "Use at most 120 characters" : undefined} disabled={!editable} value={rule.nameIncludes ?? ""} onCommit={value => patch(p => ({ ...p, rules: p.rules.map((r, i) => i === index ? { ...r, nameIncludes: value || undefined } : r) }))} /></label>
        <label className="min-w-40 flex-1 space-y-1 text-xs">Open with<NativeSelect disabled={!editable} value={rule.editorId} onChange={e => patch(p => ({ ...p, rules: p.rules.map((r, i) => i === index ? { ...r, editorId: e.target.value } : r) }))}>{!choices.some(c => c.id === rule.editorId) && <option value={rule.editorId}>Unavailable: {rule.editorId}</option>}{choices.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</NativeSelect></label>
        <Button size="sm" variant="ghost" disabled={!editable || index === 0} onClick={() => patch(p => { const rules = [...p.rules]; [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]]; return { ...p, rules }; })}>Move up</Button><Button size="sm" variant="ghost" disabled={!editable} onClick={() => patch(p => ({ ...p, rules: p.rules.filter((_, i) => i !== index) }))}>Remove</Button>
      </div>)}
      <Button size="sm" variant="outline" disabled={!editable || !parsed.success || policy.rules.length >= 64} onClick={() => patch(p => ({ ...p, rules: [...p.rules, { editorId: "station" }] }))}>Add rule</Button>
      <label className="block max-w-sm space-y-1 text-xs">Fallback editor<NativeSelect disabled={!editable} value={policy.fallback} onChange={e => patch(p => ({ ...p, fallback: e.target.value }))}>{choices.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</NativeSelect></label>
      <div className="max-w-lg space-y-2"><h3 className="text-sm font-medium">Test a decision</h3><AssetReferencePicker label="test asset" workspaceId={workspace.id} options={workspace.assets.map(a => ({ assetId: a.id, label: a.name }))} value={testId ? { assetId: testId } : undefined} onChange={r => setTestId(r?.assetId)} />{outcome && <output className="block break-words text-xs">{outcome.choices.find(c => c.id === outcome.editorId)?.title} · {outcome.reason}</output>}</div>
    </div>}
    {(!parsed.success || error) && <p role="alert" className="p-3 text-xs text-danger">{error || "Policy source is invalid. Repair it in Source; routing falls back safely."}</p>}
  </div>;
}

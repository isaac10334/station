import { useState } from "react";
import type { Asset } from "../../../core/asset-state";
import { AssetReferencePicker } from "./asset-reference-picker";
import { PropertyEditor } from "../ui/property-editor";
import { Button } from "../ui/button";
import { MorphingEditor } from "../ui/morphing-editor";
import { CodeInput } from "../ui/code-input";

/** A typed JSON action property. Expanding edits source only; execution remains
 * an explicit, separately authorized scripts.run operation in the caller. */
export function ScriptBindingProperty({ workspaceId, assets, assetId, inputJson, onReference, onInput, onOpen, onCreate, onFork, onPatch }: {
  workspaceId: string; assets: readonly Asset[]; assetId?: string; inputJson: string;
  onReference: (id?: string) => void; onInput: (json: string) => void;
  onOpen: (id: string) => void; onCreate: (name: string) => string; onFork: (id: string) => string;
  onPatch: (id: string, source: string, expected: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null), [error, setError] = useState("");
  const selected = assets.find(asset => asset.id === assetId), source = selected?.files?.["main.js"];
  const [baseline, setBaseline] = useState("");
  return <div className="space-y-2 text-xs">
    <p className="text-fg-3">Input: JSON â†’ Output: JSON. Effects: bounded QuickJS evaluation; no ambient network or filesystem. Running requires script execution authority.</p>
    <AssetReferencePicker label="JSON action script" workspaceId={workspaceId} options={assets.filter(asset => asset.kind === "script" && !!asset.files?.["main.js"] && !asset.files?.["program.json"]).map(asset => ({ assetId: asset.id, label: asset.name }))} value={assetId ? { assetId } : undefined} onChange={reference => { onReference(reference?.assetId); setDraft(null); }} onOpen={onOpen} onCreate={name => ({ assetId: onCreate(name) })} />
    {selected && <Button size="sm" variant="ghost" onClick={() => { try { onReference(onFork(selected.id)); setDraft(null); } catch (reason) { setError(String(reason)); } }}>Fork script</Button>}
    <PropertyEditor field={{ key: "input", label: "Action input JSON", type: "json", maxLength: 65536 }} value={JSON.parse(inputJson)} onCommit={value => onInput(JSON.stringify(value))} />
    <MorphingEditor label="Script source" kind="JavaScript" preview={source?.split("\n").find(line => line.trim()) ?? "Choose a script…"} dirty={draft !== null && draft !== source}>
      {source === undefined ? <p className="py-2 text-fg-3">Choose or create a compatible script. Missing references are retained until you replace them.</p> : <div className="space-y-2">
        <div className="h-64 overflow-hidden rounded border border-line"><CodeInput label="Action script source" path="main.js" value={draft ?? source} onChange={value => { if (draft === null) setBaseline(source); setDraft(value); }} /></div>
        <Button size="sm" disabled={draft === null || draft === source} onClick={() => { try { if (!selected) return; onPatch(selected.id, draft!, baseline); setDraft(null); setError(""); } catch (reason) { setError(String(reason)); } }}>Save source</Button>
        <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setError(""); }}>Reload source</Button>
        <p className="text-fg-3">Saving does not run the script.</p>
      </div>}
    </MorphingEditor>
    {error && <p role="alert" className="text-danger">{error}</p>}
  </div>;
}

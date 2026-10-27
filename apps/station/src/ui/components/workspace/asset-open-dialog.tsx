import { useState } from "react";
import type { Asset } from "../../../core/asset-state";
import type { Workspace } from "../../../core/workspace-state";
import { resolveEditor } from "../../../core/asset-routing";
import { deps } from "../../../composition";
import { useDockController } from "../../docking/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from "../ui/dialog";
import { NativeSelect } from "../ui/native-select";
import { Button } from "../ui/button";

/** Editor selection and presentation are independent decisions. The common
 * command validates compatibility and resource policy before opening content.
 */
export function AssetOpenDialog({ asset, workspace, onClose }: { asset: Asset; workspace: Workspace; onClose: () => void }) {
  const routing = resolveEditor(workspace, asset);
  const [editorId, setEditor] = useState(routing.editorId), [mode, setMode] = useState("tab"), [error, setError] = useState("");
  const dock = useDockController();
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent size="sm"><DialogHeader><DialogTitle>Open {asset.name} with…</DialogTitle><DialogDescription>{routing.reason}. Choosing an editor does not grant additional access.</DialogDescription></DialogHeader><DialogBody><div className="space-y-3">
    <label className="block space-y-1 text-xs">Editor<NativeSelect value={editorId} onChange={e => setEditor(e.target.value)}>{routing.choices.map(choice => <option key={choice.id} value={choice.id}>{choice.title}</option>)}</NativeSelect></label>
    <label className="block space-y-1 text-xs">Presentation<NativeSelect value={mode} onChange={e => setMode(e.target.value)}><option value="tab">Tab</option><option value="peek">Side peek</option><option value="modal">Modal focus</option><option value="full">Full screen</option></NativeSelect></label>
    {routing.choices.length === 1 && <p className="text-xs text-fg-3">Install a compatible editor contribution to add more choices.</p>}
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </div></DialogBody><DialogFooter><Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => { try { const result = deps.control.execute({ method: "asset.open", params: { assetId: asset.id, editorId, presentation: mode === "modal" ? "tab" : mode } }).result; onClose(); if (mode === "modal") dock.focusPanel(result.panelId); } catch (e) { setError(e instanceof Error ? e.message : "Editor unavailable"); } }}>Open</Button></DialogFooter></DialogContent></Dialog>;
}

import { ASSET_METADATA_FIELDS } from "../../../core/inspector-schema";
import { PropertyInspector } from "../ui/property-inspector";
import { StatusBadge } from "../ui/status-badge";
import { Button } from "../ui/button";
import type { Asset } from "../../../core/asset-state";
import type { Workspace } from "../../../core/workspace-state";
import { deps } from "../../../composition";
import { resolveEditor } from "../../../core/asset-routing";
import { AssetReferencePicker } from "./asset-reference-picker";
import type { AssetGroup } from "../../../core/asset-groups";
import { isBuiltinWidgetAsset } from "../../../core/widget-definitions";
import { NativeSelect } from "../ui/native-select";
import { IconAction } from "../ui/icon-action";
import { X } from "lucide-react";

/** Inspect selection without launching its configured editor. Source opening stays explicit. */
export function AssetInspector({ workspace, onFork, onOpenWith, assets, groups, onMove, onOpen, onRename, onClose, onPatchMetadata, canEdit }: {
  workspace: Workspace; onFork: (asset: Asset) => void; onOpenWith: (asset: Asset) => void;
  onPatchMetadata: (id: string, patch: { name?: string; description?: string }) => void;
  canEdit: (id: string) => boolean;
  assets: Asset[]; groups: AssetGroup[]; onMove: (ids: string[], groupId: string | null) => void;
  onOpen: (id: string) => void; onRename?: (id: string) => void; onClose: () => void;
}) {
  const asset = assets.length === 1 ? assets[0] : undefined;
  const editable = assets.filter(item => !isBuiltinWidgetAsset(item.id) && canEdit(item.id));
  const membership = asset ? groups.find(group => group.assetIds.includes(asset.id))?.id ?? "" : "";
  return <aside className="asset-selection-inspector" data-empty={!assets.length || undefined} aria-label="Asset inspector">
    <div className="flex items-center justify-between gap-2"><strong className="text-xs">Inspector</strong><IconAction label="Close asset inspector" onClick={onClose}><X size={14} /></IconAction></div>
    {!assets.length ? <p className="text-xs text-fg-3">Select an asset to inspect it.</p> : <>
      <div className="flex flex-wrap items-center gap-1"><StatusBadge>{asset?.kind ?? `${assets.length} selected`}</StatusBadge>{!editable.length && <StatusBadge>Read-only</StatusBadge>}</div>
      {asset && <><PropertyInspector key={asset.id} fields={ASSET_METADATA_FIELDS} value={asset} readOnly={!editable.length} onCommit={(key, value) => onPatchMetadata(asset.id, { [key]: value })} /><details className="text-xs"><summary className="cursor-pointer py-1 text-fg-3">Identity & source</summary><dl className="space-y-2 pt-2"><dt className="text-fg-3">Asset ID</dt><dd className="select-text break-all font-mono">{asset.id}</dd><dt className="text-fg-3">Source files</dt><dd>{Object.keys(asset.files ?? { "index.html": "" }).length}</dd></dl></details></>}
      {!editable.length ? <p className="text-xs text-fg-3">Built-in · read-only. Open to inspect its definition or create a fork.</p> : <label className="text-xs space-y-2">Group<NativeSelect aria-label="Asset group" value={membership} onChange={event => onMove(editable.map(item => item.id), event.target.value || null)}><option value="">Ungrouped</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</NativeSelect></label>}
      {asset && <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => onOpen(asset.id)}>Open editor</Button>{editable.length > 0 && onRename && <button type="button" onClick={() => onRename(asset.id)}>Rename</button>}</div>}
      {asset && <><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onOpenWith(asset)}>Open with…</Button><Button size="sm" variant="ghost" onClick={() => onFork(asset)}>Create variant</Button></div>
        {asset.origin && <p className="break-all text-xs text-fg-3">Variant of {asset.origin.assetId} · revision {asset.origin.revision}. Independent source; no inherited grants.</p>}
        <p className="text-xs text-fg-3">Editor: {resolveEditor(workspace, asset).choices.find(c => c.id === resolveEditor(workspace, asset).editorId)?.title} · {resolveEditor(workspace, asset).reason}</p>
        <div className="space-y-1 text-xs"><span>Editor decision policy</span><AssetReferencePicker label="editor policy" workspaceId={workspace.id} options={workspace.assets.filter(a => a.kind === "decision").map(a => ({ assetId: a.id, label: a.name }))} value={asset.editorPolicyId ? { assetId: asset.editorPolicyId } : undefined} disabled={!editable.length} onOpen={onOpen} onChange={ref => { deps.control.execute({ method: "routing.configure", params: { assetId: asset.id, policyId: ref?.assetId ?? null } }); }} /></div>
      </>}
    </>}
  </aside>;
}

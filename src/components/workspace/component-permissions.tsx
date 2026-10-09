import { useState, useSyncExternalStore } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { COMPONENT_GRANTS } from "../../component-grants";
import { deps } from "../../composition";
import type { ComponentAsset } from "../../model";

/** One permission ledger for Component settings and the capability inspector.
 * Saved grants survive reload; run approvals are transient and revocable while active.
 */
export function ComponentGrantList({ asset, onGrant }: { asset: ComponentAsset; onGrant: (id: string, key: string, allowed: boolean) => void }) {
  const approvals = useSyncExternalStore(deps.runApprovals.subscribe, deps.runApprovals.inspect);
  return <div className="divide-y divide-line-2">{COMPONENT_GRANTS.map(grant => {
    const once = approvals.some(item => item.instanceId === asset.instanceId && item.grants.includes(grant.key));
    const saved = Boolean(asset.grants[grant.key]);
    return <div key={grant.key} className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="text-[13px] font-medium text-fg">{grant.label}</strong><span className="text-[11px] text-fg-3">{saved ? "Always allowed" : once ? "This run" : "Ask before running"}</span></div>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-3">{grant.hint}</p><code className="mt-1 block break-all text-[10px] text-fg-3">{grant.key}</code>
      </div>
      {(saved || once) && <Button variant="ghost" size="sm" aria-label={`Revoke ${grant.label} for ${asset.name}`} onClick={() => onGrant(asset.id, grant.key, false)}>Revoke</Button>}
    </div>;
  })}</div>;
}

export function ComponentGrantSettings({ asset }: { asset: ComponentAsset }) {
  const [open, setOpen] = useState(false);
  const saved = COMPONENT_GRANTS.filter(grant => asset.grants[grant.key]).length;
  return <Dialog open={open} onOpenChange={setOpen}>
    <div className="flex flex-wrap items-center gap-3"><span className="flex-1 text-[13px] text-fg-3">{saved ? `${saved} capabilities always allowed` : "Approval requested when you run"}</span><DialogTrigger render={<Button variant="secondary" size="sm" />}>Manage permissions</DialogTrigger></div>
    <DialogContent><DialogHeader><DialogTitle>Permissions for {asset.name}</DialogTitle><DialogDescription>Inspect access or revoke it at any time. Revoking a capability also cancels runs using it.</DialogDescription></DialogHeader>
      <DialogBody><ComponentGrantList asset={asset} onGrant={deps.store.setGrant} /><p className="py-3 text-[11px] text-fg-3">Saved approvals apply to this asset in this workspace, including future source revisions. New capabilities require approval.</p></DialogBody>
      <DialogFooter><Button variant="secondary" onClick={() => setOpen(false)}>Done</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** Approval UI presents only authority missing from the asset's saved decisions.
 * The caller retains the reviewed asset snapshot until approval or dismissal.
 */
export function ComponentRunApproval({ asset, open, onClose, onApprove }: { asset: ComponentAsset; open: boolean; onClose: () => void; onApprove: (remember: boolean) => void }) {
  const missing = COMPONENT_GRANTS.filter(grant => !asset.grants[grant.key]);
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent><DialogHeader><div className="mb-2 flex size-9 items-center justify-center rounded-xl border border-line-2 text-fg-2"><ShieldCheck size={18} aria-hidden /></div>
      <DialogTitle>Allow {asset.name} to run?</DialogTitle><DialogDescription>This Component requests {missing.length} {missing.length === 1 ? "capability" : "capabilities"} from your workspace.</DialogDescription></DialogHeader>
      <DialogBody><div className="my-2 rounded-xl border border-line-2 bg-frame px-4 divide-y divide-line-2">{missing.map(grant => <div key={grant.key} className="py-3"><strong className="text-[13px] font-medium">{grant.label}</strong><p className="mt-1 text-[12px] leading-relaxed text-fg-3">{grant.hint}</p><code className="mt-1 block break-all text-[10px] text-fg-3">{grant.key}</code></div>)}</div>
        <p className="py-2 text-[11px] leading-relaxed text-fg-3">No filesystem, environment, or network access. Allow once expires after this run. Always allow remembers these capabilities for this asset; revoke them in Manage permissions or the capability inspector.</p></DialogBody>
      <DialogFooter className="flex-wrap"><Button variant="ghost" size="sm" onClick={onClose}>Deny</Button><Button variant="secondary" size="sm" onClick={() => onApprove(true)}>Always allow</Button><Button size="sm" onClick={() => onApprove(false)}>Allow once</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

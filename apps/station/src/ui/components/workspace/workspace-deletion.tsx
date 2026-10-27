import type { State } from "../../../core/workspace-state";
import type { OverlayWorkspacePort } from "../../../features/shell/application/ports";
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { TypeToConfirm } from "../ui/type-to-confirm";
import { Button } from "../ui/button";

/** Shared owner confirmation for dropdown and settings deletion. Identity is
 * captured when opened; the store repeats current-name and last-workspace guards. */
export function WorkspaceDeletion({ store, state, workspaceId, onClose }: {
  store: OverlayWorkspacePort; state: State; workspaceId: string; onClose: () => void;
}) {
  const target = state.workspaces.find(item => item.id === workspaceId);
  return <>
    <DialogHeader>
      <DialogTitle>Delete {target?.name ?? "workspace"}?</DialogTitle>
      <DialogDescription>This permanently removes this local workspace, including its assets, desks, layouts, and saved settings. This cannot be undone.</DialogDescription>
    </DialogHeader>
    <DialogBody>
      {target && state.workspaces.length > 1 ? <>
        <p className="mb-5 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">{target.assets.length} {target.assets.length === 1 ? "asset" : "assets"} and {target.desks.length} {target.desks.length === 1 ? "desk" : "desks"} will be deleted.{target.id === state.activeWorkspaceId ? " Station will switch to another workspace." : ""}</p>
        <TypeToConfirm key={`${target.id}:${target.name}`} resource={target.name || target.id} action="Delete workspace" autoFocus onCancel={onClose} onConfirm={() => { store.deleteWorkspace(target.id, target.name); onClose(); }} />
      </> : <div className="space-y-4"><p className="text-sm text-fg-2">{target ? "Create another workspace before deleting the last one." : "This workspace no longer exists."}</p><Button onClick={onClose}>Back</Button></div>}
    </DialogBody>
  </>;
}

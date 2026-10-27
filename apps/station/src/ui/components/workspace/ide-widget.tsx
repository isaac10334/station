import { useState } from "react";
import type { Workspace } from "../../../core/workspace-state";
import type { Asset } from "../../../core/asset-state";
import type { Panel } from "../../../core/docking";
import { useDockController } from "../../docking/react";
import { NativeSelect } from "../ui/native-select";
import { EditorWorkspace, useEditorOwner } from "./editor-workspace";

/** Retargeting uses one revisioned dock command to retire old panes. Each new
 * target gets a fresh editor session, while source identity and permissions stay
 * with the asset. Opening never builds or executes source.
 */
export function IdeWidget({
  panel,
  workspace,
}: {
  panel: Panel;
  workspace: Workspace;
}) {
  const { command } = useDockController();
  const [error, setError] = useState("");
  const source = workspace.assets.find(
    (asset) => asset.id === panel.sourceAssetId,
  );
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <label className="flex shrink-0 items-center gap-2 border-b border-line p-2 text-xs">
        Source asset
        <NativeSelect
          aria-label="IDE source asset"
          value={panel.sourceAssetId ?? ""}
          onChange={(event) => {
            const result = command({
              type: "configureIde",
              panelId: panel.id,
              assetId: event.target.value || null,
            });
            setError(result.ok ? "" : result.reason);
          }}
        >
          <option value="">Choose source…</option>
          {workspace.assets
            .filter((asset) => asset.files)
            .map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
        </NativeSelect>
      </label>
      {source ? (
        <IdeSource key={source.id} asset={source} ownerId={panel.id} />
      ) : (
        <p className="p-4 text-sm text-fg-3">
          Choose an asset to browse its files and edit source. Files, Code and
          Problems can be moved or resized independently.
        </p>
      )}
      {error && (
        <p role="alert" className="p-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
function IdeSource({ asset, ownerId }: { asset: Asset; ownerId: string }) {
  const session = useEditorOwner(asset, ownerId);
  return <EditorWorkspace session={session} ownerId={ownerId} />;
}

import { useEffect, useState } from "react";
import type { Asset, Workspace } from "../../../core/model";
import type { Panel } from "../../../core/docking";
import { useDockController } from "../../docking/react";
import { installedDefinitions } from "../../../services/package-runtime";
import { WebContentView } from "../../web-content-view";
import { ComponentView } from "../../component-view";
import { ContributionView } from "../../contribution-view";
import { DataAssetView } from "./data-asset-view";
import { EditorControls } from "./editor-controls";

/** Editor choice is explicit; package disabling never prevents access to authored source. */
export function AssetEditor({
  asset,
  panel,
  workspace,
  onRestore,
  runRequest,
}: {
  asset: Asset;
  panel: Extract<Panel, { kind: "asset" }>;
  workspace: Workspace;
  onRestore: (id: string) => void;
  runRequest?: number;
}) {
  const { command } = useDockController();
  const [sourceRequest, setSourceRequest] = useState(0);
  const choices = installedDefinitions(workspace).filter(
    (item) =>
      item.contribution.role === "editor" &&
      item.contribution.assetKinds.includes(asset.kind),
  );
  const valid = choices.some((item) => item.id === panel.definitionId);
  useEffect(() => {
    if (panel.definitionId && !valid)
      command({ type: "setEditor", panelId: panel.id });
  }, [panel.definitionId, valid]);
  return (
    <div className="station-project-view">
      <EditorControls
        asset={asset}
        panel={panel}
        workspace={workspace}
        onShowSource={
          !valid ? () => setSourceRequest((value) => value + 1) : undefined
        }
      />
      <div
        className="station-editor-body"
        key={panel.definitionId ?? "builtin"}
      >
        {valid ? (
          <ContributionView panel={panel} workspace={workspace} />
        ) : asset.kind === "web-content" ? (
          <WebContentView
            asset={asset}
            ownerId={panel.id}
            onAddWidget={() =>
              command({ type: "createWebWidget", assetId: asset.id })
            }
          />
        ) : asset.kind === "component" ? (
          <ComponentView
            asset={asset}
            ownerId={panel.id}
            workspaceId={workspace.id}
            onRestore={onRestore}
            runRequest={runRequest}
            sourceRequest={sourceRequest}
          />
        ) : (
          <DataAssetView
            asset={asset}
            ownerId={panel.id}
            workspace={workspace}
            sourceRequest={sourceRequest}
          />
        )}
      </div>
    </div>
  );
}

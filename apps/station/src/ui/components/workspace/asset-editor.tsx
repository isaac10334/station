import { projectEditorDocument } from "../../../features/assets/application/editor-document";
import { renderBuiltinAssetEditor } from "./asset-editor-renderers";
import { DeskTemplateView } from "./desk-template-view";
import { useEffect, useState } from "react";
import type { Asset } from "../../../core/asset-state";
import type { Workspace } from "../../../core/workspace-state";
import type { Panel } from "../../../core/docking";
import { useDockController } from "../../docking/react";
import { ContributionView } from "../../contribution-view";
import { EditorControls } from "./editor-controls";
import { WidgetDefinitionView } from "./widget-definition-view";

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
  const document = projectEditorDocument(workspace, asset, panel);
  const valid = document.renderer === "contribution";
  useEffect(() => {
    if (document.recoverSelection)
      command({ type: "setEditor", panelId: panel.id });
  }, [panel.definitionId, valid]);
  if (asset.kind === "desk-template") return <DeskTemplateView asset={asset} ownerId={panel.id} />;
  if (asset.kind === "widget-definition") return <WidgetDefinitionView asset={asset} ownerId={panel.id} />;
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
        {valid ? <ContributionView panel={panel} workspace={workspace} /> : renderBuiltinAssetEditor({
          asset, panel, workspace, sourceRequest, runRequest, onRestore,
          onAddWidget: () => command({ type: "createWebWidget", assetId: asset.id }),
        })}
      </div>
    </div>
  );
}

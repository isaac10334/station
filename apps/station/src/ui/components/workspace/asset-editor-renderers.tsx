/** Exhaustive editor adapter dispatch, separate from widget renderer/instance ownership. */
import type { ReactNode } from "react";
import type { Asset, DataAsset } from "../../../core/asset-state";
import type { Workspace } from "../../../core/workspace-state";
import type { Panel } from "../../../core/docking";
import { DataSourceEditor } from "./data-source-editor";
import { ScriptPlayground } from "./script-playground";
import { ProgramDefinitionEditor } from "./program-definition-editor";
import { CustomAssetEditor } from "./custom-asset-editor";
import { DeskTemplateView } from "./desk-template-view";
import { WidgetDefinitionView } from "./widget-definition-view";
import { WebContentView } from "../../web-content-view";
import { ComponentView } from "../../component-view";
import { DataAssetView } from "./data-asset-view";
import { SvgAssetEditor } from "./svg-asset-editor";
import { DecisionAssetEditor } from "./decision-asset-editor";
type EditorProps = { asset: Asset; panel: Extract<Panel, { kind: "asset" }>; workspace: Workspace; sourceRequest: number; runRequest?: number; onRestore(id: string): void; onAddWidget(): void };
type Renderers = { [Kind in Asset["kind"]]: (props: Omit<EditorProps, "asset"> & { asset: Asset & { kind: Kind } }) => ReactNode };
const data = (p: Omit<EditorProps, "asset"> & { asset: DataAsset }) => <DataAssetView asset={p.asset} workspace={p.workspace} ownerId={p.panel.id} sourceRequest={p.sourceRequest} />;
const renderers: Renderers = {
  component: p => <ComponentView asset={p.asset} ownerId={p.panel.id} workspaceId={p.workspace.id} onRestore={p.onRestore} runRequest={p.runRequest} sourceRequest={p.sourceRequest} />,
  "web-content": p => <WebContentView asset={p.asset} ownerId={p.panel.id} onAddWidget={p.onAddWidget} />,
  custom: p => <CustomAssetEditor asset={p.asset} ownerId={p.panel.id} source={!!p.sourceRequest} />,
  "data-source": p => <DataSourceEditor asset={p.asset} workspace={p.workspace} ownerId={p.panel.id} />,
  script: p => p.sourceRequest ? data(p) : p.asset.files["program.json"] ? <ProgramDefinitionEditor asset={p.asset} ownerId={p.panel.id} /> : <ScriptPlayground asset={p.asset} ownerId={p.panel.id} />,
  svg: p => <SvgAssetEditor asset={p.asset} ownerId={p.panel.id} engine={p.panel.definitionId === "station:vectorcraft" ? "vectorcraft" : "svg-edit"} />,
  decision: p => <DecisionAssetEditor asset={p.asset} ownerId={p.panel.id} workspace={p.workspace} />,
  "desk-template": p => <DeskTemplateView asset={p.asset} ownerId={p.panel.id} />,
  "widget-definition": p => <WidgetDefinitionView asset={p.asset} ownerId={p.panel.id} />,
  theme: data,
  note: data,
  markdown: data,
  package: data,
};
export function renderBuiltinAssetEditor(props: EditorProps) {
  // One correlated union dispatch: the exhaustive map above checks each kind's adapter.
  const render = renderers[props.asset.kind] as (props: EditorProps) => ReactNode;
  return render(props);
}

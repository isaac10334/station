import { DeskControls } from "./components/workspace/desk-controls";
import { IdeWidget } from "./components/workspace/ide-widget";
import { NoteWidget } from "./components/workspace/note-widget";
import { DeskSettingsDialog } from "./components/workspace/desk-settings-dialog";
import { DataView } from "./components/workspace/data-view";
import { QuickCapture } from "./components/workspace/quick-capture";
import { panelSurface } from "../core/docking";
import { RuntimeActionButton } from "./components/workspace/action-button";
import { ProgramWidget } from "./components/workspace/program-widget";
import { viewConfigurationSchema } from "../core/data-sources";
import { useDockController } from "./docking/react";
import { ClockWidget } from "./components/workspace/clock-widget";
import { Snake } from "./components/games/snake";
import type { ReactNode } from "react";
import { type WidgetId } from "../core/panel-layout";
import { type Workspace } from "../core/workspace-state";
import { CapabilityInspector } from "./capability-inspector";
import { type WorkspaceCapabilityRuntime } from "../contracts/widget-runtime";
import { WeatherWidget } from "./weather-widget";
import { AIChatWidget } from "./ai-chat-widget";
import { BrowserWidget } from "./browser-widget";
import type { BrowserConfiguration } from "@station/capabilities";

export { WIDGET_CATALOG } from "./widget-catalog";
import type { WidgetActions } from "./widget-actions";
export type { WidgetActions } from "./widget-actions";

/** Built-in React content; dock placement does not grant Component authority. */
export function WidgetView({ id, instanceId, workspace, actions }: { id: WidgetId; instanceId: string; workspace: Workspace; actions: WidgetActions }) {
  const { command, focusPanel } = useDockController();
  const panel = workspace.dock.panels[instanceId];
  // Renderer selection is data dispatch; retained instance ownership stays with DockHost.
  const renderers: Partial<Record<WidgetId, () => ReactNode>> = {
    "desk-controls": () => <DeskControls workspace={workspace} onSearch={() => actions.onSearchCommands?.()} />,
    "quick-capture": () => <QuickCapture panel={panel} workspace={workspace} onCapture={actions.onCaptureRecord} onConfigure={actions.onConfigureCapture} onOpenSource={actions.onOpenAsset} onViewInbox={sourceId => {
      window.dispatchEvent(new CustomEvent("station:capture-view-inbox", { detail: { panelId: panel.id, workspaceId: workspace.id } }));
      focusPanel(null);
      actions.onOpenAsset(sourceId);
    }} />,
    note: () => <NoteWidget panel={panel} workspace={workspace} actions={actions} />,
    "ide": () => <IdeWidget panel={panel} workspace={workspace} />,
    "desk-settings": () => <DeskSettingsDialog docked workspace={workspace} onClose={() => {}} onOpenAsset={assetId => command({ type: "openAsset", assetId })} onSearch={() => actions.onSearchCommands?.()} onCreate={kind => { const assetId = actions.onCreateDataAsset(kind, kind === "theme" ? "My theme" : "My package"); command({ type: "openAsset", assetId }); }} />,
    "program": () => <ProgramWidget panel={panel}/>,
    "action-button": () => <RuntimeActionButton panel={panel} compact={panelSurface(workspace.dock, panel.id) === "toolbar"} />,
    "data-view": () => <DataView workspace={workspace} configuration={viewConfigurationSchema.parse(panel.dataView ?? {})} onChange={config=>command({type:"configureDataView",panelId:instanceId,config})} />,
    "browser-tab": () => <BrowserWidget key={`${workspace.id}:${workspace.activeDeskId}:${instanceId}`} workspace={workspace} instanceId={instanceId} runtime={actions.capabilities} onConfigure={config => actions.onConfigureBrowser(instanceId, config)} />,
    "ai-chat": () => <AIChatWidget surface={panel.surface} key={`${workspace.id}:${workspace.activeDeskId}:${instanceId}`} workspaceId={workspace.id} instanceId={instanceId} />,
    "weather": () => <WeatherWidget surface={panel.surface} />,
    "clock": () => <ClockWidget surface={panel.surface} workspaceId={workspace.id} runtime={actions.capabilities} />,
    "stack": () => null,
    "snake": () => <div className="snake-widget"><Snake autoFocus={false} captureGlobalKeys={false} persistHighScore={`unit-workspace.snake.${workspace.id}`} /><p>Focus the game to use arrow keys. Built-in React widget.</p></div>,
    "capabilities": () => <CapabilityInspector workspace={workspace} actions={actions} runtime={actions.capabilities} />,
  };
  return renderers[id]?.() ?? null;
}

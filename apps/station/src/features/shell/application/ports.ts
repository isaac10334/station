import type { createStore } from "../../workspace/application/store";
import type { WorkspaceCapabilityRuntime } from "../../../contracts/widget-runtime";
import type { CommandPort } from "../../commands/application/client";
type Store = ReturnType<typeof createStore>;
/** Trusted shell state/actions; no compiler, provider registry or service lookup. */
export type ShellWorkspacePort = Pick<Store, "configureShortcuts" | "get" | "subscribe" | "active" | "desk" | "dispatchDock" | "createWorkspace" | "deleteWorkspace" | "renameWorkspace" | "describeWorkspace" | "patchApp" | "undoLayout" | "redoLayout" | "layoutHistory" | "setGrant" | "selectWorkspace" | "canEditSource" | "setAssetGroups" | "selectAsset" | "forkWidgetDefinition" | "saveDeskTemplate" | "createWidgetDefinition" | "createWebAsset" | "createDataAsset" | "createAsset" | "renameAsset" | "resetSample" | "deleteAssets">;
export type OverlayWorkspacePort = Pick<ShellWorkspacePort, "active" | "createWorkspace" | "deleteWorkspace" | "selectWorkspace" | "saveDeskTemplate" | "createWidgetDefinition" | "createWebAsset" | "createDataAsset" | "createAsset" | "dispatchDock" | "renameAsset" | "resetSample" | "deleteAssets" | "renameWorkspace" | "describeWorkspace" | "patchApp">;
export interface ShellSessionPort {
  get(): { kind: "guest" | "demo"; email?: string } | null;
  set(value: { kind: "guest" | "demo"; email?: string } | null): void;
}
export interface ShellPorts {
  /** Validates authored SVG into an inert image URL; composition owns the provider. */
  resolveSvg?: (source:string)=>string;
  workspace: ShellWorkspacePort;
  commands: CommandPort;
  capabilities: WorkspaceCapabilityRuntime;
  session: ShellSessionPort;
}

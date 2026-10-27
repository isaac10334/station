import type { WorkspaceCapabilityRuntime } from "../contracts/widget-runtime";
import type { BrowserConfiguration } from "@station/capabilities";
import type { CaptureRules } from "../core/capture-rules";
export type WidgetActions = {
  onCaptureRecord?: (assetId: string, revision: number, text: string) => void;
  onConfigureCapture?: (assetId: string, revision: number, configuration: CaptureRules) => void;
  capabilities: WorkspaceCapabilityRuntime;
  onCreateDataAsset: (kind: "theme" | "package" | "note" | "markdown", name: string) => string;
  onSaveNoteAsset?: (assetId: string, path: string, source: string, expected: string) => void;
  onCanEditSource?: (assetId: string) => boolean;
  onOpenAsset: (id: string) => void;
  onOpenRun: (id: string) => void;
  onOpenBrowser: () => void;
  onNewAsset: () => void;
  onSearchCommands?: () => void;
  onGrant: (id: string, capability: string, granted: boolean) => void;
  onConfigureBrowser: (id: string, config: BrowserConfiguration) => void;
};

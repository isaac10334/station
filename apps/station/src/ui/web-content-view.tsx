import type { WebContentAsset } from "../core/asset-state";

import {
  EditorWorkspace,
  useEditorOwner,
} from "./components/workspace/editor-workspace";

import { Button } from "./components/ui/button";

export { WEB_CONTENT_CSP, webContentDocument } from "../core/sandbox-document";

export function WebContentView({
  asset,
  ownerId,
  onAddWidget,
}: {
  asset: WebContentAsset;
  ownerId: string;
  onAddWidget: () => void;
}) {
  const session = useEditorOwner(asset, ownerId);

  return (
    <div className="web-content-view station-project-view">
      <div className="station-project-toolbar">
        <strong>{asset.name}</strong>
        <span className="spacer" />
        <Button size="sm" onClick={onAddWidget}>
          Add widget
        </Button>
        <Button
          size="sm"
          disabled={session.busy}
          onClick={() => void session.run()}
        >
          {session.busy ? "Building…" : "Run changes"}
        </Button>
      </div>
      <EditorWorkspace session={session} ownerId={ownerId} />
    </div>
  );
}

import { useState } from "react";
import type { DataAsset } from "../../../core/asset-state";
import {
  isBuiltinDeskTemplate,
  parseDeskTemplate,
} from "../../../core/desk-templates";
import { deps } from "../../../composition";
import { useDockController } from "../../docking/react";
import { Button } from "../ui/button";
import { EditorWorkspace, useEditorOwner } from "./editor-workspace";
import { WidgetPreview } from "./widget-preview";

function TemplateSource({
  asset,
  ownerId,
}: {
  asset: DataAsset;
  ownerId: string;
}) {
  const session = useEditorOwner(asset, ownerId);
  return <EditorWorkspace session={session} ownerId={ownerId} />;
}
/** Creating a desk snapshots this source; editing a template never mutates desks. */
export function DeskTemplateView({
  asset,
  ownerId,
}: {
  asset: DataAsset;
  ownerId: string;
}) {
  const { command } = useDockController();
  const [error, setError] = useState("");
  const builtin = isBuiltinDeskTemplate(asset.id);
  let parsed: ReturnType<typeof parseDeskTemplate> | undefined;
  try {
    parsed = parseDeskTemplate(asset.files["desk.json"] ?? "");
  } catch {}
  const act = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (reason) {
      setError(String(reason));
    }
  };
  const root =
    parsed?.setup.dock.rootId &&
    parsed.setup.dock.panels[parsed.setup.dock.rootId];
  return (
    <div className="station-project-view">
      <div className="station-project-toolbar">
        <strong>{asset.name}</strong>
        <span className="text-xs text-fg-3">
          {builtin ? "Built-in · read-only" : "Desk template"}
        </span>
        <span className="spacer" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            act(() => {
              const id = deps.control.execute({ method: "asset.fork", params: { assetId: asset.id, name: `${asset.name.slice(0, 108)} variant` } }).result.id;
              command({ type: "openAsset", assetId: id });
            })
          }
        >
          Fork template
        </Button>
        <Button
          size="sm"
          disabled={!parsed}
          onClick={() =>
            act(() => deps.store.createDesk(parsed!.title, false, asset.id))
          }
        >
          Create desk
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {root && root.kind === "widget" && (
        <div className="max-h-40 p-3">
          <WidgetPreview
            seed={{
              widget: root.widget,
              defaults: { background: root.background },
            }}
            small
          />
        </div>
      )}
      {builtin ? (
        <pre tabIndex={0} className="min-h-0 flex-1 overflow-auto p-4 text-xs">
          {asset.files["desk.json"]}
        </pre>
      ) : (
        <TemplateSource asset={asset} ownerId={ownerId} />
      )}
    </div>
  );
}

import { useState } from "react";
import type { DataAsset } from "../../../core/asset-state";
import { deps } from "../../../composition";
import { svgIconUrl } from "../../../services/svg-icons";
import { patchOwnerFiles } from "../../lib/owner-commands";
import { useSourceEditing } from "../../lib/use-source-editing";
import { Button } from "../ui/button";
import { EditorWorkspace, useEditorOwner } from "./editor-workspace";
import { SvgEditCanvas } from "./svg-edit-canvas";
import { VectorcraftEditor } from "./vectorcraft-editor";

/** SVG-Edit owns drawing and history; Station owns validated revision-checked persistence. */
export function SvgAssetEditor({ asset, ownerId, engine = "svg-edit" }: { asset: DataAsset; ownerId: string; engine?: "svg-edit" | "vectorcraft" }) {
  const session = useEditorOwner(asset, ownerId);
  const editable = useSourceEditing(asset.id);
  const [code, setCode] = useState(false);
  const commit = (next: string, expected: string) => {
    const current = deps.store.active().assets.find(a => a.id === asset.id);
    if (!editable || !current || current.files?.["image.svg"] !== expected) throw new Error("SVG source changed. Reload saved source before applying.");
    svgIconUrl(next);
    patchOwnerFiles(asset.id, { "image.svg": next });
  };
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2"><Button size="sm" variant={!code ? "secondary" : "ghost"} onClick={() => setCode(false)}>Design</Button><Button size="sm" variant={code ? "secondary" : "ghost"} onClick={() => setCode(true)}>Source</Button></div>
    <div className={code ? "hidden" : "flex min-h-0 flex-1 flex-col"}>{engine === "vectorcraft" ? <VectorcraftEditor normalize={deps.svgEditing.normalize} preview={deps.svgEditing.preview} key={asset.id} workspaceId={deps.store.active().id} assetId={asset.id} ownerId={ownerId} revision={asset.revision} source={asset.files["image.svg"] ?? ""} editable={editable} onCommit={commit} register={deps.vectorEditors.register} run={deps.commands.run} /> : <SvgEditCanvas key={asset.id} source={asset.files["image.svg"] ?? ""} editable={editable} onCommit={commit} />}</div>
    {code && <EditorWorkspace session={session} ownerId={ownerId} />}
  </div>;
}

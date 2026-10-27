import { useEffect, useRef, useState } from "react";
import { awaitOwnerOperation } from "../../lib/owner-commands";
import type { DataAsset } from "../../../core/asset-state";
import type { Workspace } from "../../../core/workspace-state";
import { deps } from "../../../composition";
import { EditorWorkspace, useEditorOwner } from "./editor-workspace";
import {
  exportPackage,
  type PackageInstallation,
} from "../../../core/package-assets";
import { packageRuntime } from "../../../composition";
const { prepareInstallation } = packageRuntime;
import { parseTheme } from "../../../core/theme-assets";
import { notePath } from "../../../core/notes";
import { RichTextEditor } from "../ui/rich-text-editor";
import { useSourceEditing } from "../../lib/use-source-editing";
import { patchOwnerFiles } from "../../lib/owner-commands";
import { Button } from "../ui/button";
import { ThemeEditor } from "./theme-editor";
import { Code, Eye } from "../../lib/icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "../ui/dialog";

export function DataAssetView({
  asset,
  ownerId,
  workspace,
  sourceRequest,
}: {
  asset: DataAsset;
  ownerId: string;
  workspace: Workspace;
  sourceRequest?: number;
}) {
  const session = useEditorOwner(asset, ownerId);
  const noteEditable = useSourceEditing(asset.id);
  const [help, setHelp] = useState(false);
  const [themeMode, setThemeMode] = useState("design");
  useEffect(() => {
    if (sourceRequest) setThemeMode("code");
  }, [sourceRequest]);
  const preparation = useRef<AbortController | null>(null);
  useEffect(() => () => preparation.current?.abort(), []);
  const [review, setReview] = useState<(PackageInstallation & { preparationId: string }) | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const download = () => {
    try {
      const source = exportPackage(asset, workspace.assets);
      const url = URL.createObjectURL(
        new Blob([source], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${asset.id}.station.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(String(error));
    }
  };
  if (asset.kind === "note" || asset.kind === "markdown") {
    const path = notePath(asset.kind);
    return <RichTextEditor key={asset.id} label={asset.name} source={asset.files[path] ?? ""} format={asset.kind} readOnly={!noteEditable} onCommit={(next, expected) => {
      const current = deps.store.active().assets.find(item => item.id === asset.id);
      if (!noteEditable || current?.files?.[path] !== expected) throw new Error("Note source changed or editing is unavailable. Your draft is retained.");
      patchOwnerFiles(asset.id, { [path]: next });
    }} />;
  }
  return (
    <div className="station-project-view">
      {help && asset.kind === "package" && <section className="space-y-2 border-b border-line bg-frame p-4 text-xs" aria-label="Package guide">
        <h3 className="text-sm font-medium">Build a reusable package</h3>
        <ol className="list-decimal space-y-2 pl-4"><li>Edit <code>station.json</code>: give the package a stable identity and declare contributions.</li><li>Use the file tree to add source files. Keep entry paths local to the package.</li><li>Declare only the capabilities each contribution needs. Declarations request access; they do not grant it.</li><li>Choose Install package to review the requested access, then explicitly install. Opening source does not run it.</li><li>Export the package to share its source. Your task credentials, grants and live sessions are excluded.</li></ol>
        <p>A JSON script computes a value. A TypeScript program builds a widget, service or action. A Rust Component builds a portable WASM artifact with declared imports.</p>
      </section>}
      <div className="station-project-toolbar">
        <strong>{asset.name}</strong>
        <span className="spacer" />
        {asset.kind === "theme" ? (
          <Button
            size="sm"
            onClick={() => {
              try {
                parseTheme(asset.files["theme.json"]!);
                deps.store.patchDesk({ themeId: asset.id });
                setError("");
              } catch (error) {
                setError(String(error));
              }
            }}
          >
            Use on this desk
          </Button>
        ) : (
          <>
            <Button size="sm" variant="ghost" aria-expanded={help} onClick={() => setHelp(!help)}>Package guide</Button>
            <Button size="sm" onClick={download}>
              Export package
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const controller = new AbortController();
                  preparation.current = controller;
                  const operation = deps.control.execute({ method: "package.prepare", params: { assetId: asset.id } }).result;
                  const stop = () => deps.control.execute({ method: "operations.cancel", params: { operationId: operation.operationId } });
                  controller.signal.addEventListener("abort", stop, { once: true });
                  try {
                    const prepared = await awaitOwnerOperation(operation.operationId);
                    setReview({ ...deps.control.preparedPackage(prepared.preparationId), preparationId: prepared.preparationId });
                  } finally { controller.signal.removeEventListener("abort", stop); }
                } catch (error) {
                  setError(String(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? "Preparing…"
                : workspace.installations.some(
                      (item) => item.packageAssetId === asset.id,
                    )
                  ? "Update installation"
                  : "Install package"}
            </Button>
          </>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {asset.kind === "theme" && (
        <div className="flex gap-2 border-b border-line px-3 py-2">
          <Button
            size="sm"
            variant={themeMode === "design" ? "secondary" : "ghost"}
            onClick={() => setThemeMode("design")}
          >
            <Eye />
            Design
          </Button>
          <Button
            size="sm"
            variant={themeMode === "code" ? "secondary" : "ghost"}
            onClick={() => setThemeMode("code")}
          >
            <Code />
            Code
          </Button>
        </div>
      )}
      {asset.kind === "theme" && themeMode === "design" ? (
        <ThemeEditor
          key={asset.id}
          asset={asset}
          workspace={workspace}
          onOpenCode={() => setThemeMode("code")}
        />
      ) : (
        <EditorWorkspace session={session} ownerId={ownerId} />
      )}
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install {review?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p>
              These contributions become available in this workspace.
              Installation does not start them.
            </p>
            {workspace.installations.some((item) => item.id === review?.id) && (
              <p>
                This replaces the existing installation. Existing widget
                instances use the updated snapshot.
              </p>
            )}
            {review?.manifest.contributions.map((item) => (
              <section key={item.id}>
                <strong>
                  {item.title} · {item.role}
                </strong>
                <p>
                  {item.capabilities.length
                    ? `Approve: ${item.capabilities.join(", ")}`
                    : "No privileged capabilities requested"}
                </p>
              </section>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                try {
                  if (review)
                    deps.control.execute({ method: "package.install", params: {
                      preparationId: review.preparationId,
                      grants: Object.fromEntries(
                        review.manifest.contributions.map((item) => [
                          item.id,
                          item.capabilities,
                        ]),
                      ),
                    } });
                  setReview(null);
                } catch (error) {
                  setError(String(error));
                }
              }}
            >
              Approve and install
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

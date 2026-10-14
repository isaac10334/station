import { useEffect, useRef, useState } from "react";
import type { DataAsset, Workspace } from "../../../core/model";
import { deps } from "../../../composition";
import { EditorWorkspace, useEditorOwner } from "./editor-workspace";
import {
  exportPackage,
  type PackageInstallation,
} from "../../../core/package-assets";
import { packageRuntime } from "../../../composition";
const { prepareInstallation } = packageRuntime;
import { parseTheme } from "../../../core/theme-assets";
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
  const [themeMode, setThemeMode] = useState("design");
  useEffect(() => {
    if (sourceRequest) setThemeMode("code");
  }, [sourceRequest]);
  const preparation = useRef<AbortController | null>(null);
  useEffect(() => () => preparation.current?.abort(), []);
  const [review, setReview] = useState<PackageInstallation | null>(null),
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
  return (
    <div className="station-project-view">
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
                  setReview(
                    await prepareInstallation(
                      workspace,
                      asset.id,
                      controller.signal,
                    ),
                  );
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
        <ThemeEditor asset={asset} workspace={workspace} />
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
                    deps.store.installPackage({
                      ...review,
                      grants: Object.fromEntries(
                        review.manifest.contributions.map((item) => [
                          item.id,
                          item.capabilities,
                        ]),
                      ),
                    });
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

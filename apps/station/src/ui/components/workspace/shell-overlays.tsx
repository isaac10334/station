import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { WorkspaceSettings } from "./workspace-settings";
import { WorkspaceDeletion } from "./workspace-deletion";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Onboarding, type DemoIdentity } from "../../onboarding";

import type { Workspace, State } from "../../../core/workspace-state";
import type { OverlayWorkspacePort } from "../../../features/shell/application/ports";
import { createOverlayActions, type Overlay } from "../../../features/shell/application/overlays";
/** Transient dialog host. Neither dialog visibility nor input drafts enter the layout document. */
export function OverlayHost({
  store,
  overlay,
  setOverlay,
  workspace,
  state,
  onContinue,
  shortcuts,
}: {
  store: OverlayWorkspacePort;
  overlay: Overlay;
  setOverlay: (next: Overlay) => void;
  workspace: Workspace;
  state: State;
  onContinue?: (identity: DemoIdentity) => void;
  shortcuts: ReactNode;
}) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (overlay?.kind === "rename")
      setName(
        workspace.assets.find((asset) => asset.id === overlay.assetId)?.name ??
          "",
      );
    else setName("");
  }, [overlay?.kind, overlay?.kind === "rename" ? overlay.assetId : ""]);
  const close = () => setOverlay(null);
  const actions = createOverlayActions(store);
  return (
    <>
      <Dialog
        open={Boolean(overlay)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        {overlay && (
          <DialogContent
            size={overlay.kind === "settings" ? "lg" : "sm"}
            className={overlay.kind === "settings" ? "workspace-dialog max-w-[960px]" : "workspace-dialog"}
          >
            {overlay.kind === "create" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = name.trim();
                  if (!value) return;
                  actions.create(overlay.target, value, overlay.scriptMode);
                  close();
                }}
              >
                <DialogHeader>
                  <DialogTitle>
                    New{" "}
                    {
                      {
                        "desk-template": "desk template",
                        "widget-definition": "widget definition",
                        component: "Component",
                        "web-content": "web content",
                        theme: "theme",
                        package: "package",
                        svg: "SVG", decision: "decision policy", "data-source": "data source", custom:"Custom document",script: overlay.scriptMode === "javascript" ? "JavaScript calculation" : "TypeScript program",
                        markdown: "Markdown document", note: "rich note",
                        workspace: "workspace",
                      }[overlay.target]
                    }
                  </DialogTitle>
                  <DialogDescription>
                    {
                      {
                        "desk-template":
                          "Save this desk�s layout and widget configuration as a reusable asset.",
                        "widget-definition":
                          "Visually compose a Layout and its default child widgets.",
                        component: "Start with a Rust and WIT source project.",
                        custom:'Create a document for an activated extension type.',
                        "web-content":
                          "Create a TypeScript web project with an isolated preview.",
                        theme: "Edit semantic theme tokens as data.",
                        package:
                          "Declare widgets, editors, commands and themes from your assets.",
                        svg: "Create a static SVG with a safe visual preview.",
                        markdown: "Write a portable Markdown document with rich formatting controls.",
                        note: "Write a rich note that preserves its full formatting.",
                        decision: "Configure declarative editor routing without executing code.",
                        "data-source": "Shared records with independently configured table, board and graph views.",
                        script: "Edit and explicitly run JavaScript inside a bounded WASM interpreter.",
                        workspace:
                          "Create a separate space for assets and desks.",
                      }[overlay.target]
                    }
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <label className="field-label" htmlFor="new-name">
                    Name
                  </label>
                  <input
                    id="new-name"
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                    placeholder={
                      overlay.target === "component"
                        ? "My Component"
                        : overlay.target === "web-content"
                          ? "My Widget"
                          : "My Workspace"
                    }
                  />
                </DialogBody>
                <DialogFooter>
                  <button type="button" className="secondary" onClick={close}>
                    Cancel
                  </button>
                  <button className="primary" type="submit">
                    Create
                  </button>
                </DialogFooter>
              </form>
            )}
            {overlay.kind === "rename" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim())
                    store.renameAsset(overlay.assetId, name.trim());
                  close();
                }}
              >
                <DialogHeader>
                  <DialogTitle>Rename asset</DialogTitle>
                  <DialogDescription>
                    Change its display name. Source and artifact identity stay
                    the same.
                  </DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <label className="field-label" htmlFor="rename-name">
                    Name
                  </label>
                  <input
                    id="rename-name"
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.currentTarget.value)}
                  />
                </DialogBody>
                <DialogFooter>
                  <button type="button" className="secondary" onClick={close}>
                    Cancel
                  </button>
                  <button className="primary" type="submit">
                    Rename
                  </button>
                </DialogFooter>
              </form>
            )}
            {overlay.kind === "restore" && (
              <>
                <DialogHeader>
                  <DialogTitle>Restore Greeting sample?</DialogTitle>
                  <DialogDescription>
                    This replaces edited source with the bundled Rust and WIT
                    project. Build it again to run.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <button className="secondary" onClick={close}>
                    Cancel
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      store.resetSample(overlay.assetId);
                      close();
                    }}
                  >
                    Restore sample
                  </button>
                </DialogFooter>
              </>
            )}
            {overlay.kind === "delete" && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    Delete{" "}
                    {overlay.assetIds.length === 1
                      ? (workspace.assets.find(
                          (asset) => asset.id === overlay.assetIds[0],
                        )?.name ?? "asset")
                      : `${overlay.assetIds.length} assets`}
                    ?
                  </DialogTitle>
                  <DialogDescription>
                    This removes the selected assets and their open views from
                    this workspace. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <button className="secondary" autoFocus onClick={close}>
                    Cancel
                  </button>
                  <button
                    className="primary"
                    onClick={() => {
                      actions.remove(overlay.workspaceId, overlay.assetIds);
                      close();
                    }}
                  >
                    Delete {overlay.assetIds.length === 1 ? "asset" : "assets"}
                  </button>
                </DialogFooter>
              </>
            )}
            {overlay.kind === "settings" && <WorkspaceSettings store={store} state={state} workspace={workspace} section={overlay.section} onSection={section => setOverlay({ kind: "settings", section })} shortcuts={shortcuts} onClose={close} />}
            {overlay.kind === "delete-workspace" && <WorkspaceDeletion key={overlay.workspaceId} store={store} state={state} workspaceId={overlay.workspaceId} onClose={close} />}

          </DialogContent>
        )}
      </Dialog>
      {onContinue && <Onboarding onContinue={onContinue} />}
    </>
  );
}

import { useSourceEditing } from "../../lib/use-source-editing";
import { patchOwnerFiles } from "../../lib/owner-commands";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { Asset } from "../../../core/asset-state";
import { deps } from "../../../composition";
import {
  EditorSession,
  editorSessions,
  editorSessionRegistry,
  registerEditorSession,
} from "../../../services/editor-session";
import { assetFiles } from "../../../core/source-project";
import { DockOwnedLayout, useDockController } from "../../docking/react";
import { type Node, type Panel } from "../../../core/docking";
import { SourceFileTree } from "./source-file-tree";
import { SourceEditor } from "./source-editor";
import { SandboxFrame } from "../../sandbox-frame";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Tabs, TabsList, TabsTab } from "../ui/tabs";
import { Button } from "../ui/button";

export function useEditorOwner(asset: Asset, ownerId: string, adapter?: EditorSession["sourceAdapter"]) {
  const [session] = useState(() => new EditorSession(asset));
  useLayoutEffect(() => { session.sourceAdapter = adapter; }, [session, adapter]);
  useLayoutEffect(
    () => registerEditorSession(ownerId, session),
    [session, ownerId],
  );
  useEffect(() => {
    session.update(asset);
  }, [asset, session]);
  useEffect(() => {
    void session.diagnose();
    return () => session.dispose();
  }, [session, ownerId]);
  useSyncExternalStore(session.subscribe, () => session.version);
  return session;
}
/** Populate a real owned dock subtree once. Pane moves use the existing command boundary. */
export function EditorWorkspace({
  session,
  ownerId,
}: {
  session: EditorSession;
  ownerId: string;
}) {
  const { layout, command } = useDockController();
  useEffect(() => {
    if (layout.containers[ownerId]) return;
    const parts =
      session.asset.kind === "web-content"
        ? (["files", "code", "preview", "problems"] as const)
        : (["files", "code", "problems"] as const);
    const panels: Panel[] = parts.map((part) => ({
      id: `${ownerId}:${part}`,
      kind: "editor-part",
      part,
      assetId: session.asset.id,
      ownerId,
      slotId: part,
      definitionId: `station:editor/${part}`,
      tags: ["widget"],
    }));
    const slot = (part: string): Node => ({
      kind: "stack",
      id: `${ownerId}:slot:${part}`,
      tabs: [`${ownerId}:${part}`],
      active: `${ownerId}:${part}`,
      keepEmpty: true,
    });
    const code: Node =
      session.asset.kind === "web-content"
        ? {
            kind: "split",
            id: `${ownerId}:code-preview`,
            axis: "horizontal",
            ratio: 0.6,
            first: slot("code"),
            second: slot("preview"),
          }
        : slot("code");
    command({
      type: "compose",
      ownerId,
      panels,
      root: {
        kind: "split",
        id: `${ownerId}:editor`,
        axis: "horizontal",
        ratio: 0.2,
        first: slot("files"),
        second: {
          kind: "split",
          id: `${ownerId}:output`,
          axis: "vertical",
          ratio: 0.8,
          first: code,
          second: slot("problems"),
        },
      },
    });
  }, [ownerId, layout.containers[ownerId], session]);
  return (
    <div className="station-editor-layout">
      <DockOwnedLayout ownerId={ownerId} controls={false} />
    </div>
  );
}
export function EditorPart({
  panel,
}: {
  panel: Extract<Panel, { kind: "editor-part" }>;
}) {
  useSyncExternalStore(
    editorSessionRegistry.subscribe,
    editorSessionRegistry.snapshot,
  );
  const session = editorSessions.get(panel.ownerId!);
  const sourceEditable = useSourceEditing(panel.assetId);
  const editable = session?.sourceAdapter?.editable ?? sourceEditable;
  const [operation, setOperation] = useState<
      "new" | "rename" | "delete" | null
    >(null),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  useSyncExternalStore(
    session?.subscribe ?? (() => () => {}),
    () => session?.version ?? 0,
  );
  if (!session) return <p>Opening editor…</p>;
  const files = assetFiles(session.asset);
  const patchFiles = (patch: Record<string, string | null>) => session.sourceAdapter ? session.sourceAdapter.patch(patch) : patchOwnerFiles(session.asset.id, patch);
  const title = {
    files: "Files",
    code: "Code",
    preview: "Preview",
    problems: "Problems",
  }[panel.part];
  return (
    <div className="station-editor-part">
      {panel.part === "files" ? (
        <>
          <SourceFileTree
            editable={editable && !(session.sourceAdapter && session.selected === "program.json")}
            paths={Object.keys(files)}
            selected={session.selected}
            onSelect={(path) => session.select(path)}
            onNew={() => {
              setName("");
              setOperation("new");
            }}
            onRename={(path) => {
              session.select(path);
              setName(path);
              setOperation("rename");
            }}
            onDelete={(path) => {
              session.select(path);
              setOperation("delete");
            }}
          />
        </>
      ) : panel.part === "code" ? (
        <Tabs
          value={session.selected}
          onValueChange={(value) => session.select(String(value))}
          className="flex min-h-0 flex-1 flex-col"
          variant="underline"
        >
          <TabsList className="station-file-tabs" aria-label="Open files">
            {session.tabs.map((path) => (
              <span key={path} className="flex items-center">
                <TabsTab
                  value={path}
                  aria-controls={`${panel.id}:code-surface`}
                >
                  {path}
                </TabsTab>
                <button
                  type="button"
                  aria-label={`Close ${path}`}
                  onClick={() => session.close(path)}
                >
                  ×
                </button>
              </span>
            ))}
          </TabsList>
          <div
            id={`${panel.id}:code-surface`}
            className="flex min-h-0 flex-1 flex-col"
            role="tabpanel"
            aria-label={session.selected || "Code"}
          >
            {session.selected ? (
              <SourceEditor session={session} path={session.selected} editable={editable && !(session.sourceAdapter && session.selected === "program.json")} onChange={session.sourceAdapter ? (path, source) => patchFiles({ [path]: source }) : undefined} />
            ) : (
              <p>Select a file to edit.</p>
            )}
          </div>
        </Tabs>
      ) : panel.part === "preview" ? (
        <>
          <div className="station-editor-part-toolbar">
            <Button
              size="sm"
              disabled={session.busy}
              onClick={() => void session.run()}
            >
              {session.busy ? "Building…" : "Run changes"}
            </Button>
            <span role="status">
              {session.preview?.revision !== session.asset.revision
                ? "Changes pending"
                : "Current"}
            </span>
          </div>
          {session.preview ? (
            <SandboxFrame
              key={session.previewRun}
              html={session.preview.document}
              title={`${session.asset.name} preview`}
            />
          ) : (
            <p>Run changes to open a preview.</p>
          )}
        </>
      ) : (
        <div className="station-problems">
          <button type="button" onClick={() => void session.diagnose()}>
            Check project
          </button>
          {session.error && <p role="alert">{session.error}</p>}
          {session.problems.map((problem, index) => (
            <button
              type="button"
              key={index}
              onClick={() => session.select(problem.path)}
            >
              {problem.path}: {problem.message}
            </button>
          ))}
          {!session.error && !session.problems.length && (
            <p>No problems reported.</p>
          )}
        </div>
      )}
      <Dialog
        open={!!operation}
        onOpenChange={(open) => {
          if (!open) {
            setOperation(null);
            setError("");
          }
        }}
      >
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                if (operation === "new") {
                  if (files[name] !== undefined)
                    throw new Error("File already exists");
                  patchFiles({ [name]: "" });
                  session.selected = name;
                } else if (operation === "rename") {
                  const previous = session.selected;
                  const document = session.documents.get(previous);
                  if (files[name] !== undefined) throw new Error("Destination file already exists");
                  patchFiles({ [previous]: null, [name]: files[previous] });
                  if (document) session.documents.set(name, document);
                  session.documents.delete(previous);
                  session.tabs = session.tabs.map((path) =>
                    path === previous ? name : path,
                  );
                  session.selected = name;
                } else
                  patchFiles({ [session.selected]: null });
                setOperation(null);
                setError("");
              } catch (error) {
                setError(String(error));
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {operation === "delete"
                  ? `Delete ${session.selected}?`
                  : operation === "rename"
                    ? "Rename file"
                    : "New file"}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              {operation !== "delete" && (
                <>
                  <label htmlFor={`${panel.id}:path`}>File path</label>
                  <Input
                    id={`${panel.id}:path`}
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </>
              )}
              {error && <p role="alert">{error}</p>}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOperation(null)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {operation === "delete" ? "Delete" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

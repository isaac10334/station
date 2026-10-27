import { useSourceEditing } from "../../lib/use-source-editing";
import { useEffect, useRef } from "react";
import { CodeFormatButton } from "../ui/code-format-button";
import { indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { basicSetup, EditorView } from "codemirror";
import {
  Annotation,
  EditorState,
  Transaction,
  StateEffect,
  Prec,
} from "@codemirror/state";
import { autocompletion } from "@codemirror/autocomplete";
import { setDiagnostics } from "@codemirror/lint";
import { deps } from "../../../composition";
import { assetFiles } from "../../../core/source-project";
import type { EditorSession } from "../../../services/editor-session";

import { codeEditorTheme, codeLanguage } from "../ui/code-editor-theme";

const sourceSync = Annotation.define<boolean>();
/** Shared CodeMirror view. Per-file state belongs to the editor session, not the asset. */
export function SourceEditor({
  session,
  path,
  onChange,
  editable,
}: {
  editable?: boolean;
  session: EditorSession;
  path: string;
  onChange?: (path: string, source: string) => void;
}) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const sourceEditable = useSourceEditing(session.asset.id);
  const readOnly = !(editable ?? sourceEditable);
  const holder = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null);
  const files = assetFiles(session.asset);
  useEffect(() => {
    if (!holder.current || !path) return;
    const saved = session.documents.get(path);
    const extensions = [
      basicSetup,
      EditorView.editable.of(!readOnly),
      EditorState.readOnly.of(readOnly),
      codeEditorTheme,
      EditorView.contentAttributes.of({ "aria-label": `${path} source` }),
      Prec.highest(keymap.of([indentWithTab])),
      codeLanguage(path),
      EditorView.lineWrapping,
      autocompletion({
        override: /\.[jt]sx?$/.test(path)
          ? [
              async (context) => {
                const word = context.matchBefore(/[\w$]*/);
                if (!word || (!context.explicit && word.from === word.to))
                  return null;
                return {
                  from: word.from,
                  options: await session.complete(path, context.pos),
                };
              },
            ]
          : undefined,
      }),
      EditorView.updateListener.of((update) => {
        session.documents.set(path, {
          state: update.state,
          scroll: update.view.scrollDOM.scrollTop,
        });
        if (
          update.docChanged &&
          !update.transactions.some((transaction) =>
            transaction.annotation(sourceSync),
          )
        )
          if (changeRef.current)
            changeRef.current(path, update.state.doc.toString());
          else
            deps.control.execute({
              method: "asset.files.patch",
              params: {
                assetId: session.asset.id,
                expectedAssetRevision: deps.store
                  .active()
                  .assets.find((a) => a.id === session.asset.id)!.revision,
                patch: { [path]: update.state.doc.toString() },
              },
            });
      }),
    ];
    const state =
      saved?.state ??
      EditorState.create({
        doc: assetFiles(session.asset)[path] ?? "",
        extensions,
      });
    const editor = new EditorView({ state, parent: holder.current });
    view.current = editor;
    if (saved)
      editor.dispatch({ effects: StateEffect.reconfigure.of(extensions) });
    session.documents.set(path, {
      state: editor.state,
      scroll: saved?.scroll ?? 0,
    });
    if (saved) editor.scrollDOM.scrollTop = saved.scroll;
    return () => {
      session.documents.set(path, {
        state: editor.state,
        scroll: editor.scrollDOM.scrollTop,
      });
      editor.destroy();
      view.current = null;
    };
  }, [session, path, readOnly]);
  useEffect(() => {
    const editor = view.current,
      source = files[path] ?? "";
    if (editor && editor.state.doc.toString() !== source)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: source },
        annotations: [sourceSync.of(true), Transaction.addToHistory.of(false)],
      });
  }, [files[path], path]);
  useEffect(() => {
    const editor = view.current;
    if (editor)
      editor.dispatch(
        setDiagnostics(
          editor.state,
          session.problems
            .filter((problem) => problem.path === path)
            .map((problem) => ({
              ...problem,
              from: Math.min(problem.from, editor.state.doc.length),
              to: Math.min(problem.to, editor.state.doc.length),
            })),
        ),
      );
  }, [session.problems, path]);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-2 py-1">
        <span className="truncate text-xs text-fg-3">
          {path}
          {readOnly ? " · Read only" : ""}
        </span>
        <CodeFormatButton
          key={path}
          view={view}
          path={path}
          readOnly={readOnly}
        />
      </div>
      <div
        className="source-editor station-code-view"
        ref={holder}
        aria-label={`${path} source`}
      />
    </div>
  );
}

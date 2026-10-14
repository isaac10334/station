import { useSourceEditing } from "../../lib/use-source-editing";
import { useEffect, useRef } from "react";
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
import { rust } from "@codemirror/lang-rust";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { autocompletion } from "@codemirror/autocomplete";
import { setDiagnostics } from "@codemirror/lint";
import { deps } from "../../../composition";
import { assetFiles } from "../../../core/source-project";
import type { EditorSession } from "../../../services/editor-session";

const sourceSync = Annotation.define<boolean>();
const sourceHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: tags.keyword,
      color: "var(--focus-ring, var(--fg))",
      fontWeight: "600",
    },
    { tag: [tags.name, tags.operator, tags.punctuation], color: "var(--fg)" },
    {
      tag: [tags.string, tags.number, tags.attributeName],
      color: "var(--fg-2)",
    },
    {
      tag: [tags.comment, tags.meta],
      color: "var(--fg-3)",
      fontStyle: "italic",
    },
  ]),
);
const language = (path: string) =>
  path.endsWith(".rs")
    ? rust()
    : /\.[jt]sx?$/.test(path)
      ? javascript({ typescript: /\.tsx?$/.test(path), jsx: /x$/.test(path) })
      : path.endsWith(".html") || path.endsWith(".svg")
        ? html()
        : path.endsWith(".css")
          ? css()
          : path.endsWith(".json")
            ? json()
            : [];
/** Shared CodeMirror view. Per-file state belongs to the editor session, not the asset. */
export function SourceEditor({
  session,
  path,
}: {
  session: EditorSession;
  path: string;
}) {
  const readOnly = !useSourceEditing(session.asset.id);
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
      sourceHighlighting,
      Prec.highest(keymap.of([indentWithTab])),
      language(path),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          height: "100%",
          backgroundColor: "var(--frame)",
          color: "var(--fg)",
        },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: "12px",
        },
        ".cm-gutters": {
          backgroundColor: "var(--raised)",
          color: "var(--fg-3)",
          borderRight: "1px solid var(--line-2)",
        },
        "&.cm-focused": { outline: "none" },
      }),
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
          deps.store.editFile(
            session.asset.id,
            path,
            update.state.doc.toString(),
          );
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
    <div
      className="source-editor station-code-view"
      ref={holder}
      aria-label={`${path} source`}
    />
  );
}

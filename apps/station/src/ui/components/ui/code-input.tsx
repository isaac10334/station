import { CodeFormatButton } from "./code-format-button";
import { useEffect, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { Annotation, EditorState, Transaction } from "@codemirror/state";
import { codeEditorTheme, codeLanguage } from "./code-editor-theme";

const externalChange = Annotation.define<boolean>();
/** Controlled, store-free code widget. External synchronization preserves cursor
 * and undo history; application source editors retain their own session lifecycle. */
export function CodeInput({
  label,
  value,
  onChange,
  path = "value.json",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (source: string) => void;
  path?: string;
  readOnly?: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null);
  const change = useRef(onChange),
    source = useRef(value);
  change.current = onChange;
  source.current = value;
  useEffect(() => {
    const editor = new EditorView({
      parent: holder.current!,
      doc: source.current,
      extensions: [
        basicSetup,
        codeEditorTheme,
        codeLanguage(path),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({ "aria-label": label }),
        EditorView.updateListener.of((update) => {
          if (
            update.docChanged &&
            !update.transactions.some((t) => t.annotation(externalChange))
          )
            change.current?.(update.state.doc.toString());
        }),
      ],
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [path, readOnly, label]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
        annotations: [
          externalChange.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
  }, [value]);
  return (
    <div className="flex h-full min-h-24 min-w-0 flex-col overflow-hidden"><div className="flex shrink-0 justify-end border-b border-line px-2"><CodeFormatButton key={path} view={view} path={path} readOnly={readOnly || !onChange} /></div><div ref={holder} className="min-h-0 flex-1 overflow-hidden" /></div>
  );
}

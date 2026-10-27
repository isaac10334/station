import { useState, type RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import { formatSource } from "../../lib/format-source";
import { Button } from "./button";

/** Formatting is one undoable editor transaction; stale async results never replace newer edits. */
export function CodeFormatButton({
  view,
  path,
  readOnly,
}: {
  view: RefObject<EditorView | null>;
  path: string;
  readOnly: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="flex min-w-0 items-center gap-2">
      {error && (
        <span
          role="alert"
          className="max-w-80 truncate text-xs text-danger"
          title={error}
        >
          {error}
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={
          readOnly ||
          busy ||
          !/\.(?:[jt]sx?|mjs|json|html|svg|css|scss|less)$/.test(path)
        }
        aria-busy={busy}
        onClick={async () => {
          const editor = view.current;
          if (!editor) return;
          const before = editor.state.doc.toString();
          setBusy(true);
          setError("");
          try {
            const formatted = await formatSource(before, path);
            if (
              view.current !== editor ||
              editor.state.doc.toString() !== before ||
              editor.state.readOnly
            )
              throw new Error("Source changed while formatting. Try again.");
            if (formatted !== before)
              editor.dispatch({
                changes: { from: 0, to: before.length, insert: formatted },
                userEvent: "input.format",
              });
          } catch (reason) {
            setError(String(reason));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Formatting…" : "Format"}
      </Button>
    </div>
  );
}

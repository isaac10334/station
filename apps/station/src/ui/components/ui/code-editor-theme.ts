import { EditorView } from "@codemirror/view";
import { rust } from "@codemirror/lang-rust";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

/** One token-based CodeMirror presentation for source sessions and property editors. */
export const codeEditorTheme = [
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.keyword, color: "var(--syntax-keyword)", fontWeight: "600" },
      { tag: [tags.name, tags.operator, tags.punctuation], color: "var(--fg)" },
      {
        tag: [tags.string, tags.attributeValue],
        color: "var(--syntax-string)",
      },
      {
        tag: [tags.number, tags.bool, tags.null],
        color: "var(--syntax-number)",
      },
      {
        tag: [tags.comment, tags.meta],
        color: "var(--fg-3)",
        fontStyle: "italic",
      },
      {
        tag: [tags.function(tags.variableName), tags.typeName],
        color: "var(--syntax-function)",
      },
    ]),
  ),
  EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "var(--frame)",
      color: "var(--fg)",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      lineHeight: "1.7",
    },
    ".cm-content": { padding: "12px 0", caretColor: "var(--focus-ring)" },
    ".cm-line": { padding: "0 12px" },
    ".cm-gutters": {
      backgroundColor: "var(--frame)",
      color: "var(--fg-3)",
      borderRight: "1px solid var(--line)",
    },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--hover)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--focus-ring)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      { backgroundColor: "var(--selected)" },
    "&.cm-focused": {
      outline: "1px solid var(--focus-ring)",
      outlineOffset: "-1px",
    },
    ".cm-panels, .cm-tooltip": {
      backgroundColor: "var(--raised)",
      color: "var(--fg)",
      borderColor: "var(--line)",
    },
    ".cm-search input, .cm-search button": {
      background: "var(--frame)",
      color: "var(--fg)",
      border: "1px solid var(--line)",
      borderRadius: "var(--radius-sm)",
    },
  }),
];
export const codeLanguage = (path: string) =>
  path.endsWith(".rs")
    ? rust()
    : /\.[jt]sx?$/.test(path)
      ? javascript({ typescript: /\.tsx?$/.test(path), jsx: /x$/.test(path) })
      : /\.(html|svg)$/.test(path)
        ? html()
        : path.endsWith(".css")
          ? css()
          : path.endsWith(".json")
            ? json()
            : [];

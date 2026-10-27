import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import "@blocknote/core/style.css";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { parseRichNote, richNoteSchema, safeNoteLink, NOTE_LIMIT } from "../../../core/notes";
import { RichTextAssetsContext, type RichTextEditorProps } from "./rich-text-contract";
import { SemanticThemeContext } from "../../semantic-theme";
import { useOverlayContainer } from "./overlay-container";
import { Button } from "./button";
import { CodeInput } from "./code-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "./dialog";

const { paragraph, heading, bulletListItem, numberedListItem, checkListItem, codeBlock, table, quote, divider } = defaultBlockSpecs;
const schema = BlockNoteSchema.create({ blockSpecs: { paragraph, heading, bulletListItem, numberedListItem, checkListItem, codeBlock, table, quote, divider } });
function download(source: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([source], { type })), anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function RichTextEngine({ label, source, format, readOnly = false, maxLength = NOTE_LIMIT, allowCreateAsset = false, contained = false, compact = false, onDirtyChange, onCommit }: RichTextEditorProps) {
  const assets = useContext(RichTextAssetsContext), theme = useContext(SemanticThemeContext);
  const overlayContainer = useOverlayContainer();
  const [portalRoot, setPortalRoot] = useState<HTMLElement>();
  const attachSurface = useCallback((node: HTMLDivElement | null) => { if (node) setPortalRoot(node.closest("dialog") ?? overlayContainer ?? document.body); }, [overlayContainer]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [editVersion, setEditVersion] = useState(0);
  const generation = useRef(0), inFlight = useRef(false);
  const markDirty = () => { generation.current++; setEditVersion(generation.current); setDirty(true); setError(""); };
  const editor = useCreateBlockNote({ schema, animations: false, links: { isValidLink: safeNoteLink, onClick: event => { event.preventDefault(); return true; } } });
  const [expanded, setExpanded] = useState(false), [sourceMode, setSourceMode] = useState(false), [raw, setRaw] = useState(source), [baseline, setBaseline] = useState(source), [dirty, setDirty] = useState(false), [ready, setReady] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const toolsVisible = toolsOpen;
  // Public ProseMirror bookmarks retain the exact text range when the view moves
  // between inline and dialog hosts; block-only selection snapshots lose offsets.
  const selection = useRef<ReturnType<typeof editor.prosemirrorState.selection.getBookmark> | null>(null);
  const present = (next: boolean) => { selection.current = editor.prosemirrorState.selection.getBookmark(); setExpanded(next); };
  useEffect(() => {
    if (!selection.current) return;
    const frame = requestAnimationFrame(() => {
      const bookmark = selection.current; selection.current = null;
      if (!bookmark || !editor.domElement) return;
      const view = editor.prosemirrorView;
      view.focus(); view.dispatch(view.state.tr.setSelection(bookmark.resolve(view.state.doc)));
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, editor]);
  const loading = useRef(false), sourceRef = useRef(source); sourceRef.current = source;
  const conflict = source !== baseline;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const serialize = () => format === "markdown" ? editor.blocksToMarkdownLossy() : JSON.stringify(richNoteSchema.parse({ version: 1, blocks: editor.document }), null, 2);
  const load = (value: string) => {
    loading.current = true;
    try {
      if (value.length > maxLength) throw new Error(`${label} exceeds its size limit`);
      const blocks = format === "markdown" ? editor.tryParseMarkdownToBlocks(value) : parseRichNote(value).blocks;
      editor.replaceBlocks(editor.document, blocks.length ? blocks as Parameters<typeof editor.replaceBlocks>[1] : [{ type: "paragraph", content: [] }]);
      setRaw(value); setReady(true); setDirty(false); setError(""); return true;
    } catch (error) { setError(String(error)); setRaw(value); setSourceMode(true); return false; }
    finally { loading.current = false; }
  };
  useEffect(() => { load(source); setBaseline(source); }, [editor, format]);
  // Quiet views follow external edits; a local draft is never overwritten.
  useEffect(() => { if (source !== baseline && !dirty) { load(source); setBaseline(source); } }, [source, dirty]);
  const save = async () => {
    if (inFlight.current || readOnly || !dirty) return;
    inFlight.current = true;
    const savedGeneration = generation.current;
    setSaving(true); setError("");
    try {
      if (sourceRef.current !== baseline) throw new Error("Saved source changed. Reload or copy your draft before saving.");
      const next = sourceMode ? raw : serialize();
      if (next.length > maxLength) throw new Error(`${label} exceeds its size limit`);
      if (format === "note") parseRichNote(next);
      await onCommit(next, baseline); setBaseline(next); if (generation.current === savedGeneration) setRaw(next); setDirty(generation.current !== savedGeneration);
    } catch (error) { setError(String(error)); } finally { inFlight.current = false; setSaving(false); }
  };
  // Debounce edits; serialize commits so a slow save cannot mark newer typing clean.
  const pendingSave = useRef(save); pendingSave.current = save;
  useEffect(() => {
    if (!dirty || readOnly || conflict || saving || error) return;
    const timer = setTimeout(() => void pendingSave.current(), 500);
    return () => clearTimeout(timer);
  }, [editVersion, dirty, readOnly, conflict, saving, error]);
  useEffect(() => {
    const flush = () => { void pendingSave.current(); };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, []);
  const surface = <div ref={attachSurface} className="station-rich-text flex min-h-0 flex-1 flex-col" data-native-overlay data-format={format} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (!readOnly) void save(); } }}>
    <div className="order-last flex shrink-0 items-center justify-end gap-2 px-3 py-1">
      <span role="status" className="text-[10px] text-fg-3">{saving || dirty && !error && !conflict ? "Saving..." : ""}</span>
      <Button size="sm" variant="ghost" aria-expanded={toolsVisible} onClick={() => setToolsOpen(value => !value)}>Text options</Button>
    </div>
    {toolsVisible && <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line p-2">
      <Button size="sm" variant="ghost" onClick={() => { if (sourceMode) { if (load(raw)) { markDirty(); setSourceMode(false); } } else { if (ready) setRaw(serialize()); setSourceMode(true); } }}>{sourceMode ? "Rich text" : "Source"}</Button>
      {!contained && <Button size="sm" variant="ghost" onMouseDown={event => event.preventDefault()} onClick={() => present(!expanded)}>{expanded ? "Compact" : "Expand editor"}</Button>}
    </div>}
    {conflict && <p role="status" className="p-2 text-xs text-fg-3">Saved source changed. Your draft is retained.</p>}
    {sourceMode ? <div className="min-h-48 flex-1 overflow-auto"><CodeInput label={`${label} source`} path={format === "note" ? "note.json" : "note.md"} value={raw} readOnly={readOnly} onChange={value => { setRaw(value); markDirty(); }} /></div> : <div className="min-h-40 flex-1 overflow-auto p-3"><BlockNoteView className="station-rich-text-view" portalElements={{ default: portalRoot }} editor={editor} editable={!readOnly} theme={theme.mode} formattingToolbar={!readOnly} linkToolbar={!readOnly} slashMenu={!readOnly} sideMenu={false} filePanel={false} tableHandles={false} comments={false} onChange={() => { if (!loading.current) { markDirty(); setNotice(""); } }} aria-label={label} /></div>}
    {toolsVisible && <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line p-2"><Button size="sm" variant="ghost" onClick={() => { load(source); setBaseline(source); }}>Reload saved source</Button><Button size="sm" variant="ghost" disabled={!ready || sourceMode} onClick={() => download(editor.blocksToMarkdownLossy(), "note.md", "text/markdown;charset=utf-8")}>Export Markdown</Button><Button size="sm" variant="ghost" disabled={!ready || sourceMode} onClick={() => download(editor.blocksToHTMLLossy(), "note.html", "text/html;charset=utf-8")}>Export HTML</Button>
      {allowCreateAsset && assets && !readOnly && <Button size="sm" variant="outline" disabled={!ready || sourceMode} onClick={() => { try { const id = assets.createMarkdown(`${label} copy`, editor.blocksToMarkdownLossy()); assets.open(id); setNotice("Created a Markdown asset; this field remains an inline value."); } catch (error) { setError(String(error)); } }}>Copy to Markdown asset</Button>}
    </div>}
    {toolsVisible && format === "markdown" && <p className="px-3 py-1 text-xs text-fg-3">Markdown keeps supported formatting. Rich note assets preserve the full document.</p>}
    {error && <p role="alert" className="px-3 py-2 text-xs text-danger">{error}</p>}{notice && <p role="status" className="px-3 py-1 text-xs text-fg-3">{notice}</p>}
  </div>;
  if (contained) return surface;
  return <><div className={expanded ? "hidden" : "flex min-h-0 flex-1 flex-col"}>{!expanded && surface}</div><Dialog open={expanded} onOpenChange={present}><DialogContent size="lg" className="rich-text-expanded h-[min(85dvh,800px)]"><DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader><DialogBody className="flex min-h-0 flex-1 flex-col">{expanded && surface}</DialogBody></DialogContent></Dialog></>;
}

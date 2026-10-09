/**
 * Component panel content; the dock owns placement and focus, while this view
 * delegates build and run operations to the existing composition providers.
 *
 * @example
 * <ComponentView asset={asset} workspaceId={workspace.id} onRestore={openRestoreDialog} />
 */
import { useEffect, useId, useRef, useState } from "react";
import { basicSetup, EditorView } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { Annotation, Prec, Transaction } from "@codemirror/state";
import { rust } from "@codemirror/lang-rust";
import { Code2, Package, Play, RotateCcw, ShieldCheck, Terminal } from "lucide-react";
import { Tabs, TabsList, TabsPanel, TabsPanels, TabsTab } from "@/components/ui/tabs";
import { AsyncButton } from "@/components/ui/async-button";
import { deps } from "./composition";
import { ComponentGrantSettings, ComponentRunApproval } from "@/components/workspace/component-permissions";
import { hasCurrentArtifact, type ComponentAsset } from "./model";
import { REQUIRED_GRANTS } from "./component-contract";
import type { RunResult } from "./component-runtime";

/** The editor keeps one view per file; edits update the workspace store immediately. */
const sourceSync = Annotation.define<boolean>();
function SourceEditor({ asset, path }: { asset: ComponentAsset; path: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const currentEditor = useRef<EditorView | null>(null);
  useEffect(() => {
    if (!holder.current) return;
    const editor = new EditorView({ doc: asset.files[path] ?? "", extensions: [
      basicSetup, Prec.highest(keymap.of([indentWithTab])), ...(path.endsWith(".rs") ? [rust()] : []),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => { if (update.docChanged && !update.transactions.some((transaction) => transaction.annotation(sourceSync))) deps.store.editFile(asset.id, path, update.state.doc.toString()); }),
    ], parent: holder.current });
    currentEditor.current = editor;
    return () => { currentEditor.current = null; editor.destroy(); };
  }, [asset.instanceId, path]);
  useEffect(() => {
    const editor = currentEditor.current, source = asset.files[path] ?? "";
    if (editor && editor.state.doc.toString() !== source) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source }, annotations: [sourceSync.of(true), Transaction.addToHistory.of(false)] });
  }, [asset.files[path], path, asset.instanceId]);
  return <div className="source-editor" ref={holder} />;
}

/** A focusable Component panel with local section state; split views remain independent. */
export function ComponentView({ asset, workspaceId, onRestore, runRequest }: { asset: ComponentAsset; workspaceId: string; onRestore: (assetId: string) => void; runRequest?: number }) {
  const inputId = useId();
  const [section, setSection] = useState("overview");
  useEffect(() => { if (runRequest !== undefined) setSection("run"); }, [runRequest]);
  const [file, setFile] = useState("src/lib.rs");
  const [input, setInput] = useState("World");
  const [run, setRun] = useState<{ busy: boolean; result?: RunResult; error?: string }>({ busy: false });
  const runController = useRef<AbortController | null>(null);
  useEffect(() => () => runController.current?.abort(), []);
  const [approval, setApproval] = useState<{ asset: ComponentAsset; input: string } | null>(null);
  useEffect(() => { runController.current?.abort(); runController.current = null; setRun({ busy: false }); setApproval(null); }, [asset.instanceId, asset.revision, asset.artifact?.sha256, workspaceId]);
  useEffect(() => { setApproval(null); }, [asset.grants]);
  const [buildError, setBuildError] = useState<string | null>(null);
  const current = hasCurrentArtifact(asset);
  const runnable = current;
  async function invoke(approved?: { asset: ComponentAsset; input: string; remember: boolean }) {
    if (!runnable || runController.current) return;
    if (!approved && REQUIRED_GRANTS.some(key => !asset.grants[key])) { setApproval({ asset, input }); return; }
    const controller = new AbortController();
    runController.current = controller;
    setApproval(null);
    setRun({ busy: true });
    try {
      const result = approved
        ? await deps.approveAndRun(approved.asset, approved.input, approved.remember, controller.signal)
        : await deps.runner.run(asset, input, new Set(REQUIRED_GRANTS), controller.signal);
      if (runController.current === controller) setRun({ busy: false, result });
    } catch (error) { if (runController.current === controller) setRun({ busy: false, error: error instanceof Error ? error.message : String(error) }); }
    finally { if (runController.current === controller) runController.current = null; }
  }
  async function build() {
    setBuildError(null);
    try { await deps.buildAsset(workspaceId, asset.id); }
    catch (error) { setBuildError(error instanceof Error ? error.message : String(error)); throw error; }
  }
  const paths = Object.keys(asset.files);
  return <div className="component-view">
    <div className="page-heading compact"><div><h1>{asset.name}</h1>{asset.description && asset.description !== "New Rust Component project" && <p>{asset.description}</p>}</div>
      <span className={`status large ${current ? "ready" : ""}`}>{current ? runnable ? "Runnable artifact" : "Built artifact" : asset.artifact ? "Artifact out of date" : "Source only"}</span>
    </div>
    <Tabs value={section} onValueChange={(value) => setSection(String(value))} variant="underline">
      <TabsList className="component-view-tabs"><TabsTab value="overview">Overview</TabsTab><TabsTab value="source" icon={<Code2 size={15} />}>Source</TabsTab><TabsTab value="artifact" icon={<Package size={15} />}>Artifact</TabsTab><TabsTab value="run" icon={<Play size={15} />}>Run</TabsTab></TabsList>
      <TabsPanels animateHeight={false}>
        <TabsPanel value="overview"><div className="component-overview">
          <div className="component-overview-summary"><span><strong>{paths.length}</strong> source files</span><span><strong>{Object.values(asset.grants).filter(Boolean).length}</strong> grants enabled</span></div>
          {!current && <p>Build the current source before running this Component.</p>}
        </div></TabsPanel>
        <TabsPanel value="source"><div className="component-view-section"><div className="section-title"><h2>Source project</h2>{asset.id === "greeting" && <button className="secondary" onClick={() => onRestore(asset.id)}><RotateCcw size={14} /> Restore sample</button>}</div>
          <div className="editor-layout"><aside className="file-tree"><div className="tree-heading">{asset.id}</div>{paths.map((path) => <button key={path} className={file === path ? "selected" : ""} onClick={() => setFile(path)}><Code2 size={14} />{path}</button>)}</aside>
            <div className="editor-pane"><div className="editor-title"><Code2 size={14} />{file}<span className="spacer" />{current ? "Matches artifact" : "Unbuilt changes"}</div><SourceEditor asset={asset} path={asset.files[file] === undefined ? paths[0] : file} /></div></div>
        </div></TabsPanel>
        <TabsPanel value="artifact"><div className="component-view-section"><div className="section-title"><h2>Build output</h2><span className={`status ${current ? "ready" : ""}`}>{current ? "Current" : "Build required"}</span></div>
          {asset.artifact && <div className="artifact-card"><div className="artifact-symbol"><Package size={27} /></div><div><strong>{asset.id}.wasm</strong><span>{asset.artifact.bytes.toLocaleString()} bytes · built by {asset.artifact.builtBy}</span><code>SHA-256 {asset.artifact.sha256}</code></div></div>}
          <AsyncButton onClick={build} pendingLabel="Building in Vercel Sandbox…" successLabel="Component built" errorLabel="Retry build" icon={<Package size={15} />}>Build Component</AsyncButton>
          {buildError && <pre className="error">{buildError}</pre>}
          {current && asset.artifact?.builtBy === "vercel-sandbox" && <a href={`/api/artifacts/${asset.artifact.sha256}.wasm`} download={`${asset.id}.wasm`}>Download verified Component</a>}
          {asset.artifact && <div className="fine-print">{Array.isArray(asset.artifact.imports) ? `P3 profile · ${asset.artifact.imports.length} inspected import interfaces · snapshot ${asset.artifact.snapshotId} · build ${asset.artifact.buildId}` : "Legacy artifact metadata · rebuild to verify this source"}</div>}
          <div className="note"><strong>Build boundary</strong><p>Sandbox output is bound to this source revision. A fixed Polyengine worker translates verified bytes at runtime and terminates after the invocation.</p></div>
        </div></TabsPanel>
        <TabsPanel value="run"><div className="component-view-section"><div className="run-grid"><section className="detail-card"><h2><ShieldCheck size={17} /> Capability grants</h2>
          <ComponentGrantSettings asset={asset} />
          <p className="fine-print">WASI filesystem preopens, environment, and network are disabled in the runtime shim.</p></section>
          <section className="detail-card"><h2><Terminal size={17} /> Invoke run</h2><label className="field-label" htmlFor={inputId}>Input string</label><input id={inputId} value={input} onChange={(event) => setInput(event.currentTarget.value)} /><button className="primary" disabled={!runnable || run.busy} onClick={() => void invoke()}><Play size={15} />{run.busy ? "Running…" : "Run Component"}</button>{run.busy && <button className="secondary" onClick={() => runController.current?.abort()}>Cancel run</button>}{!runnable && <p className="inline-warning">Build the current source to run this Component.</p>}</section></div>
          {(run.result || run.error) && <section className="result-card"><div className="section-title"><h2>Result</h2>{run.result && <span>{run.result.durationMs} ms</span>}</div>{run.error ? <pre className="error">{run.error}</pre> : <><pre>{run.result?.output}</pre><div className="plugin-surface"><div className="log-label">COMPONENT SURFACE · PLAIN TEXT</div><div>{run.result?.surfaceText || "(nothing drawn)"}</div></div><div className="log-label">HOST LOG</div><pre>{run.result?.logs.join("\n") || "(no messages)"}</pre>{run.result && <details className="fine-print"><summary>Run timings</summary><pre>{JSON.stringify(run.result.timings, null, 2)}</pre></details>}</>}</section>}
        </div></TabsPanel>
      </TabsPanels>
    </Tabs>
    <ComponentRunApproval asset={approval?.asset ?? asset} open={Boolean(approval)} onClose={() => setApproval(null)} onApprove={remember => { if (approval) void invoke({ ...approval, remember }); }} />
  </div>;
}

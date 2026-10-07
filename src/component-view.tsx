/**
 * Component panel content; the dock owns placement and focus, while this view
 * delegates build and run operations to the existing composition providers.
 *
 * @example
 * <ComponentView unit={unit} workspaceId={workspace.id} onRestore={openRestoreDialog} />
 */
import { useEffect, useRef, useState } from "react";
import { basicSetup, EditorView } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { rust } from "@codemirror/lang-rust";
import { Code2, Package, Play, RotateCcw, ShieldCheck, Terminal } from "lucide-react";
import { Tabs, TabsList, TabsPanel, TabsPanels, TabsTab } from "@/components/ui/tabs";
import { AsyncButton } from "@/components/ui/async-button";
import { deps } from "./composition";
import { HOST_CLOCK, HOST_FEED, HOST_LOG, HOST_SURFACE, hasCurrentArtifact, type ComponentUnit } from "./model";
import { REQUIRED_GRANTS } from "./component-contract";
import type { RunResult } from "./component-runtime";

/** The editor keeps one view per file; edits update the workspace store immediately. */
function SourceEditor({ unit, path }: { unit: ComponentUnit; path: string }) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!holder.current) return;
    const editor = new EditorView({ doc: unit.files[path] ?? "", extensions: [
      basicSetup, Prec.highest(keymap.of([indentWithTab])), ...(path.endsWith(".rs") ? [rust()] : []),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => { if (update.docChanged) deps.store.editFile(unit.id, path, update.state.doc.toString()); }),
    ], parent: holder.current });
    return () => editor.destroy();
  }, [unit.instanceId, path]);
  return <div className="source-editor" ref={holder} />;
}

/** A focusable Component panel with local section state; split views remain independent. */
export function ComponentView({ unit, workspaceId, onRestore, runRequest }: { unit: ComponentUnit; workspaceId: string; onRestore: (unitId: string) => void; runRequest?: number }) {
  const [section, setSection] = useState("overview");
  useEffect(() => { if (runRequest !== undefined) setSection("run"); }, [runRequest]);
  const [file, setFile] = useState("src/lib.rs");
  const [input, setInput] = useState("World");
  const [run, setRun] = useState<{ busy: boolean; result?: RunResult; error?: string }>({ busy: false });
  const runController = useRef<AbortController | null>(null);
  useEffect(() => () => runController.current?.abort(), []);
  const grantKey = REQUIRED_GRANTS.map((grant) => Boolean(unit.grants[grant])).join("");
  useEffect(() => { runController.current?.abort(); setRun({ busy: false }); }, [unit.instanceId, unit.revision, unit.artifact?.sha256, grantKey]);
  const [buildError, setBuildError] = useState<string | null>(null);
  const current = hasCurrentArtifact(unit);
  const runnable = current;
  async function invoke() {
    if (!runnable) return;
    const controller = new AbortController();
    runController.current = controller;
    setRun({ busy: true });
    try {
      const grants = new Set(Object.entries(unit.grants).filter(([, enabled]) => enabled).map(([name]) => name));
      setRun({ busy: false, result: await deps.runner.run(unit, input, grants, controller.signal) });
    } catch (error) { setRun({ busy: false, error: error instanceof Error ? error.message : String(error) }); }
    finally { if (runController.current === controller) runController.current = null; }
  }
  async function build() {
    setBuildError(null);
    try { await deps.buildUnit(workspaceId, unit.id); }
    catch (error) { setBuildError(error instanceof Error ? error.message : String(error)); throw error; }
  }
  const paths = Object.keys(unit.files);
  return <div className="component-view">
    <div className="page-heading compact"><div><h1>{unit.name}</h1>{unit.description && unit.description !== "New Rust Component project" && <p>{unit.description}</p>}</div>
      <span className={`status large ${current ? "ready" : ""}`}>{current ? runnable ? "Runnable artifact" : "Built artifact" : unit.artifact ? "Artifact out of date" : "Source only"}</span>
    </div>
    <Tabs value={section} onValueChange={(value) => setSection(String(value))} variant="underline">
      <TabsList className="component-view-tabs"><TabsTab value="overview">Overview</TabsTab><TabsTab value="source" icon={<Code2 size={15} />}>Source</TabsTab><TabsTab value="artifact" icon={<Package size={15} />}>Artifact</TabsTab><TabsTab value="run" icon={<Play size={15} />}>Run</TabsTab></TabsList>
      <TabsPanels animateHeight={false}>
        <TabsPanel value="overview"><div className="component-overview">
          <div className="component-overview-summary"><span><strong>{paths.length}</strong> source files</span><span><strong>{Object.values(unit.grants).filter(Boolean).length}</strong> grants enabled</span></div>
          {!current && <p>Build the current source before running this Component.</p>}
        </div></TabsPanel>
        <TabsPanel value="source"><div className="component-view-section"><div className="section-title"><h2>Source project</h2>{unit.id === "greeting" && <button className="secondary" onClick={() => onRestore(unit.id)}><RotateCcw size={14} /> Restore sample</button>}</div>
          <div className="editor-layout"><aside className="file-tree"><div className="tree-heading">{unit.id}</div>{paths.map((path) => <button key={path} className={file === path ? "selected" : ""} onClick={() => setFile(path)}><Code2 size={14} />{path}</button>)}</aside>
            <div className="editor-pane"><div className="editor-title"><Code2 size={14} />{file}<span className="spacer" />{current ? "Matches artifact" : "Unbuilt changes"}</div><SourceEditor unit={unit} path={unit.files[file] === undefined ? paths[0] : file} /></div></div>
        </div></TabsPanel>
        <TabsPanel value="artifact"><div className="component-view-section"><div className="section-title"><h2>Build output</h2><span className={`status ${current ? "ready" : ""}`}>{current ? "Current" : "Build required"}</span></div>
          {unit.artifact && <div className="artifact-card"><div className="artifact-symbol"><Package size={27} /></div><div><strong>{unit.id}.wasm</strong><span>{unit.artifact.bytes.toLocaleString()} bytes · built by {unit.artifact.builtBy}</span><code>SHA-256 {unit.artifact.sha256}</code></div></div>}
          <AsyncButton onClick={build} pendingLabel="Building in Vercel Sandbox…" successLabel="Component built" errorLabel="Retry build" icon={<Package size={15} />}>Build Component</AsyncButton>
          {buildError && <pre className="error">{buildError}</pre>}
          {current && unit.artifact?.builtBy === "vercel-sandbox" && <a href={`/api/artifacts/${unit.artifact.sha256}.wasm`} download={`${unit.id}.wasm`}>Download verified Component</a>}
          {unit.artifact && <div className="fine-print">{Array.isArray(unit.artifact.imports) ? `P3 profile · ${unit.artifact.imports.length} inspected import interfaces · snapshot ${unit.artifact.snapshotId} · build ${unit.artifact.buildId}` : "Legacy artifact metadata · rebuild to verify this source"}</div>}
          <div className="note"><strong>Build boundary</strong><p>Sandbox output is bound to this source revision. A fixed Polyengine worker translates verified bytes at runtime and terminates after the invocation.</p></div>
        </div></TabsPanel>
        <TabsPanel value="run"><div className="component-view-section"><div className="run-grid"><section className="detail-card"><h2><ShieldCheck size={17} /> Capability grants</h2>
          {[{ key: HOST_LOG, label: "Host logging", hint: "Append messages to the run log" }, { key: HOST_FEED, label: "Async input feed", hint: "Supply a future and stream" }, { key: HOST_SURFACE, label: "Text surface", hint: "Write plain text to a bounded surface" }, { key: HOST_CLOCK, label: "P3 monotonic clock", hint: "Read the monotonic clock" }].map(({ key, label, hint }) => <label key={key} className="grant-row"><span><strong>{label}</strong><small><code>{key}</code><br />{hint}</small></span><input type="checkbox" checked={Boolean(unit.grants[key])} onChange={(event) => deps.store.setGrant(unit.id, key, event.currentTarget.checked)} /></label>)}
          <p className="fine-print">WASI filesystem preopens, environment, and network are disabled in the runtime shim.</p></section>
          <section className="detail-card"><h2><Terminal size={17} /> Invoke run</h2><label className="field-label" htmlFor={`run-${unit.id}`}>Input string</label><input id={`run-${unit.id}`} value={input} onChange={(event) => setInput(event.currentTarget.value)} /><button className="primary" disabled={!runnable || run.busy} onClick={invoke}><Play size={15} />{run.busy ? "Running…" : "Run Component"}</button>{run.busy && <button className="secondary" onClick={() => runController.current?.abort()}>Cancel run</button>}{!runnable && <p className="inline-warning">Build the current source to run this Component.</p>}</section></div>
          {(run.result || run.error) && <section className="result-card"><div className="section-title"><h2>Result</h2>{run.result && <span>{run.result.durationMs} ms</span>}</div>{run.error ? <pre className="error">{run.error}</pre> : <><pre>{run.result?.output}</pre><div className="plugin-surface"><div className="log-label">COMPONENT SURFACE · PLAIN TEXT</div><div>{run.result?.surfaceText || "(nothing drawn)"}</div></div><div className="log-label">HOST LOG</div><pre>{run.result?.logs.join("\n") || "(no messages)"}</pre>{run.result && <details className="fine-print"><summary>Run timings</summary><pre>{JSON.stringify(run.result.timings, null, 2)}</pre></details>}</>}</section>}
        </div></TabsPanel>
      </TabsPanels>
    </Tabs>
  </div>;
}

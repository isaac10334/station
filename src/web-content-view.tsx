import { useEffect, useState } from "react";
import { Play, RotateCcw, ShieldCheck } from "lucide-react";
import { deps } from "./composition";
import type { WebContentUnit } from "./model";

/** The policy is parsed before authored markup. Inline code can build a widget but cannot fetch, embed, submit, or load remote assets. */
export const WEB_CONTENT_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";

export function webContentDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${WEB_CONTENT_CSP}"></head><body>${html}</body></html>`;
}

/** A preview reload is explicit so editing does not restart a running widget on every keystroke. */
export function WebContentView({ unit, onAddWidget }: { unit: WebContentUnit; onAddWidget: () => void }) {
  const [preview, setPreview] = useState(() => ({ html: unit.html, revision: unit.revision, instanceId: unit.instanceId, run: 0 }));
  useEffect(() => setPreview({ html: unit.html, revision: unit.revision, instanceId: unit.instanceId, run: 0 }), [unit.instanceId]);
  const changed = preview.revision !== unit.revision || preview.instanceId !== unit.instanceId;
  return <div className="web-content-view">
    <div className="page-heading compact"><div><h1>{unit.name}</h1><p>HTML, CSS, and JavaScript in a sandboxed iframe</p></div><span className="status large ready">Web content</span></div>
    <div className="web-content-toolbar"><span><ShieldCheck size={15} /> Opaque origin · restricted document · no host bridge</span><div className="web-content-toolbar-actions"><button className="secondary" onClick={onAddWidget}>Add to dashboard</button><button className="secondary" onClick={() => setPreview({ html: unit.html, revision: unit.revision, instanceId: unit.instanceId, run: preview.run + 1 })}>{changed ? <Play size={14} /> : <RotateCcw size={14} />}{changed ? "Run changes" : "Reload preview"}</button></div></div>
    <div className="web-content-split"><section className="web-content-source"><label htmlFor={`web-source-${unit.id}`}>index.html</label><textarea id={`web-source-${unit.id}`} spellCheck={false} value={unit.html} onChange={(event) => deps.store.editWebHtml(unit.id, event.currentTarget.value)} aria-label={`${unit.name} HTML source`} /></section>
      <section className="web-content-preview"><div className="web-content-preview-heading">Preview {changed && <span>Changes pending</span>}</div><iframe key={`${preview.instanceId}:${preview.run}`} title={`${unit.name} sandboxed preview`} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={webContentDocument(preview.html)} /></section></div>
    <p className="fine-print web-content-note">The preview document blocks resource requests, forms, and nested frames. Its opaque origin denies host storage and DOM access. Marketplace installation needs a separate distribution and review boundary.</p>
  </div>;
}

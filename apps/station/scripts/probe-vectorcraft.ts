/** Isolated integration investigation. Serve an unmodified upstream web release
 * with a small host page that exercises its public API. No Station session,
 * native bridge, workspace credentials or command grants are present here.
 *
 * bun apps/station/scripts/probe-vectorcraft.ts <unpacked-release-directory>
 */
import { resolve, relative, isAbsolute, sep } from "node:path";
const root = resolve(Bun.argv[2] ?? "outputs/vectorcraft-spike/vendor/vectorcraft-web-0.14.0");
if (!await Bun.file(resolve(root, "index.html")).exists()) throw new Error("Pass the directory of an unpacked official VectorCraft web release");
const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Station · VectorCraft adapter investigation</title>
<style>body{margin:0;background:#181818;color:#ededed;font:14px system-ui}header{padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}button{padding:8px 12px;background:#303030;color:inherit;border:1px solid #666;border-radius:6px}iframe{display:block;width:100%;height:72vh;border:0}pre{white-space:pre-wrap;padding:12px;margin:0;max-height:20vh;overflow:auto}</style>
<header><strong>VectorCraft · unmodified upstream web build</strong><button id="inspect">Inspect commands</button><button id="roundtrip">Import and export SVG</button><button id="draw">Draw through command API</button></header>
<iframe title="VectorCraft isolated application" src="/vendor/index.html" sandbox="allow-scripts allow-same-origin"></iframe><pre role="status" id="status">Waiting for VectorCraft. This separate origin has no Station session.</pre>
<script type="module">
const frame = document.querySelector('iframe'), status = document.querySelector('#status');
const show = value => { status.textContent = JSON.stringify(value, null, 2); };
const api = () => { const value = frame.contentWindow.vectorcraft; if (!value) throw Error('VectorCraft is still loading'); return value; };
const run = action => async () => { try { show(await action()); } catch(error) { show({error:String(error)}); } };
document.querySelector('#inspect').onclick = run(async () => { const app=api(); const commands=await app.commands(); return {inspection:await app.inspect(),commands}; });
document.querySelector('#roundtrip').onclick = run(async () => {
  const app=api();
  const source='<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect x="16" y="16" width="96" height="96" fill="#6366f1"/><circle cx="64" cy="64" r="24" fill="#ffffff"/></svg>';
  const queued=await app.openFile('station-probe.svg',new TextEncoder().encode(source));
  if (!queued) throw Error('File import was not queued');
  // OpenFile queues an upstream UI event. Await presented work before export.
  let document;
  for(let attempt=0;attempt<60;attempt++) { try { document=await app.request('document.inspect'); } catch { /* File import is queued before a document exists. */ } if(JSON.stringify(document??{}).includes('station-probe')) break; await new Promise(resolve=>setTimeout(resolve,100)); }
  if(!JSON.stringify(document??{}).includes('station-probe')) throw Error('Imported document did not become available');
  const exported=await app.request('app.export',{format:'svg'});
  const encoded=exported.dataBase64;
  if(typeof encoded!=='string') throw Error('Expected SVG export bytes');
  const svg=new TextDecoder().decode(Uint8Array.from(atob(encoded), c=>c.charCodeAt(0)));
  const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');
  if(parsed.querySelector('parsererror') || !parsed.querySelector('rect,path,circle')) throw Error('Invalid or empty SVG export');
  return {roundtrip:'passed',queued,document,bytes:exported.bytes,svg};
});
document.querySelector('#draw').onclick = run(async () => ({result:await api().execute('shape.rectangle',{x:24,y:24,width:48,height:32}),document:await api().request('document.inspect')}));
</script>`;
const server = Bun.serve({ hostname: "127.0.0.1", port: 3056, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/") return new Response(page, { headers: { "Content-Type": "text/html", "Cache-Control": "no-store" } });
  if (!path.startsWith("/vendor/")) return new Response("Not found", { status: 404 });
  const file = resolve(root, decodeURIComponent(path.slice(8)));
  const name = relative(root, file);
  if (name === ".." || name.startsWith(`..${sep}`) || isAbsolute(name)) return new Response("Not found", { status: 404 });
  const asset = Bun.file(file);
  if (!await asset.exists()) return new Response("Not found", { status: 404 });
  return new Response(asset, { headers: { "Cache-Control": "no-cache" } });
} });
console.log(`Isolated VectorCraft investigation: ${server.url}`);

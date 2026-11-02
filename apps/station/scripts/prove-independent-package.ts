/** Isolated acceptance host for a source-only external package. Uses the actual
 * package compiler/runtime/store and production Station renderer, never a live
 * workspace or installed desktop profile. No cloud/native authority is issued. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createComposition } from '../src/application';
import { importPackage } from '../src/core/package-assets';
import { createPackageRuntime } from '../src/services/package-runtime';
import { sha256 } from '../src/core/build-contract';

const [bundlePath, outputPath, portArgument = '3074'] = process.argv.slice(2);
if (!bundlePath || !outputPath) throw new Error('Usage: prove-independent-package <source-bundle.json> <output-directory> [port]');
const port = Number(portArgument);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || [3000, 43157, 43158, 43159].includes(port)) throw new Error('Use a separate isolated acceptance port');
const output = resolve(outputPath); await mkdir(output, { recursive: true });
const values: Record<string, string> = {};
const app = createComposition({ getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = value; } });
const bundleText = await readFile(resolve(bundlePath), 'utf8');
const imported = importPackage(bundleText, app.store.active().assets);
app.store.importAssets(imported);
const packageAsset = imported.find(asset => asset.kind === 'package');
const documentAsset = imported.find(asset => asset.kind === 'svg');
if (!packageAsset || !documentAsset) throw new Error('Proof requires a package and sample SVG asset');
const runtime = createPackageRuntime(app);
const installation = await runtime.prepareInstallation(app.store.active(), packageAsset.id);
const editor = installation.manifest.contributions.find(item => item.role === 'editor');
if (!editor || editor.capabilities.length !== 1 || editor.capabilities[0] !== 'station:editor/session') throw new Error('Only one opened-editor session grant is allowed in this proof');
installation.grants = { [editor.id]: ['station:editor/session'] };
app.store.installPackage(installation);
const opened = app.control.execute({ method: 'asset.open', params: { assetId: documentAsset.id, editorId: `${installation.id}/${editor.id}` } });
const build = installation.builds[editor.id];
if (!build || await sha256(new TextEncoder().encode(build.document)) !== build.documentHash) throw new Error('Prepared document identity mismatch');
await writeFile(join(output, 'editor.html'), build.document);
await writeFile(join(output, 'source.station.json'), bundleText);
const receipt = {
  version: 1, scope: 'isolated-browser-package-proof', sourceBundleSha256: await sha256(new TextEncoder().encode(bundleText)),
  sourceSha256: build.sourceHash, artifactSha256: build.documentHash, toolchain: build.toolchain,
  installationId: installation.id, documentAssetId: documentAsset.id, opened: opened.result,
  standalone: `http://127.0.0.1:${port}/standalone`, station: `http://127.0.0.1:${port}/`,
  note: 'Both hosts receive the same prepared editor document. Station adds its existing sandbox bootstrap/CSP. Test fixture grants only the opened sample document. No native or cloud acceptance.',
};
await writeFile(join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
await app.dispose();
const dist = resolve(import.meta.dir, '../dist');
let index = await readFile(join(dist, 'index.html'), 'utf8');
const seed = `<script>if(!localStorage.getItem('loop-package-proof-v1')){const fixture=${JSON.stringify(values).replace(/</g, '\\u003c')};for(const [key,value]of Object.entries(fixture))localStorage.setItem(key,value);localStorage.setItem('loop-package-proof-v1','1')}</script>`;
index = index.replace(/<head[^>]*>/i, match => match + seed);
const server = Bun.serve({ hostname: '127.0.0.1', port, development: false, fetch: async request => {
  const path = new URL(request.url).pathname;
  const headers = { 'Cache-Control': 'no-store' };
  if (path === '/') return new Response(index, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  if (path === '/standalone') return new Response(build.document, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  if (path === '/receipt') return Response.json(receipt, { headers });
  if (path === '/source.station.json') return new Response(bundleText, { headers: { ...headers, 'Content-Type': 'application/json' } });
  const filename = basename(path);
  if (path !== '/' + filename || !/^[a-zA-Z0-9_.-]+$/.test(filename)) return new Response('Not found', { status: 404 });
  const file = Bun.file(join(dist, filename));
  return await file.exists() ? new Response(file, { headers }) : new Response('Not found', { status: 404 });
} });
console.log(JSON.stringify({ ...receipt, url: server.url.toString(), output }));

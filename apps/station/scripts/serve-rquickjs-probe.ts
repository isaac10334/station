/** Serve only the isolated probe fixtures on loopback; never opens a Station profile. */
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
const [componentPath, workerPath] = process.argv.slice(2);
if (!componentPath || !workerPath) throw new Error("Pass the generated Component and browser bundle paths");
const require = createRequire(resolve("apps/station/package.json"));
const fixtures = new Map([
  ["/probe.wasm", Bun.file(componentPath)],
  ["/worker.js", Bun.file(workerPath)],
  ["/translator.wasm", Bun.file(join(dirname(require.resolve("@polyengine/translator/package.json")), "esm/translator_shim.wasm"))],
]);
const html = `<!doctype html><meta charset="utf-8"><title>Running P3 probe</title>
<h1>wasm-rquickjs / Polyengine P3 probe</h1><p id="status">Running in an isolated worker…</p><pre id="result"></pre>
<script>
const worker = new Worker('/worker.js', {type:'module'});
const watchdog = setTimeout(() => { worker.terminate(); document.querySelector('#status').textContent = 'FAIL: 60 second timeout'; }, 60000);
worker.onmessage = ({data}) => {
  clearTimeout(watchdog); worker.terminate();
  document.querySelector('#status').textContent = data.initialProbePassed ? 'PASS: initial compatibility probe' : 'FAIL: ' + data.phase;
  document.querySelector('#result').textContent = JSON.stringify({...data, imports: data.imports?.length + ' inspected import leaves'}, null, 2);
  document.title = data.initialProbePassed ? 'PASS P3 compatibility' : 'FAIL P3 compatibility';
};
worker.onerror = event => { clearTimeout(watchdog); worker.terminate(); document.querySelector('#status').textContent = 'FAIL: ' + event.message; };
</script>`;
const server = Bun.serve({ hostname: "127.0.0.1", port: 3021, fetch(request) {
  const path = new URL(request.url).pathname;
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  if (path === "/") return new Response(html, { headers: { "content-type": "text/html", "cache-control": "no-store" } });
  const file = fixtures.get(path);
  return file ? new Response(file, { headers: { "cache-control": "no-store", "content-type": path.endsWith(".js") ? "text/javascript" : "application/wasm" } }) : new Response("Not found", { status: 404 });
} });
console.log(`Isolated probe: ${server.url}`);

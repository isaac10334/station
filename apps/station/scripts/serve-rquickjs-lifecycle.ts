/** Fixed loopback fixtures, separate from Station's workspace/control servers. */
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
const [directory, workerPath, acceptancePath] = process.argv.slice(2);
if (!directory || !workerPath || !acceptancePath) throw new Error("Pass the Loop experiment directory, worker bundle, and acceptance bundle");
const require = createRequire(resolve("apps/station/package.json"));
const root = join(resolve(directory), "target/rquickjs-lifecycle");
const fixtures = new Map([
  ["/probe.wasm", { path: join(root, "target/wasm32-wasip2/release/probe.wasm"), type: "application/wasm" }],
  ["/manifest.json", { path: join(root, "proof-manifest.json"), type: "application/json" }],
  ["/translator.wasm", { path: join(dirname(require.resolve("@polyengine/translator/package.json")), "esm/translator_shim.wasm"), type: "application/wasm" }],
  ["/lifecycle-worker.js", { path: workerPath, type: "text/javascript" }],
  ["/acceptance.js", { path: acceptancePath, type: "text/javascript" }],
]);
const html = `<!doctype html><meta charset="utf-8"><title>Running P3 lifecycle</title><h1>wasm-rquickjs P3 lifecycle</h1><p id="status">Running isolated lifecycle acceptance…</p><pre id="result"></pre><script type="module" src="/acceptance.js"></script>`;
const server = Bun.serve({ hostname: "127.0.0.1", port: 3021, fetch(request) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const path = new URL(request.url).pathname;
  const headers = { "cache-control": "no-store", "content-security-policy": "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'" };
  if (path === "/") return new Response(html, { headers: { ...headers, "content-type": "text/html" } });
  const fixture = fixtures.get(path);
  return fixture ? new Response(Bun.file(fixture.path), { headers: { ...headers, "content-type": fixture.type } }) : new Response("Not found", { status: 404 });
} });
console.log(`Isolated lifecycle proof: ${server.url}`);

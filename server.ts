import app from "./index.html";
import { buildComponent, readArtifact } from "./component-build";
import { BuildFailure, validateSource } from "./src/build-contract";
import { join } from "node:path";

let buildInProgress = false;
let workerBundle: Promise<Uint8Array> | undefined;

function readWorkerBundle(): Promise<Uint8Array> {
  return workerBundle ??= (async () => {
    const result = await Bun.build({ entrypoints: [join(import.meta.dir, "src", "component-worker.ts")], target: "browser" });
    if (!result.success || result.outputs.length !== 1) throw new Error("Component worker build failed.");
    return new Uint8Array(await result.outputs[0].arrayBuffer());
  })().catch((error) => { workerBundle = undefined; throw error; });
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  development: process.env.NODE_ENV !== "production",
  routes: { "/": app },
  async fetch(request) {
    const path = new URL(request.url).pathname;
    // Opaque sandbox documents send Origin: null and cross-site Fetch Metadata.
    // All API routes are private to the app origin, including read-only artifacts.
    if (path.startsWith("/api/")) {
      const origin = new URL(request.url).origin;
      const suppliedOrigin = request.headers.get("origin");
      const site = request.headers.get("sec-fetch-site");
      if ((suppliedOrigin && suppliedOrigin !== origin) || (site && site !== "same-origin") ||
          (request.method !== "GET" && suppliedOrigin !== origin))
        return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (path === "/api/component/build" && request.method === "POST") {
      if (buildInProgress) return Response.json({ error: "A Component build is already running." }, { status: 409 });
      if (Number(request.headers.get("content-length")) > 256_000)
        return Response.json({ error: "Source exceeds 256 KB." }, { status: 413 });
      buildInProgress = true;
      try {
        const source = validateSource(await request.json());
        const { metadata } = await buildComponent(source);
        return Response.json({ artifact: metadata }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        const status = error instanceof BuildFailure ? error.status : error instanceof SyntaxError ? 400 : 500;
        const message = error instanceof BuildFailure ? error.message : error instanceof SyntaxError ? "Malformed build request." : "Sandbox build failed. Check server logs.";
        if (status === 500) console.error(error);
        return Response.json({ error: message }, { status });
      } finally { buildInProgress = false; }
    }
    const artifact = path.match(/^\/api\/artifacts\/([a-f0-9]{64})\.wasm$/);
    if (artifact && request.method === "GET") {
      const bytes = await readArtifact(artifact[1]);
      return bytes
        ? new Response(bytes as BodyInit, { headers: { "Content-Type": "application/wasm", "Cache-Control": "private, immutable" } })
        : new Response("Artifact not found", { status: 404 });
    }
    const manifest = path.match(/^\/api\/artifacts\/([a-f0-9]{64})-([0-9a-f-]{36})\.json$/);
    if (manifest && request.method === "GET") {
      const bytes = await readArtifact(manifest[1]);
      if (!bytes) return new Response("Artifact not found", { status: 404 });
      const file = Bun.file(new URL(`./.artifacts/${manifest[1]}-${manifest[2]}.json`, import.meta.url));
      if (!(await file.exists())) return new Response("Manifest not found", { status: 404 });
      return new Response(file, {
        headers: { "Content-Type": "application/json", "Cache-Control": "private, immutable" },
      });
    }
    if (path === "/api/component/worker.js" && request.method === "GET") {
      try {
        return new Response(await readWorkerBundle() as BodyInit, { headers: {
          "Content-Type": "text/javascript", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'",
        } });
      } catch (error) {
        console.error(error);
        return new Response("Component worker unavailable", { status: 500 });
      }
    }
    if (path === "/api/component/translator.wasm" && request.method === "GET")
      return new Response(Bun.file(new URL("./node_modules/@polyengine/translator/esm/translator_shim.wasm", import.meta.url)), {
        headers: { "Content-Type": "application/wasm", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
      });
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Station: ${server.url}`);

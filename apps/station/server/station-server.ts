import { buildComponent, readArtifact } from "./component-build";
import { BuildFailure, validateSource } from "../src/core/build-contract";
import { join } from "node:path";

/** Files supplied by the web checkout or the installed desktop package. */
export interface StationServerPaths {
  artifactDir: string;
  sandboxConfig: string;
  translator: string;
  worker?: string;
  scriptingDir?: string;
}

/** Creates an app-origin-only API handler; no desktop authority is exposed to guests. */
export function createStationApi(paths: StationServerPaths, appToken?: string) {
  let buildInProgress = false;
  let workerBundle: Promise<Uint8Array> | undefined;
  let lifetime = new AbortController();
  let closed = false;
  const pending = new Set<Promise<unknown>>();

  function readWorkerBundle(): Promise<Uint8Array> {
    if (paths.worker) return Bun.file(paths.worker).bytes();
    return (workerBundle ??= (async () => {
      const result = await Bun.build({
        entrypoints: [
          join(import.meta.dir, "../src/providers/component-worker.ts"),
        ],
        target: "browser",
      });
      if (!result.success || result.outputs.length !== 1)
        throw new Error("Component worker build failed.");
      return new Uint8Array(await result.outputs[0].arrayBuffer());
    })().catch((error) => {
      workerBundle = undefined;
      throw error;
    }));
  }

  const handle = async (request: Request): Promise<Response> => {
    const signal = lifetime.signal;
    if (signal.aborted)
      return new Response("Station is shutting down", { status: 503 });
    const path = new URL(request.url).pathname;
    if (path === "/api/account/config") return Response.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } });
    // Opaque sandbox documents send Origin: null and cross-site Fetch Metadata.
    // All API routes are private to the app origin, including read-only artifacts.
    if (path.startsWith("/api/")) {
      const origin = new URL(request.url).origin;
      const suppliedOrigin = request.headers.get("origin");
      const site = request.headers.get("sec-fetch-site");
      if (
        (suppliedOrigin && suppliedOrigin !== origin) ||
        (site && site !== "same-origin") ||
        (request.method !== "GET" && suppliedOrigin !== origin)
      )
        return new Response("Forbidden", {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        });
    }
    if (path === "/api/component/build" && request.method === "POST") {
      if (appToken && request.headers.get("x-station-app") !== appToken) return new Response("Root renderer credential required", { status: 403 });
      if (buildInProgress)
        return Response.json(
          { error: "A Component build is already running." },
          { status: 409 },
        );
      if (Number(request.headers.get("content-length")) > 256_000)
        return Response.json(
          { error: "Source exceeds 256 KB." },
          { status: 413 },
        );
      buildInProgress = true;
      try {
        const source = validateSource(await request.json());
        const build = buildComponent(source, paths, signal);
        pending.add(build);
        let metadata;
        try {
          ({ metadata } = await build);
        } finally {
          pending.delete(build);
        }
        return Response.json(
          { artifact: metadata },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        const status =
          error instanceof BuildFailure
            ? error.status
            : error instanceof SyntaxError
              ? 400
              : 500;
        const message =
          error instanceof BuildFailure
            ? error.message
            : error instanceof SyntaxError
              ? "Malformed build request."
              : "Sandbox build failed. Check server logs.";
        if (status === 500) console.error(error);
        return Response.json({ error: message }, { status });
      } finally {
        buildInProgress = false;
      }
    }
    const artifact = path.match(/^\/api\/artifacts\/([a-f0-9]{64})\.wasm$/);
    if (artifact && request.method === "GET") {
      const bytes = await readArtifact(artifact[1], paths.artifactDir);
      return bytes
        ? new Response(bytes as BodyInit, {
            headers: {
              "Content-Type": "application/wasm",
              "Cache-Control": "private, immutable",
            },
          })
        : new Response("Artifact not found", { status: 404 });
    }
    const manifest = path.match(
      /^\/api\/artifacts\/([a-f0-9]{64})-([0-9a-f-]{36})\.json$/,
    );
    if (manifest && request.method === "GET") {
      const bytes = await readArtifact(manifest[1], paths.artifactDir);
      if (!bytes) return new Response("Artifact not found", { status: 404 });
      const file = Bun.file(
        join(paths.artifactDir, `${manifest[1]}-${manifest[2]}.json`),
      );
      if (!(await file.exists()))
        return new Response("Manifest not found", { status: 404 });
      return new Response(file, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, immutable",
        },
      });
    }
    if (path === "/api/component/worker.js" && request.method === "GET") {
      try {
        return new Response((await readWorkerBundle()) as BodyInit, {
          headers: {
            "Content-Type": "text/javascript",
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy":
              "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'",
          },
        });
      } catch (error) {
        console.error(error);
        return new Response("Component worker unavailable", { status: 500 });
      }
    }
    if (["/api/scripting/engine.wasm", "/api/scripting/manifest.json","/api/scripting/portable-ui.json"].includes(path) && request.method === "GET") {
      const file = Bun.file(join(paths.scriptingDir ?? join(import.meta.dir,"../.runtime/scripting"), path.endsWith(".wasm") ? "engine.wasm" : path.endsWith('portable-ui.json')?'portable-ui.json':"manifest.json"));
      if (!await file.exists()) return new Response("Scripting engine unavailable; run prepare:scripting",{status:503});
      return new Response(file,{headers:{"Content-Type":path.endsWith(".wasm")?"application/wasm":"application/json","Cache-Control":"no-store"}});
    }
    if (path === "/api/component/translator.wasm" && request.method === "GET")
      return new Response(Bun.file(paths.translator), {
        headers: {
          "Content-Type": "application/wasm",
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });
    return new Response("Not found", { status: 404 });
  };
  /** Reject new work, cancel active Sandbox work, and wait for its cleanup. */
  return Object.assign(handle, {
    async cancelPending() {
      const previous = lifetime;
      previous.abort();
      await Promise.allSettled([...pending]);
      if (!closed && lifetime === previous) lifetime = new AbortController();
    },
    dispose() {
      closed = true;
      lifetime.abort();
      return Promise.allSettled([...pending]);
    },
  });
}

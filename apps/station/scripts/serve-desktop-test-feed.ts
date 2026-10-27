import { resolve, join } from "node:path";

/** Local immutable packaged A/B feed. Creating .offline simulates a network/server
 * failure without changing machine networking or publishing a public release.
 * Example: bun apps/station/scripts/serve-desktop-test-feed.ts .desktop-test/feed
 */
const directory = resolve(process.argv[2] ?? ".desktop-test/feed");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 49158,
  async fetch(request) {
    if (request.method !== "GET")
      return new Response("Method not allowed", { status: 405 });
    if (await Bun.file(join(directory, ".offline")).exists())
      return new Response("Test feed offline", { status: 503 });
    const name = new URL(request.url).pathname.slice(1);
    if (!/^[a-zA-Z0-9.-]+\.(json|zst|patch)$/.test(name))
      return new Response("Not found", { status: 404 });
    const file = Bun.file(join(directory, name));
    if (!(await file.exists()))
      return new Response("Not found", { status: 404 });
    return new Response(file, { headers: { "Cache-Control": "no-store" } });
  },
});
console.log(`Isolated Station update feed: ${server.url} from ${directory}`);

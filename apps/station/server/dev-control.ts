import { randomBytes } from "node:crypto";

/** Opt-in development relay. The renderer retains its existing store/persistence;
 * this server forwards typed domain commands, never JavaScript or DOM evaluation.
 * CLI authority and per-renderer polling authority use different random secrets.
 */
export function createDevControlRelay() {
  const token = randomBytes(32).toString("hex");
  type Client = { token: string; seen: number; snapshot: unknown; jobs: { id: string; request: unknown; expiresAt: number }[] };
  const clients = new Map<string, Client>();
  const pending = new Map<string, { clientId: string; resolve: (value: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const bearer = (request: Request) => request.headers.get("authorization")?.replace(/^Bearer /, "");
  return {
    token,
    async fetch(request: Request) {
      const url = new URL(request.url), route = url.pathname.replace("/api/dev-control", "");
      if (Number(request.headers.get("content-length") ?? 0) > 131072) return reply({ error: "Request too large" }, 413);
      // Never accept browser authority from a foreign site, opaque guest frame or network host.
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return reply({ error: "Foreign origin" }, 403);
      if (route === "/connect" && request.method === "GET") {
        if (request.headers.get("sec-fetch-site") !== "same-origin") return reply({ error: "Same-origin renderer required" }, 403);
        for (const [id, client] of clients) if (Date.now() - client.seen > 30000) clients.delete(id);
        if (clients.size >= 16) return reply({ error: "Too many dev renderer sessions" }, 429);
        const id = crypto.randomUUID(), clientToken = randomBytes(32).toString("hex");
        clients.set(id, { token: clientToken, seen: Date.now(), jobs: [], snapshot: null });
        return reply({ id, token: clientToken });
      }
      if (route === "/poll" && request.method === "POST") {
        const body = await request.json() as { id: string; replies?: { id: string; response: unknown }[]; snapshot?: unknown };
        const client = clients.get(body.id);
        if (!client || bearer(request) !== client.token) return reply({ error: "Renderer denied" }, 403);
        client.seen = Date.now();
        if (body.snapshot) client.snapshot = body.snapshot;
        for (const result of (body.replies ?? []).slice(0, 32)) {
          const item = pending.get(result.id);
          if (item?.clientId !== body.id) continue;
          clearTimeout(item.timer); pending.delete(result.id); item.resolve(result.response);
        }
        const jobs = client.jobs.splice(0).filter(item => item.expiresAt > Date.now());
        return reply({ jobs });
      }
      if (bearer(request) !== token) return reply({ error: "Control denied" }, 403);
      if (route === "/sessions" && request.method === "GET") return reply({ sessions: [...clients].filter(([, client]) => Date.now() - client.seen < 5000).map(([id, client]) => ({ id, snapshot: client.snapshot })) });
      if (route === "/execute" && request.method === "POST") {
        const body = await request.json() as { sessionId?: string; request: unknown };
        const available = [...clients].filter(([, client]) => Date.now() - client.seen < 5000);
        const selected = body.sessionId ? available.find(([id]) => id === body.sessionId) : available.length === 1 ? available[0] : undefined;
        if (!selected) return reply({ error: "Choose one live renderer session explicitly with --session" }, 409);
        if (pending.size >= 32) return reply({ error: "Command queue is full" }, 429);
        const [clientId, client] = selected, id = crypto.randomUUID();
        return reply(await new Promise(resolve => {
          const timer = setTimeout(() => { pending.delete(id); client.jobs = client.jobs.filter(job => job.id !== id); resolve({ ok: false, error: "Renderer command timed out; inspect before retrying" }); }, 5000);
          pending.set(id, { clientId, resolve, timer });
          client.jobs.push({ id, request: body.request, expiresAt: Date.now() + 4500 });
        }));
      }
      return reply({ error: "Unknown control route" }, 404);
    },
    dispose() { for (const item of pending.values()) { clearTimeout(item.timer); item.resolve({ ok: false, error: "Control relay stopped" }); } pending.clear(); clients.clear(); },
  };
}

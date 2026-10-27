import { z } from "zod";
import { accountOperations, type AccountMethod, type AccountSnapshot } from "../../src/contracts/account";
import type { MachineStore } from "./database";
import type { AccountAuth } from "./auth";

class AccountError extends Error { constructor(public status: number, message: string) { super(message); } }
type Listener = { userId: string; sessionId: string; send: (event: unknown) => void; close: () => void };

/** Single-process realtime provider. Events are ephemeral hints: clients refetch
 * authorized state after reconnect. Multi-replica deployments need a shared bus.
 * Retained streams recheck database sessions every five seconds and on events.
 */
export function createAccountService(auth: AccountAuth, machines: MachineStore, origin: string) {
  const listeners = new Set<Listener>();
  const recentSignals = new Map<string, number>();
  const commandRates = new Map<string, { since: number; count: number }>();
  const envelope = z.object({ method: z.enum(Object.keys(accountOperations) as [AccountMethod, ...AccountMethod[]]), params: z.unknown() }).strict();
  const notify = (userId: string) => { for (const l of listeners) if (l.userId === userId) l.send({ type: "changed" }); };
  const authenticate = async (headers: Headers) => {
    const identity = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
    if (!identity) throw new AccountError(401, "Sign in to manage connected sessions");
    return identity;
  };
  async function snapshot(headers: Headers): Promise<AccountSnapshot> {
    const { user, session } = await authenticate(headers);
    const sessions = await auth.api.listSessions({ headers });
    const observed = await machines.list(user.id);
    return {
      user: { id: user.id, name: user.name, email: user.email },
      sessions: sessions.map(s => {
        const m = observed.find(o => o.sessionId === s.id);
        const ua = s.userAgent ?? "";
        const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
        const platform = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Unknown platform";
        return { id: s.id, current: s.id === session.id, machineId: m?.machineId ?? null,
          name: m?.name ?? "Unlabelled browser", createdAt: s.createdAt.toISOString(), expiresAt: s.expiresAt.toISOString(),
          browser, platform, connections: m?.connections ?? [], lastSeen: m?.lastSeen ?? null, online: Boolean(m && Date.now() - m.lastSeen < 45_000) };
      }),
    };
  }
  /** Shared authenticated command entry point for HTTP, tests and future adapters.
   * No caller-provided user ID, permission flag or owner-dispatch fallback exists.
   * Cancellation is checked before effects; committed revocation cannot be undone.
   */
  async function execute(headers: Headers, input: unknown, signal: AbortSignal) {
    signal.throwIfAborted();
    const command = envelope.parse(input);
    const definition = accountOperations[command.method];
    const params = definition.input.parse(command.params);
    const { user, session } = await authenticate(headers);
    signal.throwIfAborted();
    if (commandRates.size > 10_000) {
      for (const [id, rate] of commandRates) if (Date.now() - rate.since > 60_000) commandRates.delete(id);
      if (commandRates.size > 10_000) throw new AccountError(503, "Account service busy");
    }
    const rate = commandRates.get(session.id);
    if (!rate || Date.now() - rate.since > 60_000) commandRates.set(session.id, { since: Date.now(), count: 1 });
    else if (++rate.count > 120) throw new AccountError(429, "Too many account commands; retry in a minute");
    let result: unknown;
    switch (command.method) {
      case "account.inspect": result = await snapshot(headers); break;
      case "account.heartbeat": {
        const p = accountOperations["account.heartbeat"].input.parse(params);
        await machines.observe({ ...p, userId: user.id, sessionId: session.id, lastSeen: Date.now() });
        notify(user.id); result = { ok: true }; break;
      }
      case "account.revoke": {
        const { sessionId } = accountOperations["account.revoke"].input.parse(params);
        const sessions = await auth.api.listSessions({ headers });
        const target = sessions.find(s => s.id === sessionId);
        signal.throwIfAborted();
        if (target) await auth.api.revokeSession({ headers, body: { token: target.token } });
        // Unknown and foreign targets have the same idempotent result.
        for (const l of listeners) if (l.userId === user.id && l.sessionId === sessionId) { l.send({ type: "revoked" }); l.close(); }
        notify(user.id); result = { ok: true }; break;
      }
      case "account.ping": {
        const { sessionId } = accountOperations["account.ping"].input.parse(params);
        const view = await snapshot(headers);
        if (!view.sessions.some(s => s.id === sessionId)) throw new AccountError(404, "Session unavailable");
        if (Date.now() - (recentSignals.get(session.id) ?? 0) < 1000) throw new AccountError(429, "Wait a moment before sending another ping");
        if (recentSignals.size > 10_000) recentSignals.clear();
        recentSignals.set(session.id, Date.now());
        signal.throwIfAborted();
        let delivered = false;
        for (const l of listeners) if (l.userId === user.id && l.sessionId === sessionId) {
          l.send({ type: "ping", from: view.sessions.find(s => s.current)?.name ?? "Another session" }); delivered = true;
        }
        result = { delivered }; break;
      }
    }
    return definition.output.parse(result);
  }
  async function events(request: Request) {
    const identity = await authenticate(request.headers);
    if ([...listeners].filter(l => l.userId === identity.user.id).length >= 12) throw new AccountError(429, "Too many realtime connections");
    let stop = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let checking = false;
        const encoder = new TextEncoder();
        const send = (event: unknown) => { if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); };
        const listener: Listener = { userId: identity.user.id, sessionId: identity.session.id, send, close: () => stop() };
        const timer = setInterval(async () => {
          if (closed || checking) return;
          checking = true;
          try { await authenticate(request.headers); send({ type: "changed" }); }
          catch (error) {
            // A database outage is a reconnect, not evidence of revocation.
            if (error instanceof AccountError && error.status === 401) send({ type: "revoked" });
            stop();
          }
          finally { checking = false; }
        }, 5000);
        stop = () => { if (closed) return; closed = true; clearInterval(timer); listeners.delete(listener); request.signal.removeEventListener("abort", stop); try { controller.close(); } catch { /* Consumer cancellation already closed the stream. */ } };
        listeners.add(listener);
        request.signal.addEventListener("abort", stop, { once: true });
        send({ type: "changed" });
        if (request.signal.aborted) stop();
      },
      cancel() { stop(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  }
  return {
    execute,
    async fetch(request: Request): Promise<Response> {
      try {
        const path = new URL(request.url).pathname;
        const supplied = request.headers.get("origin");
        const site = request.headers.get("sec-fetch-site");
        if ((supplied && supplied !== origin) || (site && site !== "same-origin") || (request.method !== "GET" && supplied !== origin)) throw new AccountError(403, "Same-origin request required");
        if (path === "/api/account/events" && request.method === "GET") return await events(request);
        if (path === "/api/account/commands" && request.method === "GET") {
          await authenticate(request.headers);
          return Response.json(Object.entries(accountOperations).map(([method, d]) => ({ method, effects: d.effects, input: z.toJSONSchema(d.input), output: z.toJSONSchema(d.output) })), { headers: { "Cache-Control": "no-store" } });
        }
        if (path === "/api/account/command" && request.method === "POST") {
          const body = await request.text();
          if (body.length > 4096) throw new AccountError(413, "Command too large");
          return Response.json(await execute(request.headers, JSON.parse(body), request.signal), { headers: { "Cache-Control": "no-store" } });
        }
        return new Response("Not found", { status: 404 });
      } catch (error) {
        const status = error instanceof AccountError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500;
        return Response.json({ error: status === 500 ? "Account service unavailable" : error instanceof Error ? error.message : "Request failed" }, { status, headers: { "Cache-Control": "no-store" } });
      }
    },
    close() { for (const l of [...listeners]) l.close(); recentSignals.clear(); commandRates.clear(); },
  };
}

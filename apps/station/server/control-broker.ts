/** Private loopback transport broker. Owns credentials and routing, never a second
 * workspace store. Only the authenticated root renderer can pair a task. Caller
 * names are display claims, not executable attestation. Root cleanup revokes that
 * renderer; broker restart revokes every connection.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z, requestSchema } from "@station/protocol";
import { saveCredential } from "./control-credentials";
import { join } from "node:path";
const secret = () => randomBytes(32).toString("hex");
const equal = (a: string | null | undefined, b: string) =>
  !!a &&
  a.length === b.length &&
  timingSafeEqual(new TextEncoder().encode(a), new TextEncoder().encode(b));
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export function createControlBroker(
  ownerToken: string,
  expectedOrigin?: string,
  credentialDirectory?: string,
) {
  const instanceId = crypto.randomUUID();
  type Renderer = {
    id: string;
    epoch: string;
    workspaceId: string;
    seen: number;
  };
  const renderers = new Map<string, Renderer>();
  const pairing = new Map<
    string,
    { taskId: string; expiresAt: number; rendererId: string }
  >();
  const clients = new Map<
    string,
    { taskId: string; name: string; expiresAt: number; rendererId: string }
  >();
  const pending = new Map<
    string,
    {
      rendererId: string;
      resolve: (body: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let queue: {
    id: string;
    taskId: string;
    rendererId: string;
    request: unknown;
    expiresAt: number;
  }[] = [];
  function removeRenderer(id: string) {
    renderers.delete(id);
    for (const [key, value] of pairing)
      if (value.rendererId === id) pairing.delete(key);
    for (const [key, value] of clients)
      if (value.rendererId === id) clients.delete(key);
    queue = queue.filter((job) => job.rendererId !== id);
    for (const [key, value] of pending)
      if (value.rendererId === id) {
        clearTimeout(value.timer);
        pending.delete(key);
        value.resolve({
          ok: false,
          error: { code: "session_ended", message: "Renderer session ended" },
        });
      }
  }
  function reset() {
    renderers.clear();
    pairing.clear();
    clients.clear();
    queue = [];
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.resolve({
        ok: false,
        error: { code: "session_ended", message: "Renderer session ended" },
      });
    }
    pending.clear();
  }
  return {
    instanceId,
    dispose: reset,
    async fetch(request: Request) {
      try {
        for (const [id, value] of renderers)
          if (Date.now() - value.seen > 30000) removeRenderer(id);
        for (const [key, value] of pairing)
          if (value.expiresAt <= Date.now()) pairing.delete(key);
        for (const [key, value] of clients)
          if (value.expiresAt <= Date.now()) clients.delete(key);
        const url = new URL(request.url),
          origin = expectedOrigin ?? url.origin;
        if (
          url.origin !== origin ||
          request.headers.get("host") !== new URL(origin).host
        )
          return reply({ error: "Invalid host" }, 403);
        const suppliedOrigin = request.headers.get("origin");
        if (
          (suppliedOrigin && suppliedOrigin !== origin) ||
          (request.headers.get("sec-fetch-site") &&
            request.headers.get("sec-fetch-site") !== "same-origin")
        )
          return reply({ error: "Foreign origin" }, 403);
        if (request.method !== "GET" && request.method !== "POST")
          return reply({ error: "Method unavailable" }, 405);
        const route = url.pathname.replace("/api/control", "");
        if (route === "/discover" && request.method === "GET") {
          const sessions = [...renderers.values()]
            .filter((renderer) => Date.now() - renderer.seen < 10000)
            .map(({ id, epoch }) => ({
              rendererId: id,
              epoch,
              connected: true,
            }));
          return reply({
            instanceId,
            origin,
            rendererId: sessions.length === 1 ? sessions[0]!.rendererId : null,
            epoch: sessions.length === 1 ? sessions[0]!.epoch : null,
            connected: sessions.length > 0,
            sessions,
          });
        }
        const raw = request.method === "POST" ? await request.text() : "{}";
        if (new TextEncoder().encode(raw).length > 1200000)
          return reply({ error: "Request too large" }, 413);
        const body = JSON.parse(raw);
        const root =
          equal(request.headers.get("x-station-control"), ownerToken) &&
          request.headers.get("sec-fetch-site") === "same-origin" &&
          (request.method !== "POST" || suppliedOrigin === origin);
        // Each root tab supplies the renderer returned by registration. Missing or
        // ambiguous routing fails closed; another tab can never drain its queue.
        let renderer = renderers.get(
          request.headers.get("x-station-renderer") ?? "",
        );
        if (route.startsWith("/owner/")) {
          if (!root) return reply({ error: "Owner renderer required" }, 403);
          if (route === "/owner/register") {
            const input = z
              .object({
                epoch: z.string().uuid(),
                workspaceId: z.string().min(1).max(200),
              })
              .strict()
              .parse(body);
            if (renderer && renderer.epoch !== input.epoch)
              removeRenderer(renderer.id);
            renderer = [...renderers.values()].find(
              (value) => value.epoch === input.epoch,
            );
            if (!renderer) {
              if (renderers.size >= 16)
                return reply({ error: "Renderer limit reached" }, 429);
              renderer = {
                ...input,
                id: crypto.randomUUID(),
                seen: Date.now(),
              };
              renderers.set(renderer.id, renderer);
            }
            renderer.seen = Date.now();
            return reply({ instanceId, rendererId: renderer.id });
          }
          if (!renderer)
            return reply({ error: "Explicit renderer required" }, 409);
          if (route === "/owner/unregister") {
            removeRenderer(renderer.id);
            return reply({ ok: true });
          }
          if (route === "/owner/pair") {
            const input = z
              .object({
                taskId: z.string().uuid(),
                expiresAt: z.number().finite(),
              })
              .strict()
              .parse(body);
            if (pairing.size >= 32 || clients.size >= 32)
              return reply({ error: "Connection limit reached" }, 429);
            const code = secret();
            pairing.set(code, {
              taskId: input.taskId,
              rendererId: renderer.id,
              expiresAt: Math.min(input.expiresAt, Date.now() + 60000),
            });
            return reply({
              code,
              expiresAt: Date.now() + 60000,
              instanceId,
              rendererId: renderer.id,
            });
          }
          if (route === "/owner/revoke") {
            const taskId = z.string().uuid().parse(body.taskId);
            for (const [key, c] of clients)
              if (c.taskId === taskId && c.rendererId === renderer.id)
                clients.delete(key);
            for (const [key, c] of pairing)
              if (c.taskId === taskId && c.rendererId === renderer.id)
                pairing.delete(key);
            return reply({ ok: true });
          }
          if (route === "/owner/renew") {
            const taskId = z.string().uuid().parse(body.taskId);
            for (const c of clients.values())
              if (c.taskId === taskId && c.rendererId === renderer.id)
                c.expiresAt = Date.now() + 3600000;
            return reply({ ok: true });
          }
          if (route === "/owner/export") {
            if (!credentialDirectory)
              return reply({ error: "Credential storage unavailable" }, 503);
            const code = z.string().length(64).parse(body.code),
              pair = pairing.get(code);
            if (pair?.rendererId !== renderer.id)
              return reply({ error: "Pairing renderer mismatch" }, 403);
            pairing.delete(code);
            if (!pair || pair.expiresAt <= Date.now())
              return reply({ error: "Create a fresh pairing code" }, 403);
            const credential = secret(),
              expiresAt = Date.now() + 3600000;
            clients.set(credential, {
              taskId: pair.taskId,
              name: "CLI (saved by owner)",
              expiresAt,
              rendererId: renderer.id,
            });
            try {
              const credentialFile = await saveCredential(
                join(credentialDirectory, instanceId, crypto.randomUUID()),
                {
                  url: origin,
                  instanceId,
                  rendererId: renderer.id,
                  epoch: renderer.epoch,
                  taskId: pair.taskId,
                  credential,
                  expiresAt,
                },
              );
              return reply({ credentialFile });
            } catch (error) {
              clients.delete(credential);
              throw error;
            }
          }
          if (route === "/owner/poll") {
            renderer.seen = Date.now();
            for (const result of z
              .array(
                z
                  .object({ id: z.string().uuid(), response: z.json() })
                  .strict(),
              )
              .max(32)
              .parse(body.replies ?? [])) {
              const item = pending.get(result.id);
              if (item?.rendererId === renderer.id) {
                clearTimeout(item.timer);
                pending.delete(result.id);
                item.resolve(result.response);
              }
            }
            const targetId = renderer.id;
            const jobs = queue.filter(
              (j) => j.rendererId === targetId && j.expiresAt > Date.now(),
            );
            queue = queue.filter(
              (j) => j.rendererId !== targetId && j.expiresAt > Date.now(),
            );
            return reply({ jobs });
          }
          return reply({ error: "Unknown owner route" }, 404);
        }
        if (route === "/pair" && request.method === "POST") {
          const input = z
            .object({
              code: z.string().length(64),
              name: z.string().min(1).max(120),
            })
            .strict()
            .parse(body);
          const pair = pairing.get(input.code);
          renderer = pair ? renderers.get(pair.rendererId) : undefined;
          pairing.delete(input.code);
          if (!pair || pair.expiresAt <= Date.now() || !renderer)
            return reply({ error: "Pairing code unavailable or expired" }, 403);
          const credential = secret(),
            expiresAt = Date.now() + 3600000;
          clients.set(credential, {
            taskId: pair.taskId,
            name: input.name,
            expiresAt,
            rendererId: renderer.id,
          });
          return reply({
            url: origin,
            instanceId,
            rendererId: renderer.id,
            epoch: renderer.epoch,
            taskId: pair.taskId,
            credential,
            expiresAt,
          });
        }
        const credential = request.headers
            .get("authorization")
            ?.replace(/^Bearer /, ""),
          client = credential ? clients.get(credential) : undefined;
        renderer = client ? renderers.get(client.rendererId) : undefined;
        if (
          !client ||
          client.expiresAt <= Date.now() ||
          !renderer ||
          client.rendererId !== renderer.id
        )
          return reply({ error: "Agent credential required" }, 403);
        if (route === "/execute" && request.method === "POST") {
          const input = z
            .object({
              instanceId: z.string().uuid(),
              rendererId: z.string().uuid(),
              request: requestSchema,
            })
            .strict()
            .parse(body);
          if (
            input.instanceId !== instanceId ||
            input.rendererId !== renderer.id
          )
            return reply({ error: "Explicit target session mismatch" }, 409);
          if (Date.now() - renderer.seen > 10000)
            return reply(
              { error: "Renderer unavailable; no headless fallback" },
              503,
            );
          if (pending.size >= 32)
            return reply({ error: "Command queue full" }, 429);
          const id = crypto.randomUUID();
          return reply(
            await new Promise((resolve) => {
              const timer = setTimeout(() => {
                pending.delete(id);
                queue = queue.filter((j) => j.id !== id);
                resolve({
                  ok: false,
                  error: {
                    code: "timeout",
                    message:
                      "Outcome uncertain; inspect operation/state before retrying with the same request identity",
                  },
                });
              }, 5000);
              pending.set(id, { rendererId: renderer!.id, resolve, timer });
              queue.push({
                id,
                taskId: client.taskId,
                rendererId: renderer!.id,
                request: input.request,
                expiresAt: Date.now() + 4500,
              });
            }),
          );
        }
        return reply({ error: "Unknown control route" }, 404);
      } catch (error) {
        return reply(
          {
            error:
              error instanceof z.ZodError
                ? "Invalid request"
                : "Control request failed",
          },
          400,
        );
      }
    },
  };
}

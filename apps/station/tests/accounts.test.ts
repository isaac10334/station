import { afterAll, beforeAll, expect, test } from "bun:test";
import { createAccountBackend } from "../server/accounts/backend";

const origin = "http://127.0.0.1:3197";
let backend: Awaited<ReturnType<typeof createAccountBackend>>;
beforeAll(async () => { backend = await createAccountBackend({ origin, secret: "test-only-" + crypto.randomUUID() + crypto.randomUUID(), database: ":memory:" }); });
afterAll(async () => { await backend.close(); });
const headers = (cookie = "") => ({ origin, cookie, "content-type": "application/json", "user-agent": "Station integration test" });
async function auth(path: string, body: unknown, cookie = "") {
  const response = await backend.fetch(new Request(origin + "/api/auth/" + path, { method: "POST", headers: headers(cookie), body: JSON.stringify(body) }));
  return { response, cookie: response.headers.getSetCookie().map(c => c.split(";")[0]).join("; "), body: await response.json() };
}
async function command(cookie: string, method: string, params: unknown = {}) {
  const response = await backend.fetch(new Request(origin + "/api/account/command", { method: "POST", headers: headers(cookie), body: JSON.stringify({ method, params }) }));
  return { response, body: await response.json() };
}
test("real Better Auth sessions, machine observations, private commands and remote revocation", async () => {
  const password = "An isolated test password 42!";
  const first = await auth("sign-up/email", { name: "Alice", email: "alice@example.test", password });
  expect(first.response.status).toBe(200);
  expect(first.cookie).toContain("station.session_token");
  const second = await auth("sign-in/email", { email: "alice@example.test", password });
  expect(second.response.status).toBe(200);
  const stranger = await auth("sign-up/email", { name: "Bob", email: "bob@example.test", password });
  expect(stranger.response.status).toBe(200);
  const machineId = crypto.randomUUID();
  expect((await command(first.cookie, "account.heartbeat", { machineId, name: "Laptop" })).response.status).toBe(200);
  const rendererId = crypto.randomUUID();
  await command(first.cookie, "account.heartbeat", { machineId, name: "Laptop", rendererId, clientType: "web" });
  await command(first.cookie, "account.heartbeat", { machineId, name: "Laptop", rendererId: crypto.randomUUID(), clientType: "web" });
  const view = await command(first.cookie, "account.inspect");
  expect(view.body.user.email).toBe("alice@example.test");
  expect(view.body.sessions).toHaveLength(2);
  expect(view.body.sessions.find((s: any) => s.current)).toMatchObject({ machineId, name: "Laptop", online: true });
  expect(view.body.sessions.find((s: any) => s.current).connections).toHaveLength(2);
  expect(JSON.stringify(view.body)).not.toContain("token");
  const remote = view.body.sessions.find((s: any) => !s.current);
  expect((await command(stranger.cookie, "account.ping", { sessionId: remote.id })).response.status).toBe(404);
  await command(stranger.cookie, "account.revoke", { sessionId: remote.id });
  expect((await command(second.cookie, "account.inspect")).response.status).toBe(200);
  expect((await command("", "account.inspect")).response.status).toBe(401);
  expect((await command(first.cookie, "account.heartbeat", { machineId, name: "Laptop", userId: "forged" })).response.status).toBe(400);
  const crossSite = await backend.fetch(new Request(origin + "/api/account/command", { method: "POST", headers: { ...headers(first.cookie), origin: "https://evil.example" }, body: JSON.stringify({ method: "account.revoke", params: { sessionId: remote.id } }) }));
  expect(crossSite.status).toBe(403);
  const aborted = new AbortController(); aborted.abort();
  const cancelled = await backend.fetch(new Request(origin + "/api/account/command", { method: "POST", headers: headers(first.cookie), body: JSON.stringify({ method: "account.revoke", params: { sessionId: remote.id } }), signal: aborted.signal }));
  expect(cancelled.status).not.toBe(200);
  expect((await command(second.cookie, "account.inspect")).response.status).toBe(200);
  await command(first.cookie, "account.revoke", { sessionId: remote.id });
  expect((await command(second.cookie, "account.inspect")).response.status).toBe(401);
  expect((await command(first.cookie, "account.inspect")).body.sessions).toHaveLength(1);
  const discovery = await backend.fetch(new Request(origin + "/api/account/commands", { headers: headers(first.cookie) }));
  expect((await discovery.json()).map((d: any) => d.method)).toContain("account.revoke");
  await auth("sign-out", {}, first.cookie);
  expect((await command(first.cookie, "account.inspect")).response.status).toBe(401);
});

test("two real sessions receive pings and a revoked stream closes", async () => {
  const password = "A different test password 42!";
  const first = await auth("sign-up/email", { name: "Carol", email: "carol@example.test", password });
  expect(first.response.status).toBe(200);
  const second = await auth("sign-in/email", { email: "carol@example.test", password });
  const view = (await command(first.cookie, "account.inspect")).body;
  const remote = view.sessions.find((s: any) => !s.current);
  const response = await backend.fetch(new Request(origin + "/api/account/events", { headers: headers(second.cookie) }));
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("changed");
  expect((await command(first.cookie, "account.ping", { sessionId: remote.id })).body.delivered).toBe(true);
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"ping"');
  await command(first.cookie, "account.revoke", { sessionId: remote.id });
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"revoked"');
  expect((await reader.read()).done).toBe(true);
  const reconnect = await backend.fetch(new Request(origin + "/api/account/events", { headers: headers(first.cookie) }));
  const disconnect = reconnect.body!.getReader();
  await disconnect.read();
  await disconnect.cancel();
});

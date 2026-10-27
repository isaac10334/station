import { expect, test } from "bun:test";
import { createControlBroker } from "../server/control-broker";

test("paired tabs keep separate jobs, replies and revocation; discovery never chooses an ambiguous renderer", async () => {
  const origin = "http://127.0.0.1:3012",
    broker = createControlBroker("owner", origin);
  const owner = (path: string, rendererId: string, body: unknown = {}) =>
    broker.fetch(
      new Request(`${origin}/api/control/owner/${path}`, {
        method: "POST",
        headers: {
          host: "127.0.0.1:3012",
          origin,
          "sec-fetch-site": "same-origin",
          "x-station-control": "owner",
          "x-station-renderer": rendererId,
        },
        body: JSON.stringify(body),
      }),
    );
  const post = (path: string, body: unknown, token = "") =>
    broker.fetch(
      new Request(`${origin}/api/control/${path}`, {
        method: "POST",
        headers: { host: "127.0.0.1:3012", authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    );
  try {
    const first = await (
      await owner("register", "", {
        epoch: crypto.randomUUID(),
        workspaceId: "private-one",
      })
    ).json();
    const second = await (
      await owner("register", "", {
        epoch: crypto.randomUUID(),
        workspaceId: "private-two",
      })
    ).json();
    const discovery = await (
      await broker.fetch(
        new Request(`${origin}/api/control/discover`, {
          headers: { host: "127.0.0.1:3012" },
        }),
      )
    ).json();
    expect(discovery.rendererId).toBeNull();
    expect(discovery.sessions).toHaveLength(2);
    expect(JSON.stringify(discovery)).not.toContain("private-");
    expect((await owner("poll", "")).status).toBe(409);
    const taskId = crypto.randomUUID();
    const pair = await (
      await owner("pair", first.rendererId, {
        taskId,
        expiresAt: Date.now() + 60000,
      })
    ).json();
    // Another renderer cannot consume the first tab's one-use export code.
    expect(
      (await owner("export", second.rendererId, { code: pair.code })).status,
    ).toBeGreaterThanOrEqual(400);
    const client = await (
      await post("pair", { code: pair.code, name: "test" })
    ).json();
    const execution = post(
      "execute",
      {
        instanceId: first.instanceId,
        rendererId: first.rendererId,
        request: { method: "state.inspect" },
      },
      client.credential,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      (await (await owner("poll", second.rendererId)).json()).jobs,
    ).toEqual([]);
    const jobs = (await (await owner("poll", first.rendererId)).json()).jobs;
    expect(jobs).toHaveLength(1);
    await owner("poll", second.rendererId, {
      replies: [{ id: jobs[0].id, response: { stolen: true } }],
    });
    await owner("poll", first.rendererId, {
      replies: [{ id: jobs[0].id, response: { ok: true, exact: "first" } }],
    });
    expect(await (await execution).json()).toEqual({
      ok: true,
      exact: "first",
    });
    await owner("unregister", second.rendererId);
    const next = await (
      await owner("pair", first.rendererId, {
        taskId,
        expiresAt: Date.now() + 60000,
      })
    ).json();
    expect(
      (await post("pair", { code: next.code, name: "still first" })).status,
    ).toBe(200);
    await owner("unregister", first.rendererId);
    expect((await post("execute", {}, client.credential)).status).toBe(403);
  } finally {
    broker.dispose();
  }
});

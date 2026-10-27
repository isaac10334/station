import { expect, test } from "bun:test";
import { createStore } from "../src/features/workspace/application/store";
import { createStationControl } from "../src/features/commands/application/runtime";
import { taskScopeSchema } from "@station/protocol";
import { createControlBroker } from "../server/control-broker";
import { validateSource } from "../src/core/build-contract";
const setup = (ports = {}) => {
  const values = new Map<string, string>();
  const store = createStore({
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      values.set(k, v);
    },
  });
  return { store, control: createStationControl(store, ports) };
};
const scope = (overrides = {}) =>
  taskScopeSchema.parse({
    operations: [
      "state.inspect",
      "assets.list",
      "asset.read",
      "asset.metadata.read",
      "asset.metadata",
      "asset.create",
      "asset.files.patch",
      "asset.fork",
      "web.build",
    ],
    create: true,
    ...overrides,
  });
test("Component creation/fork keeps buildable Cargo identity without inherited grants", () => {
  const { control, store } = setup();
  try {
    const c = control.issueTask({
      name: "Components",
      workspaceId: store.active().id,
      scope: scope(),
    });
    const made = control.executeFor(c, {
      method: "asset.create",
      version: control.version(),
      params: { name: "Authored Component", kind: "component" },
    }).result;
    const fork = control.executeFor(c, {
      method: "asset.fork",
      version: control.version(),
      params: { assetId: made.id, name: "Forked Component" },
    }).result;
    const source = control.executeFor(c, {
      method: "asset.read",
      params: { assetId: fork.id },
    }).result;
    expect(() =>
      validateSource({
        id: source.id,
        revision: source.revision,
        files: source.files,
      }),
    ).not.toThrow();
    const asset = store.active().assets.find((a) => a.id === fork.id)!;
    expect(asset.kind === "component" && asset.artifact).toBe(null);
    expect(
      asset.kind === "component" && Object.values(asset.grants).some(Boolean),
    ).toBe(false);
  } finally {
    control.dispose();
  }
});
test("contexts cannot be forged; resource reads/writes, epoch and creation are enforced", () => {
  const { control, store } = setup();
  try {
    const context = control.issueTask({
      name: "Test",
      workspaceId: store.active().id,
      scope: scope(),
    });
    const call = (method: string, params = {}, extra = {}) =>
      control.executeFor(context, { method, params, ...extra });
    expect(() =>
      control.executeFor({ ...context }, { method: "state.inspect" }),
    ).toThrow("Host-created");
    expect(() => call("asset.read", { assetId: "greeting" })).toThrow(
      "outside",
    );
    expect(call("assets.list").result).toEqual([]);
    expect(() =>
      call("asset.create", { kind: "web-content", name: "No precondition" }),
    ).toThrow("epoch/revision");
    const made = call(
      "asset.create",
      { kind: "web-content", name: "Owned" },
      { version: control.version(), requestId: "creation" },
    );
    const id = made.result.id;
    expect(
      call("asset.read", { assetId: id }).result.files["index.html"],
    ).toBeString();
    expect(() =>
      call(
        "asset.files.patch",
        { assetId: id, expectedAssetRevision: 0, patch: { "../bad": "x" } },
        { version: control.version() },
      ),
    ).toThrow("path");
    const before = control.version();
    call(
      "asset.files.patch",
      {
        assetId: id,
        expectedAssetRevision: 0,
        patch: { "index.html": "changed", "style.css": "body{}" },
      },
      { version: before },
    );
    expect(store.active().assets.find((a) => a.id === id)?.revision).toBe(1);
    expect(() =>
      call(
        "asset.metadata",
        { assetId: id, patch: { name: "stale" } },
        { version: before },
      ),
    ).toThrow("Stale");
    expect(() => call("permissions.decide", { approved: true })).toThrow(
      "Unknown",
    );
    expect(() =>
      control.executeFor(context, {
        method: "state.inspect",
        principalId: "owner",
      }),
    ).toThrow();
    control.revoke(context.taskId);
    expect(() => call("asset.read", { assetId: id })).toThrow("revoked");
  } finally {
    control.dispose();
  }
});
test("deduplication prevents duplicate mutations, including retries after the version changed", () => {
  const { control, store } = setup();
  try {
    const c = control.issueTask({
      name: "Test",
      workspaceId: store.active().id,
      scope: scope(),
    });
    const request = {
      method: "asset.create",
      version: control.version(),
      requestId: "same",
      params: { name: "Once", kind: "web-content" },
    };
    const one = control.executeFor(c, request);
    expect(control.executeFor(c, request)).toEqual(one);
    expect(store.active().assets.filter((a) => a.name === "Once")).toHaveLength(
      1,
    );
    expect(() =>
      control.executeFor(c, {
        ...request,
        params: { ...request.params, name: "Other" },
      }),
    ).toThrow("reused");
  } finally {
    control.dispose();
  }
});
test("revocation and cancellation discard asynchronous results, availability never falls back", async () => {
  let resolve!: (value: unknown) => void;
  const { control, store } = setup({
    buildWeb: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  try {
    const c = control.issueTask({
      name: "Test",
      workspaceId: store.active().id,
      scope: scope({ readableAssets: ["greeting"] }),
    });
    const op = control.executeFor(c, {
      method: "web.build",
      params: { assetId: "greeting" },
      version: control.version(),
    }).result;
    control.revoke(c.taskId);
    resolve({ secret: "late result" });
    await new Promise((r) => setTimeout(r, 0));
    const status = control.execute({
      method: "operations.inspect",
      params: { operationId: op.operationId },
    }).result;
    expect(status.status).toBe("cancelled");
    expect(status.result).toBeUndefined();
    expect(() =>
      control.execute({
        method: "component.build",
        params: { assetId: "greeting" },
      }),
    ).toThrow("unavailable");
  } finally {
    control.dispose();
  }
});
test("broker pairs once, rejects origin/host spoofing, binds explicit session and drops credentials on reload", async () => {
  const origin = "http://127.0.0.1:3012",
    broker = createControlBroker("owner-secret", origin);
  let rendererId = "";
  const owner = (path: string, body: unknown) =>
    broker.fetch(
      new Request(`${origin}/api/control/owner/${path}`, {
        method: "POST",
        headers: {
          host: "127.0.0.1:3012",
          origin,
          "sec-fetch-site": "same-origin",
          "x-station-control": "owner-secret",
          "x-station-renderer": rendererId,
        },
        body: JSON.stringify(body),
      }),
    );
  const post = (path: string, body: unknown, token = "") =>
    broker.fetch(
      new Request(`${origin}/api/control/${path}`, {
        method: "POST",
        headers: { host: "127.0.0.1:3012", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      }),
    );
  try {
    expect((await post("execute", {})).status).toBe(403);
    const registered = await (
      await owner("register", {
        epoch: crypto.randomUUID(),
        workspaceId: "test",
      })
    ).json();
    rendererId = registered.rendererId;
    const pair = await (
      await owner("pair", {
        taskId: crypto.randomUUID(),
        expiresAt: Date.now() + 3600000,
      })
    ).json();
    const client = await (
      await post("pair", { code: pair.code, name: "claimed Codex" })
    ).json();
    expect(
      (await post("pair", { code: pair.code, name: "again" })).status,
    ).toBe(403);
    const headers = {
      host: "evil.test",
      origin: "http://evil.test",
      Authorization: `Bearer ${client.credential}`,
    };
    expect(
      (
        await broker.fetch(
          new Request(`${origin}/api/control/discover`, { headers }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          "execute",
          {
            instanceId: registered.instanceId,
            rendererId: crypto.randomUUID(),
            request: { method: "state.inspect" },
          },
          client.credential,
        )
      ).status,
    ).toBe(409);
    const pending = post(
      "execute",
      {
        instanceId: registered.instanceId,
        rendererId: registered.rendererId,
        request: { method: "state.inspect" },
      },
      client.credential,
    );
    await new Promise((r) => setTimeout(r, 0));
    const poll = await (await owner("poll", {})).json();
    expect(poll.jobs).toHaveLength(1);
    expect(poll.jobs[0].taskId).toBe(client.taskId);
    await owner("poll", {
      replies: [{ id: poll.jobs[0].id, response: { ok: true } }],
    });
    expect(await (await pending).json()).toEqual({ ok: true });
    await owner("unregister", {});
    await owner("register", {
      epoch: crypto.randomUUID(),
      workspaceId: "test",
    });
    expect((await post("execute", {}, client.credential)).status).toBe(403);
  } finally {
    broker.dispose();
  }
});

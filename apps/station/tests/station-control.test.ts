import { expect, test } from "bun:test";
import { createStore } from "../src/features/workspace/application/store";
import { createStationControl } from "../src/features/commands/application/runtime";
import { createDevControlRelay } from "../server/dev-control";

test("agent commands use real state, validated metadata, layout history and correlated revisions", () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
  const store = createStore(storage), control = createStationControl(store);
  const events: unknown[] = []; control.subscribe(event => events.push(event));
  const asset = structuredClone(store.active().assets[0]);
  control.execute({ method: "asset.metadata", params: { assetId: asset.id, patch: { name: "New title", description: "Editable metadata" } }, expectedRevision: 0 });
  expect(store.active().assets[0]).toEqual({ ...asset, name: "New title", description: "Editable metadata",metadataRevision:1 });
  expect(createStore(storage).active().assets[0].name).toBe("New title");
  expect(events.filter((event: any) => event.type === "state.changed")).toHaveLength(1);
  expect(() => control.execute({ method: "asset.metadata", expectedRevision: 0, params: { assetId: asset.id, patch: { name: "Stale" } } })).toThrow("Stale");
  expect(() => control.execute({ method: "asset.metadata", params: { assetId: asset.id, patch: { name: " " } } })).toThrow("required");
  expect(() => control.execute({ method: "asset.metadata", params: { assetId: "builtin:clock", patch: { name: "Spoof" } } })).toThrow("read-only");
  expect(() => control.execute({ method: "dock.apply", params: { type: "createWidget", widget: "clock", target: { surface: "dashboard", intent: "append" }, injected: true } })).toThrow();
  control.execute({ method: "dock.apply", params: { type: "createWidget", widget: "clock", id: "agent-clock", target: { surface: "dashboard", intent: "append" } } });
  expect(store.active().dock.panels["agent-clock"]).toBeDefined();
  control.execute({ method: "layout.undo" }); expect(store.active().dock.panels["agent-clock"]).toBeUndefined();
  control.execute({ method: "layout.redo" }); expect(store.active().dock.panels["agent-clock"]).toBeDefined();
  expect(JSON.stringify(control.inspect())).not.toContain("Cargo.toml");
  control.dispose(); expect(() => control.execute({ method: "state.inspect" })).toThrow("disposed");
});

test("live control relay separates same-origin renderer authority from CLI authority", async () => {
  const relay = createDevControlRelay(), base = "http://127.0.0.1:3011/api/dev-control";
  const denied = await relay.fetch(new Request(`${base}/connect`, { headers: { "Sec-Fetch-Site": "cross-site" } }));
  expect(denied.status).toBe(403);
  expect((await relay.fetch(new Request(`${base}/sessions`))).status).toBe(403);
  const client = await (await relay.fetch(new Request(`${base}/connect`, { headers: { "Sec-Fetch-Site": "same-origin" } }))).json();
  expect((await relay.fetch(new Request(`${base}/sessions`, { headers: { Authorization: `Bearer ${client.token}` } }))).status).toBe(403);
  const execution = relay.fetch(new Request(`${base}/execute`, { method: "POST", headers: { Authorization: `Bearer ${relay.token}` }, body: JSON.stringify({ sessionId: client.id, request: { method: "state.inspect" } }) }));
  // fetch() reads JSON asynchronously before adding the command to its bounded queue.
  await new Promise(resolve => setTimeout(resolve, 0));
  const poll = (body: unknown) => relay.fetch(new Request(`${base}/poll`, { method: "POST", headers: { Authorization: `Bearer ${client.token}` }, body: JSON.stringify({ id: client.id, ...body as object }) }));
  const jobs = await (await poll({})).json(); expect(jobs.jobs).toHaveLength(1);
  await poll({ replies: [{ id: jobs.jobs[0].id, response: { ok: true, revision: 4 } }] });
  expect(await (await execution).json()).toEqual({ ok: true, revision: 4 });
  relay.dispose();
});

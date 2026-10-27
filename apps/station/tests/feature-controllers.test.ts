import { describe, expect, test } from "bun:test";
import { createHost } from "@loop-kit/host";
import { defineCapability } from "@loop-kit/capabilities";
import { createScopedBinding } from "../src/features/runtime/application/binding";
import { loopClock } from "@station/capabilities";
import { createConversation } from "../src/features/ai/application/conversation";
import { createAISettings } from "../src/features/ai/application/settings";
import { createClockController } from "../src/features/clock/application/controller";
import { createNavigationHistory } from "../src/features/navigation/application/history";
import { createCommandClient, type CommandPort } from "../src/features/commands/application/client";
import { aiConversation } from "../src/contracts/ai-conversation";
import type { ChatPorts } from "../src/features/ai/contracts/chat";
import type { AIConversation } from "../src/contracts/ai-conversation";
import { grantedWidgetScope } from "../src/services/widget-grants";
import { createStore } from "../src/features/workspace/application/store";
import { projectEditorDocument } from "../src/features/assets/application/editor-document";
import { workspaceSearchItems } from "../src/features/navigation/domain/search";
import { createOverlayActions } from "../src/features/shell/application/overlays";
const storage = () => { const values = new Map<string,string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));

async function chatFixture(run: AIConversation["run"]) {
  const host = createHost();
  const registration = host.provide(aiConversation, { create: () => ({ run }) });
  const settings = createAISettings(storage()); settings.save({ ...settings.get(), apiKey: "test-key" });
  const taskListeners = new Set<() => void>();
  let valid = true, review: ((draft: { name: string; html: string }) => Promise<boolean>) | undefined;
  const ports: ChatPorts = {
    settings,
    catalog: { cached: () => ({ models: [], source: "offline", fetchedAt: 0 }), load: async () => ({ models: [], source: "offline", fetchedAt: 0 }) },
    openScope: () => grantedWidgetScope(host.scope(), [aiConversation.id]),
    tasks: { list: () => [], check: () => { if (!valid) throw new Error("Revoked"); }, subscribe: fn => { taskListeners.add(fn); return () => { taskListeners.delete(fn); }; } },
    tools: request => { review = request.review; return {}; },
  };
  const chat = createConversation(ports, "workspace", "instance"); chat.start(); chat.setGrants([aiConversation.id]);
  return { chat, host, registration, settings, taskListeners, review: (draft: {name:string;html:string}) => review!(draft), revokeTask: () => { valid = false; taskListeners.forEach(fn => fn()); },
    async dispose() { chat.dispose(); await host.dispose(); } };
}
describe("headless chat ownership", () => {
  test("streams inert text, keeps bounded progress and ignores late callbacks after stop", async () => {
    let delta!: (text: string) => void, finish!: () => void;
    const f = await chatFixture(async (_messages, _tools, _signal, text, progress) => {
      delta = text; text("Hello");
      for (let n = 0; n < 25; n++) progress?.({ id: String(n), name: "read", state: "running" });
      await new Promise<void>(resolve => { finish = resolve; });
      text("late"); return [];
    });
    try {
      const pending = f.chat.send("Question");
      while (!finish) await tick();
      expect(f.chat.get().messages[1]!.text).toBe("Hello");
      expect(f.chat.get().messages[1]!.tools).toHaveLength(20);
      f.chat.stop(); delta("ignored"); finish(); await pending;
      expect(f.chat.get().messages[1]!.text).toBe("Hello");
      expect(f.chat.get().messages[1]!.status).toBe("stopped");
      expect(f.chat.get().busy).toBe(false);
    } finally { await f.dispose(); }
  });
  test("pending review settles false on disposal; no subscriptions survive", async () => {
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let release!: () => void;
    const f = await chatFixture(async () => { started(); await new Promise<void>(resolve => { release = resolve; }); return []; });
    try {
      const pending = f.chat.send("Draft"); await ready;
      const review = f.review({ name: "Draft", html: "<p>inert</p>" });
      expect(f.chat.get().proposal?.name).toBe("Draft");
      expect(await f.review({ name: "second", html: "" })).toBe(false);
      f.chat.dispose(); expect(await review).toBe(false);
      expect(f.taskListeners.size).toBe(0); release(); await pending;
    } finally { await f.dispose(); }
  });
  test("task revocation aborts turn; settings and grants reset transcript", async () => {
    let signal!: AbortSignal, finish!: () => void;
    const f = await chatFixture(async (_m, _t, owned) => { signal = owned; await new Promise<void>(resolve => { finish = resolve; }); return []; });
    try {
      f.chat.setTask("task"); const pending = f.chat.send("Question");
      while (!finish) await tick();
      f.revokeTask(); expect(signal.aborted).toBe(true); finish(); await pending;
      f.settings.save({ ...f.settings.get(), model: "test/model" });
      expect(f.chat.get().messages).toEqual([]);
      f.chat.setGrants([]); await f.chat.send("Denied"); expect(f.chat.get().busy).toBe(false);
    } finally { await f.dispose(); }
  });
  test("provider removal cancels an active turn", async () => {
    let finish!: () => void;
    const f = await chatFixture(async (_m, _t, signal) => { await new Promise<void>(resolve => { finish = resolve; signal.addEventListener("abort", resolve as () => void, { once: true }); }); return []; });
    try {
      const pending = f.chat.send("Question"); while (!finish) await tick();
      await f.registration.unregister(); await pending;
      expect(f.chat.get().messages[1]!.status).toBe("stopped");
    } finally { await f.dispose(); }
  });
});

test("clock uses injected scopes and provider stop cleans up exactly once", async () => {
  const host = createHost(); let ticks = 0, released = 0;
  const registration = host.provide(loopClock, { create: () => ({ now: () => 123, every: (_ms, tick) => { ticks++; tick(456); return () => { released++; }; } }) });
  const controller = createClockController({ openScope: () => host.scope(), diagnostics: host }, "workspace");
  const stop = controller.start();
  while (!ticks) await tick();
  expect(controller.get().now.getTime()).toBe(456);
  // Layout moves don't call start: the same controller retains its acquisition.
  expect(ticks).toBe(1);
  await registration.unregister(); expect(released).toBe(1); expect(controller.get().error).toContain("unavailable");
  stop(); stop(); expect(released).toBe(1); await host.dispose();
});

test("clock disposal during pending acquisition never subscribes late", async () => {
  const host = createHost(); let release!: () => void, subscriptions = 0, disposed = 0;
  host.provide(loopClock, { create: async () => {
    await new Promise<void>(resolve => { release = resolve; });
    return { now: () => 0, every: () => { subscriptions++; return () => {}; } };
  }, dispose: () => { disposed++; } });
  const controller = createClockController({ openScope: () => host.scope(), diagnostics: host }, "workspace");
  controller.start(); while (!release) await tick(); controller.dispose(); release();
  await host.dispose(); expect(subscriptions).toBe(0); expect(disposed).toBe(1);
});

test("configured, acquired, stopped, missing and incompatible bindings remain distinct with no fallback", async () => {
  const host = createHost(), scope = host.scope();
  host.provide(loopClock, { create: () => ({ now: () => 111, every: () => () => {} }) });
  const service = await host.start(loopClock, { create: () => ({ now: () => 222, every: () => () => {} }) }, { serviceId: "shared-clock" });
  try {
    const named = createScopedBinding(scope, loopClock, { kind: "named", serviceId: "shared-clock" }, host);
    expect(named.inspect().state).toBe("ready");
    const lease = await named.acquire(); expect(lease.value.now()).toBe(222); expect(named.inspect().state).toBe("acquired");
    await lease.release(); expect(named.inspect().state).toBe("ready");
    const missing = createScopedBinding(scope, loopClock, { kind: "named", serviceId: "missing" }, host);
    expect(missing.inspect().state).toBe("unavailable"); await expect(missing.acquire()).rejects.toBeDefined();
    const incompatible = createScopedBinding(scope, defineCapability({ id: loopClock.id, version: "2.0.0" }), { kind: "named", serviceId: "shared-clock" }, host);
    expect(incompatible.inspect().state).toBe("incompatible"); await expect(incompatible.acquire()).rejects.toBeDefined();
    const retained = await named.acquire(); await service.stop(); expect(retained.signal.aborted).toBe(true); expect(named.inspect().state).toBe("unavailable");
    await expect(named.acquire()).rejects.toBeDefined();
    const defaultBinding = createScopedBinding(scope, loopClock, { kind: "default" }, host);
    expect((await defaultBinding.acquire()).value.now()).toBe(111);
  } finally { await scope.revoke(); await host.dispose(); }
});

test("navigation isolates workspaces, prunes unavailable instances and clears forward on new navigation", () => {
  const history = createNavigationHistory();
  history.record("a", "home", "one"); history.record("a", "one", "two");
  history.record("b", "home", "other");
  expect(history.move("a", "two", "back", id => id !== "one")).toBe("home");
  expect(history.get("b", "other").back).toEqual(["home"]);
  history.record("a", "home", "three"); expect(history.get("a", "three").forward).toEqual([]);
  history.dispose(); expect(history.get("a", "fresh").back).toEqual([]);
});

test("editor projection and search require no browser; unavailable editor recovers without mutating source", () => {
  const store = createStore(storage()); const workspace = store.active(); const asset = workspace.assets[0]!;
  const projection = projectEditorDocument(workspace, asset, { id: "editor", kind: "asset", assetId: asset.id, definitionId: "missing" });
  expect(projection.assetId).toBe(asset.id); expect(projection.revision).toBe(asset.revision);
  expect(projection.recoverSelection).toBe(true); expect(projection.editorId).toBe("station");
  expect(asset.revision).toBe(projection.revision);
  expect(workspaceSearchItems(workspace, {}).find(item => item.assetId === asset.id)?.id).toBe("asset:" + asset.id);
});

test("overlay creates source and opens an editor without activating a program; stale deletion is rejected", () => {
  const store = createStore(storage()); const actions = createOverlayActions(store);
  const id = actions.create("script", "  New program  ");
  const asset = store.active().assets.find(a => a.id === id)!;
  expect(asset.name).toBe("New program"); expect(asset.kind).toBe("script");
  expect(Object.values(store.active().dock.panels).some(p => p.kind === "asset" && p.assetId === id)).toBe(true);
  actions.remove("stale-workspace", [id!]); expect(store.active().assets.some(a => a.id === id)).toBe(true);
});

test("command client owns one subscription, uses revisions, releases on completion and cancels on abort", async () => {
  let status = "running", cancelled = 0; const listeners = new Set<() => void>(); const requests: unknown[] = [];
  const port: CommandPort = { version: () => ({ epoch: "e", revision: 4 }), subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, execute: request => {
    requests.push(request);
    if (request.method === "operations.inspect") return { result: { status, result: "done" } };
    if (request.method === "operations.cancel") { cancelled++; return { result: {} }; }
    return { result: { operationId: "operation" } };
  } };
  const commands = createCommandClient(port); const pending = commands.run("programs.start", { instanceId: "x" });
  expect(listeners.size).toBe(1); expect(requests[0]).toMatchObject({ version: { epoch: "e", revision: 4 } });
  status = "succeeded"; listeners.forEach(fn => fn()); expect(await pending).toBe("done"); expect(listeners.size).toBe(0);
  status = "running"; const abort = new AbortController(); const cancelledRun = commands.run("programs.start", {}, abort.signal);
  abort.abort(); await expect(cancelledRun).rejects.toBeDefined(); expect(cancelled).toBe(1); expect(listeners.size).toBe(0);
});

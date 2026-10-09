import { expect, test } from "bun:test";
import { createComposition } from "../src/composition";
import { createAISettings } from "../src/ai-settings";
import { AI_GRANTS, createAITools } from "../src/ai-tools";
import { assetCatalog, assetReader, webDraftWriter } from "../src/workspace-capabilities";
import { createHost } from "@loop-kit/host";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream, tool } from "ai";
import { z } from "zod";
import { aiConversation, provideAIConversation } from "../src/ai-capabilities";

const storage = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
function widget(deps: ReturnType<typeof createComposition>) {
  const id = "test-chat";
  deps.store.dispatchDock({ type: "createWidget", widget: "ai-chat", id, target: { surface: "dashboard", intent: "append" } });
  return id;
}

test("AI credentials are memory-only by default and remembering can be undone", () => {
  const saved = storage();
  const settings = createAISettings(saved);
  settings.save({ apiKey: "test-only-placeholder", model: "openai/gpt-4.1-mini", rememberKey: false });
  expect(settings.get().apiKey).toBe("test-only-placeholder");
  expect([...saved.values.values()].join()).not.toContain("test-only-placeholder");
  expect(createAISettings(saved).get().apiKey).toBe("");
  settings.save({ ...settings.get(), rememberKey: true });
  expect(createAISettings(saved).get().apiKey).toBe("test-only-placeholder");
  settings.save({ ...settings.get(), rememberKey: false });
  expect(createAISettings(saved).get().apiKey).toBe("");
  expect(() => settings.save({ ...settings.get(), model: "bad model" })).toThrow("model ID");
});

test("widget grants deny acquisition and retained operations stop on removal", async () => {
  const deps = createComposition(storage());
  const id = widget(deps);
  const denied = deps.openWidgetScope(deps.store.active().id, id, []);
  await expect(denied.acquire(assetCatalog)).rejects.toThrow("grant required");
  await denied.revoke();
  const scope = deps.openWidgetScope(deps.store.active().id, id, [assetCatalog.id]);
  const catalog = await scope.acquire(assetCatalog);
  const list = catalog.list;
  expect(list().length).toBeGreaterThan(0);
  deps.store.dispatchDock({ type: "close", panelId: id });
  expect(() => list()).toThrow("cancelled");
  await scope.revoke();
  await deps.dispose();
});

test("workspace switching cancels widget authority and source reads exclude settings", async () => {
  const deps = createComposition(storage());
  const id = widget(deps);
  const scope = deps.openWidgetScope(deps.store.active().id, id, [assetReader.id]);
  const reader = await scope.acquire(assetReader);
  const asset = deps.store.active().assets[0];
  expect(Object.keys(reader.read(asset.id)).sort()).toEqual(["id", "kind", "name", "source"]);
  deps.store.createWorkspace("Other workspace");
  expect(() => reader.read(asset.id)).toThrow("cancelled");
  await scope.revoke();
  await deps.dispose();
});

test("tool mapping advertises granted tools only; draft writes require approval", async () => {
  const deps = createComposition(storage());
  const id = widget(deps);
  const grants = new Set([webDraftWriter.id]);
  const scope = deps.openWidgetScope(deps.store.active().id, id, grants);
  const count = deps.store.active().assets.length;
  const draft = { name: "Reviewed draft", html: "<h1>Draft</h1>" };
  const options = { toolCallId: "test", messages: [] };
  const denied = createAITools(scope, grants, async () => false, () => {});
  expect(Object.keys(denied)).toEqual(["createWebDraft"]);
  await denied.createWebDraft.execute!(draft, options);
  expect(deps.store.active().assets).toHaveLength(count);
  const approved = createAITools(scope, grants, async () => true, () => {});
  await approved.createWebDraft.execute!(draft, options);
  expect(deps.store.active().assets).toHaveLength(count + 1);
  expect(deps.store.active().assets.at(-1)).toMatchObject({ kind: "web-content", html: draft.html });
  expect(Object.values(deps.store.active().dock.panels).some(panel => panel.kind === "web-widget")).toBe(false);
  let resolve!: (allow: boolean) => void;
  const pending = createAITools(scope, grants, () => new Promise<boolean>(done => { resolve = done; }), () => {});
  const write = pending.createWebDraft.execute!(draft, options);
  await scope.revoke();
  resolve(true);
  await expect(Promise.resolve(write)).rejects.toThrow("cancelled");
  expect(deps.store.active().assets).toHaveLength(count + 1);
  expect(AI_GRANTS).toHaveLength(4);
  await deps.dispose();
});

test("AI SDK streams text and carries real tool results into the next step", async () => {
  const settings = createAISettings(storage());
  settings.save({ apiKey: "test-only-placeholder", model: "openai/test", rememberKey: false });
  const host = createHost();
  const finish = (reason: string) => ({ type: "finish", finishReason: { unified: reason, raw: reason }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } });
  const model = new MockLanguageModelV4({ doStream: [
    { stream: simulateReadableStream({ chunks: [
      { type: "stream-start", warnings: [] },
      { type: "tool-call", toolCallId: "catalog-1", toolName: "listAssets", input: "{}" }, finish("tool-calls"),
    ] }) },
    { stream: simulateReadableStream({ chunks: [
      { type: "stream-start", warnings: [] }, { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "One asset." }, { type: "text-end", id: "text-1" }, finish("stop"),
    ] }) },
  ] as any });
  provideAIConversation(host, settings, () => model);
  const scope = host.scope();
  const ai = (await scope.acquire(aiConversation)).value;
  let called = 0, text = "";
  const response = await ai.run([{ role: "user", content: "List assets" }], { listAssets: tool({ inputSchema: z.object({}), execute: async () => { called++; return [{ id: "fixture" }]; } }) }, new AbortController().signal, delta => { text += delta; });
  expect(called).toBe(1);
  expect(text).toBe("One asset.");
  expect(model.doStreamCalls).toHaveLength(2);
  expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain("fixture");
  expect(JSON.stringify(model.doStreamCalls)).not.toContain("test-only-placeholder");
  expect(response.some(message => message.role === "tool")).toBe(true);
  await scope.revoke();
  await expect(ai.run([], {}, new AbortController().signal, () => {})).rejects.toThrow();
  await host.dispose();
});

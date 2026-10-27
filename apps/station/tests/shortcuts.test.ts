import { test, expect } from "bun:test";
import { DEFAULT_SHORTCUTS, activeShortcutEntries, nativeAccelerator, resolvedShortcut, shortcutFromEvent, shortcutKeysSchema, shortcutSettingsSchema } from "../src/core/shortcuts";
import { createNativeShortcuts, createShortcutHttp } from "../desktop/shortcut-service";
import { createStore } from "../src/features/workspace/application/store";
import { createStationControl } from "../src/features/commands/application/runtime";
import { desktopProfile } from "../desktop/profile";

test("desktop development has its own identity and exact origin", () => {
  const dev = desktopProfile(false, true), user = desktopProfile(false), acceptance = desktopProfile(true);
  expect(new Set([dev.port, user.port, acceptance.port]).size).toBe(3);
  expect(new Set([dev.identifier, user.identifier, acceptance.identifier]).size).toBe(3);
  expect(dev.origin).toBe("http://127.0.0.1:43159");
  expect(() => desktopProfile(true, true)).toThrow();
});
test("recorded keys resolve physical codes and platform aliases without accepting sequences", () => {
  const event = { key: " ", code: "Space", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false };
  expect(shortcutFromEvent(event, "other")).toBe("mod+alt+space");
  expect(resolvedShortcut("mod+alt+space", "other")).toBe(resolvedShortcut("ctrl+alt+space", "other"));
  expect(nativeAccelerator("ctrl+alt+space", "other")).toBe("Control+Alt+Space");
  expect(nativeAccelerator("mod+shift+k", "mac")).toBe("Command+Shift+K");
  expect(() => nativeAccelerator("space", "other")).toThrow();
  expect(shortcutKeysSchema.safeParse("mod+k mod+c").success).toBe(false);
  expect(shortcutSettingsSchema.safeParse({ entries: [{ ...DEFAULT_SHORTCUTS.entries[0], scope: "desk" }] }).success).toBe(false);
  expect(shortcutSettingsSchema.safeParse({ entries: [DEFAULT_SHORTCUTS.entries[0], { ...DEFAULT_SHORTCUTS.entries[0], id: "collision", keys: "mod+alt+space" }] }).success).toBe(false);
  expect(activeShortcutEntries({ entries: [{ ...DEFAULT_SHORTCUTS.entries[0]!, scope: "desk", deskId: "other" }] }, "active")).toHaveLength(0);
});
test("native replacement, recording suspension, failures, expiry and stale callbacks release owned keys", () => {
  let time = 1000;
  const callbacks = new Map<string, () => void>(), events: string[] = [], removed: string[] = [];
  const service = createNativeShortcuts({ register: (keys, callback) => { if (keys === "Control+Q") return false; callbacks.set(keys, callback); return true; }, unregister: keys => { removed.push(keys); callbacks.delete(keys); return true; } }, id => events.push(id), () => time, "other");
  const sessionId = crypto.randomUUID(), input = { sessionId, generation: 1, suspended: false, bindings: [{ id: "capture", keys: "ctrl+alt+space" }] };
  expect(service.configure(input)[0]!.status).toBe("registered");
  const oldCallback = callbacks.get("Control+Alt+Space")!; oldCallback(); expect(events).toEqual(["capture"]);
  service.configure({ ...input, suspended: true }); oldCallback(); expect(events).toHaveLength(1); expect(removed).toContain("Control+Alt+Space");
  service.configure({ ...input, bindings: [{ id: "unavailable", keys: "ctrl+q" }] }); expect(callbacks.size).toBe(0);
  expect(service.configure({ ...input, bindings: [{ id: "unavailable", keys: "ctrl+q" }] })[0]!.status).toBe("unavailable");
  service.configure(input); time += 60_001; service.expire(); expect(callbacks.size).toBe(1);
  // A background-coalesced heartbeat keeps the exact registration alive.
  service.configure(input); time += 60_001; service.expire(); expect(callbacks.size).toBe(1);
  time += 180_001; service.expire(); expect(callbacks.size).toBe(0);
  oldCallback(); expect(events).toHaveLength(1);
  service.configure(input); service.clear(); expect(callbacks.size).toBe(0);
});
test("foreign, unauthenticated and malformed native shortcut requests cannot register keys", async () => {
  let registrations = 0;
  const service = createNativeShortcuts({ register: () => { registrations++; return true; }, unregister: () => true }, () => {});
  const origin = "http://127.0.0.1:43159", handle = createShortcutHttp("test-secret", origin, service);
  const headers = { host: "127.0.0.1:43159", origin, "sec-fetch-site": "same-origin", "x-station-desktop": "test-secret" };
  const body = JSON.stringify({ sessionId: crypto.randomUUID(), generation: 1, suspended: false, bindings: [{ id: "capture", keys: "ctrl+alt+space" }] });
  expect((await handle(new Request(`${origin}/api/desktop/shortcuts`, { method: "POST", headers: { ...headers, "x-station-desktop": "wrong" }, body }))).status).toBe(403);
  expect((await handle(new Request(`${origin}/api/desktop/shortcuts`, { method: "POST", headers: { ...headers, origin: "https://foreign.test" }, body }))).status).toBe(403);
  expect((await handle(new Request(`${origin}/api/desktop/shortcuts`, { method: "POST", headers, body: '{"code":"arbitrary"}' }))).status).toBe(400);
  expect(registrations).toBe(0);
  expect((await handle(new Request(`${origin}/api/desktop/shortcuts`, { method: "POST", headers, body }))).status).toBe(200);
  expect(registrations).toBe(1); service.clear();
});
test("capture defaults are ordinary revision-checked records and preferences persist without native state", () => {
  const memory = new Map<string, string>(), storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); } };
  const store = createStore(storage), control = createStationControl(store);
  try {
    const inbox = store.active().assets.find(a => a.id === "inbox")!;
    expect(inbox.kind).toBe("data-source");
    control.execute({ method: "data.mutate", params: { assetId: inbox.id, expectedAssetRevision: inbox.revision, record: { id: "capture-1", values: { text: "A real capture", created: new Date().toISOString(), status: "Inbox" } } }, version: control.version() });
    expect(JSON.parse(store.active().assets.find(a => a.id === inbox.id)!.files!["data.json"]!).records[0].values.text).toBe("A real capture");
    expect(() => control.execute({ method: "data.mutate", params: { assetId: inbox.id, expectedAssetRevision: inbox.revision, removeId: "capture-1" }, version: control.version() })).toThrow();
    store.configureShortcuts({ ...DEFAULT_SHORTCUTS, entries: [{ ...DEFAULT_SHORTCUTS.entries[0]!, keys: "ctrl+shift+i" }] });
    const restored = createStore(storage);
    expect(restored.active().shortcuts!.entries[0]!.keys).toBe("ctrl+shift+i");
    expect(JSON.stringify(restored.active().shortcuts)).not.toContain("registered");
  } finally { control.dispose(); }
});

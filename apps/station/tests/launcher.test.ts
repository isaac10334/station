import { expect, test } from "bun:test";
import { createLauncher, createLauncherHttp, type LauncherWindow } from "../desktop/launcher-service";

function fixture(initial = { visible: true, minimized: false, maximized: false, fullScreen: false }) {
  let frame = { x: 90, y: 110, width: 1440, height: 960 }, time = 0;
  const state = { ...initial }, calls: string[] = [];
  const win: LauncherWindow = {
    getFrame: () => ({ ...frame }), setFrame: (x, y, width, height) => { frame = { x, y, width, height }; calls.push("frame"); },
    isVisible: () => state.visible, isMinimized: () => state.minimized, isMaximized: () => state.maximized, isFullScreen: () => state.fullScreen,
    unminimize: () => { state.minimized = false; }, minimize: () => { state.minimized = true; },
    unmaximize: () => { state.maximized = false; }, maximize: () => { state.maximized = true; },
    setFullScreen: value => { state.fullScreen = value; }, center: () => {},
    show: () => { state.visible = true; }, hide: () => { state.visible = false; }, activate: () => { calls.push("activate"); },
  };
  const launcher = createLauncher(() => win, () => time, () => ({ x: -1024, y: 0, width: 1024, height: 768 }));
  return { launcher, state, calls, frame: () => frame, advance: (ms: number) => { time += ms; } };
}
test("native invocation temporarily compacts the same window and restores exact bounds and state", () => {
  for (const state of [
    { visible: true, minimized: false, maximized: false, fullScreen: false },
    { visible: false, minimized: false, maximized: true, fullScreen: false },
    { visible: true, minimized: true, maximized: false, fullScreen: true },
  ]) {
    const f = fixture(state), original = f.frame();
    expect(() => f.launcher.open("s")).toThrow("expired");
    f.launcher.arm(); f.launcher.open("s");
    expect(f.frame()).toEqual({ x: -892, y: 74, width: 760, height: 620 });
    expect(f.state.visible).toBe(true); expect(f.state.maximized).toBe(false);
    f.launcher.arm(); f.launcher.open("s"); // repeat does not replace original frame
    expect(f.launcher.close("s")).toBe(true);
    expect(f.frame()).toEqual(original); expect(f.state).toEqual(state);
    expect(f.launcher.restore()).toBe(false);
  }
});
test("different sessions cannot close or renew a launcher; heartbeat and expiry are bounded", () => {
  const f = fixture(); f.launcher.arm(); f.advance(5000);
  expect(() => f.launcher.open("s")).toThrow("expired");
  f.launcher.arm(); f.launcher.open("s");
  expect(() => f.launcher.close("other")).toThrow("session");
  expect(() => f.launcher.open("other")).toThrow("session");
  f.advance(179_000); f.launcher.open("s"); f.advance(179_000);
  expect(f.launcher.expire()).toBe(false);
  f.advance(1000); expect(f.launcher.expire()).toBe(true);
  expect(f.frame().width).toBe(1440);
});
test("navigation, explicit Show Station or shutdown restore without requiring renderer acknowledgement", () => {
  const f = fixture(); f.launcher.arm(); f.launcher.open("s");
  expect(f.launcher.restore()).toBe(true); expect(f.launcher.active).toBe(false);
  expect(f.frame()).toEqual({ x: 90, y: 110, width: 1440, height: 960 });
});
test("full-window shortcuts explicitly show the restored window even when capture began hidden", () => {
  const f = fixture({ visible: false, minimized: true, maximized: false, fullScreen: false });
  f.launcher.arm(); f.launcher.open("s"); f.launcher.expand("s");
  expect(f.frame().width).toBe(1440); expect(f.state.visible).toBe(true);
  expect(f.state.minimized).toBe(false); expect(f.launcher.active).toBe(false);
});
test("launcher endpoint rejects foreign origins, missing secrets, arbitrary geometry and unarmed opens", async () => {
  const f = fixture(), origin = "http://127.0.0.1:43158", handle = createLauncherHttp("secret", origin, f.launcher);
  const headers = { host: "127.0.0.1:43158", origin, "sec-fetch-site": "same-origin", "x-station-desktop": "secret" };
  const sessionId = crypto.randomUUID();
  const request = (body: object, overrides = {}) => handle(new Request(`${origin}/api/desktop/launcher`, { method: "POST", headers: { ...headers, ...overrides }, body: JSON.stringify(body) }));
  expect((await request({ action: "open", sessionId }, { origin: "https://foreign.test" })).status).toBe(403);
  expect((await request({ action: "open", sessionId }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
  expect((await request({ action: "open", sessionId }, { "x-station-desktop": "wrong" })).status).toBe(403);
  expect((await request({ action: "open", sessionId })).status).toBe(409);
  f.launcher.arm();
  expect((await request({ action: "open", sessionId, width: 900 })).status).toBe(409);
  expect(f.calls).toEqual([]);
  expect((await request({ action: "open", sessionId })).status).toBe(200);
  expect((await request({ action: "close", sessionId })).status).toBe(200);
  expect(f.frame().width).toBe(1440);
});

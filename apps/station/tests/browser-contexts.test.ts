import { describe, expect, test } from "bun:test";
import { createHost } from "@loop-kit/host";
import { browserContexts, type BrowserFrame } from "@station/capabilities";
import {
  browserBookmark,
  browserConfiguration,
  browserUrl,
  defaultBrowserConfiguration,
} from "../src/core/browser-policy";
import {
  createBrowserService,
  type NativeBrowserDriver,
} from "../desktop/browser-service";
import { createBrowserHttp } from "../desktop/browser-http";
import { desktopBrowserContexts } from "../src/services/browser-contexts";
import { cloneDesk, createDesk } from "../src/core/desks";
import { createDockLayout, migrateDock, reduceDock } from "../src/core/docking";

function driverFixture() {
  const views: {
    url: string;
    disposed: number;
    frames: BrowserFrame[];
    commands: string[];
  }[] = [];
  const driver: NativeBrowserDriver = {
    create(url) {
      const view = {
        url,
        disposed: 0,
        frames: [] as BrowserFrame[],
        commands: [] as string[],
      };
      views.push(view);
      return {
        snapshot: () => ({
          url: view.url,
          title: "Page",
          loading: false,
          back: true,
          forward: false,
          error: "",
        }),
        navigate(url) {
          view.url = url;
        },
        command(type) {
          view.commands.push(type);
        },
        present(frame) {
          view.frames.push(frame);
        },
        dispose() {
          view.disposed++;
        },
      };
    },
  };
  return { views, driver };
}
test("desktop provider disposal awaits native lease revocation and retained methods reject", async () => {
  const keys = ["window", "document", "fetch"] as const;
  const descriptors = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  let finish: (() => void) | undefined;
  const root: any = {}; root.top = root;
  try {
    Object.assign(globalThis, { window: root, document: { querySelector: () => ({ content: "fixture-secret" }) },
      fetch: async (_url: string, init: RequestInit) => {
        const value = JSON.parse(init.body as string);
        if (value.action === "revoke") await new Promise<void>(resolve => { finish = resolve; });
        return Response.json(value.action === "grant" ? { lease: "fixture-lease" } : { id: "session", tabs: [], activeTab: "" });
      } });
    const controller = new AbortController();
    const api = desktopBrowserContexts(controller.signal);
    await api.open(defaultBrowserConfiguration());
    controller.abort();
    let disposed = false;
    const cleanup = api.dispose().then(() => { disposed = true; });
    await Promise.resolve();
    expect(disposed).toBe(false);
    expect(finish).toBeDefined(); finish!();
    await cleanup;
    expect(disposed).toBe(true);
    await expect(api.perform("session", { type: "snapshot" })).rejects.toThrow("revoked");
  } finally {
    finish?.();
    keys.forEach((key, i) => { const value = descriptors[i]; if (value) Object.defineProperty(globalThis, key, value); else delete (globalThis as any)[key]; });
  }
});
describe("browser policy", () => {
  test("rejects privileged schemes, credentials and canonical local addresses", () => {
    for (const url of [
      "file:///C:/secret",
      "views://app/index.html",
      "javascript:alert(1)",
      "data:text/html,x",
      "https://user:password@example.com/",
      "http://127.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://localhost./api",
      "http://a.localhost/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://192.168.0.1/",
      "http://10.1.0.1/",
      "http://172.16.1.1/",
      "https://example.com\\@localhost/",
      "http://0.0.0.0/",
      "http://169.254.169.254/",
      "http://100.64.0.1/",
    ])
      expect(() => browserUrl(url)).toThrow();
    expect(browserUrl("https://example.org/a?q=runtime#fragment")).toBe(
      "https://example.org/a?q=runtime#fragment",
    );
  });
  test("configuration is a whitelist without credentials, query tokens or authority", () => {
    expect(browserBookmark("https://example.org/a?token=secret#password")).toBe(
      "https://example.org/a",
    );
    expect(
      browserConfiguration({
        tabs: [
          {
            id: "a",
            url: "https://example.org/a?token=secret",
            cookies: "secret",
          },
        ],
        activeTab: "a",
        grant: true,
        partition: "root",
      }),
    ).toEqual({
      tabs: [{ id: "a", url: "https://example.org/a" }],
      activeTab: "a",
    });
    expect(() =>
      browserConfiguration({
        tabs: Array.from({ length: 13 }, (_, i) => ({
          id: String(i),
          url: "https://example.org",
        })),
      }),
    ).toThrow();
    expect(() =>
      browserConfiguration({
        tabs: [
          { id: "same", url: "https://example.org" },
          { id: "same", url: "https://example.com" },
        ],
      }),
    ).toThrow();
  });
});
describe("owned browser resources", () => {
  test("production pin fails closed without a conforming native adapter", () => {
    const service = createBrowserService();
    expect(service.availability().available).toBe(false);
    expect(() => service.grant()).toThrow("security update");
  });
  test("presentation and activation retain native resources; revocation closes every tab once", () => {
    const { views, driver } = driverFixture(),
      service = createBrowserService(driver),
      lease = service.grant();
    const first = service.open(lease, defaultBrowserConfiguration());
    const second = service.perform(lease, first.id, {
      type: "add",
      tab: "second",
      url: "https://example.org/",
    });
    service.perform(lease, first.id, {
      type: "present",
      frame: { x: 10, y: 20, width: 400, height: 300, visible: true },
    });
    service.perform(lease, first.id, { type: "activate", tab: "start" });
    service.perform(lease, first.id, {
      type: "present",
      frame: { x: 100, y: 50, width: 500, height: 400, visible: false },
    });
    expect(second.tabs).toHaveLength(2);
    expect(views).toHaveLength(2);
    expect(views.every((view) => view.disposed === 0)).toBe(true);
    expect(views[0].frames.some((frame) => frame.visible)).toBe(true);
    expect(views[1].frames.some((frame) => frame.visible)).toBe(true);
    expect(views.every((view) => !view.frames.at(-1)!.visible)).toBe(true);
    service.revoke(lease);
    service.revoke(lease);
    service.dispose();
    expect(views.map((view) => view.disposed)).toEqual([1, 1]);
    expect(() =>
      service.perform(lease, first.id, { type: "reload", tab: "start" }),
    ).toThrow("revoked");
  });
  test("a different lease cannot operate a resource or forge arbitrary operations", () => {
    const { views, driver } = driverFixture(),
      service = createBrowserService(driver);
    const lease = service.grant(),
      other = service.grant(),
      session = service.open(lease, defaultBrowserConfiguration());
    expect(() =>
      service.perform(other, session.id, { type: "snapshot" }),
    ).toThrow("belong");
    for (const operation of [
      { type: "executeJavascript", tab: "start", script: "alert(1)" },
      { type: "navigate", tab: "start", url: "http://127.0.0.1:43157/" },
      {
        type: "present",
        frame: { x: 0, y: 0, width: NaN, height: 10, visible: true },
      },
    ])
      expect(() =>
        service.perform(lease, session.id, operation as never),
      ).toThrow();
    expect(views[0].commands).toEqual([]);
    service.dispose();
  });
  test("Loop Kit acquisition abort disposes resources and retained methods reject", async () => {
    const { views, driver } = driverFixture(),
      service = createBrowserService(driver),
      host = createHost();
    host.provide(browserContexts, {
      create({ signal }) {
        const lease = service.grant();
        signal.addEventListener("abort", () => service.revoke(lease), {
          once: true,
        });
        return {
          async availability() {
            return service.availability();
          },
          async open(config) {
            return service.open(lease, config);
          },
          async perform(id, operation) {
            return service.perform(lease, id, operation);
          },
          async close(id) {
            service.close(lease, id);
          },
        };
      },
    });
    const scope = host.scope(),
      handle = await scope.acquire(browserContexts);
    const retained = handle.value;
    const session = await retained.open(defaultBrowserConfiguration());
    await scope.revoke();
    expect(views[0].disposed).toBe(1);
    expect(() => handle.value).toThrow("revoked");
    await expect(
      retained.perform(session.id, { type: "snapshot" }),
    ).rejects.toThrow("revoked");
    await host.dispose();
  });
  test("partial creation failure disposes already-created native views", () => {
    const fixture = driverFixture();
    let count = 0;
    const service = createBrowserService({
      create(url) {
        if (++count === 2) throw new Error("renderer failed");
        return fixture.driver.create(url);
      },
    });
    expect(() =>
      service.open(service.grant(), {
        tabs: [
          { id: "a", url: "https://example.com" },
          { id: "b", url: "https://example.org" },
        ],
        activeTab: "a",
      }),
    ).toThrow();
    expect(fixture.views[0].disposed).toBe(1);
  });
  test("lost renderer renewal expires every view and cannot revive old authority", () => {
    const fixture = driverFixture();
    let now = 1000;
    const service = createBrowserService(fixture.driver, () => now),
      lease = service.grant();
    const session = service.open(lease, defaultBrowserConfiguration());
    now += 10_000;
    service.renew(lease);
    now += 10_000;
    service.expire();
    expect(fixture.views[0].disposed).toBe(0);
    now += 5000;
    service.expire();
    expect(fixture.views[0].disposed).toBe(1);
    expect(() => service.renew(lease)).toThrow("revoked");
    expect(() =>
      service.perform(lease, session.id, { type: "snapshot" }),
    ).toThrow("revoked");
  });
  test("native cleanup failure does not strand sibling views or retry stale handles", () => {
    const fixture = driverFixture();
    let count = 0;
    const service = createBrowserService({
      create(url) {
        const view = fixture.driver.create(url),
          fail = ++count === 1;
        return {
          ...view,
          dispose() {
            view.dispose();
            if (fail) throw new Error("renderer cleanup failure");
          },
        };
      },
    });
    const lease = service.grant(),
      session = service.open(lease, defaultBrowserConfiguration());
    service.perform(lease, session.id, {
      type: "add",
      tab: "second",
      url: "https://example.org",
    });
    expect(() => service.revoke(lease)).toThrow("cleanup failed");
    expect(fixture.views.map((view) => view.disposed)).toEqual([1, 1]);
    service.revoke(lease);
    service.dispose();
    expect(fixture.views.map((view) => view.disposed)).toEqual([1, 1]);
  });
});
describe("browser desktop transport", () => {
  const headers = {
    host: "127.0.0.1:43157",
    origin: "http://127.0.0.1:43157",
    "sec-fetch-site": "same-origin",
    "x-station-desktop": "secret",
    "content-type": "application/json",
  };
  test("authenticated data operations share the same resource and revocation boundary", async () => {
    const { driver, views } = driverFixture(),
      service = createBrowserService(driver),
      http = createBrowserHttp("secret", service);
    const call = (body: unknown) =>
      http(
        new Request("http://127.0.0.1:43157/api/desktop/browser", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      );
    const grant = await (await call({ action: "grant" })).json();
    const session = await (
      await call({
        action: "open",
        lease: grant.lease,
        config: defaultBrowserConfiguration(),
      })
    ).json();
    expect(session.tabs[0].url).toBe("https://example.com/");
    expect(Object.keys(session).sort()).toEqual(["activeTab", "id", "tabs"]);
    expect((await call({ action: "revoke", lease: grant.lease })).status).toBe(
      200,
    );
    expect(views[0].disposed).toBe(1);
    expect(
      (
        await call({
          action: "perform",
          lease: grant.lease,
          session: session.id,
          operation: { type: "snapshot" },
        })
      ).status,
    ).toBe(400);
  });
  test("guest messages, cross-origin requests and missing secrets cannot grant authority", async () => {
    const { driver } = driverFixture(),
      service = createBrowserService(driver),
      http = createBrowserHttp("secret", service);
    for (const override of [
      { "x-station-desktop": "forged" },
      { origin: "https://example.org" },
      { "sec-fetch-site": "cross-site" },
      { host: "evil.test" },
    ]) {
      const response = await http(
        new Request("http://127.0.0.1:43157/api/desktop/browser", {
          method: "POST",
          headers: { ...headers, ...override },
          body: '{"action":"grant"}',
        }),
      );
      expect(response.status).toBe(403);
    }
    const response = await http(
      new Request("http://127.0.0.1:43157/api/desktop/browser", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "host-message",
          lease: "fake",
          permission: "download",
        }),
      }),
    );
    expect(response.status).toBe(400);
    const oversized = await http(
      new Request("http://127.0.0.1:43157/api/desktop/browser", {
        method: "POST",
        headers,
        body: " ".repeat(16_385),
      }),
    );
    expect(oversized.status).toBe(400);
  });
});
test("browser bookmarks follow the existing dock and clone without copying runtime authority", () => {
  let result = reduceDock(createDockLayout(), {
    type: "createWidget",
    widget: "web-browser",
    id: "browser-test",
    target: { surface: "dashboard", intent: "append" },
  });
  expect(result.ok).toBe(true);
  result = reduceDock(result.layout, {
    type: "configureBrowser",
    panelId: "browser-test",
    config: {
      tabs: [
        { id: "one", url: "https://example.org/a?credential=secret#secret" },
      ],
      activeTab: "one",
    },
  });
  expect(result.ok).toBe(true);
  const serialized = JSON.stringify(result.layout);
  expect(serialized).not.toContain("credential");
  const restored = migrateDock(JSON.parse(serialized));
  const copy = cloneDesk(createDesk("Test", restored), "Copy");
  const browser = Object.values(copy.dock.panels).find(
    (panel) => panel.kind === "widget" && panel.widget === "web-browser",
  );
  expect(browser?.id).not.toBe("browser-test");
  expect(browser?.kind === "widget" && browser.browser?.tabs[0].url).toBe(
    "https://example.org/a",
  );
});

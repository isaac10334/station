import { describe, expect, test } from "bun:test";
import {
  createDesktopUpdates,
  type DesktopUpdater,
} from "../desktop/update-service";
import { createUpdateHttp } from "../desktop/update-http";

function fixture() {
  let status: Parameters<DesktopUpdater["onStatusChange"]>[0];
  let info = { updateAvailable: true, updateReady: false, error: "" };
  let checks = 0,
    downloads = 0,
    applies = 0,
    prompts = 0,
    notices = 0,
    handoffs = 0;
  let confirm = false;
  const adapter: DesktopUpdater = {
    getLocalInfo: async () => ({ channel: "canary", version: "A" }),
    checkForUpdate: async () => {
      checks++;
      return info;
    },
    downloadUpdate: async () => {
      downloads++;
      status?.({
        status: "download-progress",
        message: "Bytes",
        details: { progress: 38 },
      });
      info = { ...info, updateReady: true };
    },
    updateInfo: () => info,
    applyUpdate: async () => {
      applies++;
      status?.({ status: "launching-new-version", message: "Restarting" });
    },
    onStatusChange: (callback) => {
      status = callback;
    },
  };
  const service = createDesktopUpdates(adapter, {
    confirm: async () => {
      prompts++;
      return confirm;
    },
    ready: () => {
      notices++;
    },
    handoff: () => {
      handoffs++;
      service.dispose();
    },
  });
  return {
    service,
    adapter,
    setInfo: (next: typeof info) => {
      info = next;
    },
    allow: () => {
      confirm = true;
    },
    counts: () => ({ checks, downloads, applies, prompts, notices, handoffs }),
  };
}

describe("trusted desktop updates", () => {
  test("immutable cached snapshots, real progress, duplicate guards and explicit Later/restart", async () => {
    const f = fixture();
    await f.service.initialize();
    expect(f.service.getSnapshot()).toBe(f.service.getSnapshot());
    expect(Object.isFrozen(f.service.getSnapshot())).toBe(true);
    const progress: (number | null)[] = [];
    f.service.subscribe(() => progress.push(f.service.getSnapshot().progress));
    await Promise.all([
      f.service.check(),
      f.service.check(),
      f.service.apply(),
    ]);
    expect(f.counts()).toEqual({
      checks: 1,
      downloads: 1,
      applies: 0,
      prompts: 0,
      notices: 1,
      handoffs: 0,
    });
    expect(progress).toContain(38);
    expect(f.service.getSnapshot().phase).toBe("ready");
    await f.service.check();
    expect(f.counts().notices).toBe(1);
    await f.service.apply();
    expect(f.service.getSnapshot().phase).toBe("ready");
    expect(f.counts().applies).toBe(0);
    f.allow();
    await Promise.all([f.service.apply(), f.service.apply()]);
    expect(f.counts().applies).toBe(1);
    expect(f.counts().handoffs).toBe(1);
  });
  test("network failure never becomes up-to-date; retry succeeds", async () => {
    const f = fixture();
    await f.service.initialize();
    f.setInfo({
      updateAvailable: false,
      updateReady: false,
      error: "Network unavailable",
    });
    await f.service.check();
    expect(f.service.getSnapshot().phase).toBe("error");
    expect(f.service.getSnapshot().lastCheck).toBeNull();
    f.setInfo({ updateAvailable: false, updateReady: false, error: "" });
    await f.service.check();
    expect(f.service.getSnapshot().phase).toBe("up-to-date");
    expect(f.service.getSnapshot().lastCheck).toBeNumber();
  });
  test("incomplete bytes cannot enable restart; helper failure remains recoverable", async () => {
    const f = fixture();
    await f.service.initialize();
    f.adapter.downloadUpdate = async () => {};
    await f.service.check();
    await f.service.apply();
    expect(f.service.getSnapshot().phase).toBe("error");
    expect(f.counts().prompts).toBe(0);
    f.setInfo({ updateAvailable: true, updateReady: true, error: "" });
    await f.service.check();
    f.allow();
    f.adapter.applyUpdate = async () => {
      throw new Error("Helper failed");
    };
    await f.service.apply();
    expect(f.service.getSnapshot().phase).toBe("error");
    expect(f.counts().handoffs).toBe(0);
    expect(f.service.getSnapshot().message).toContain("Helper failed");
  });
  test("dev channel remains unsupported and disposal ignores late completion", async () => {
    const f = fixture();
    f.adapter.getLocalInfo = async () => ({ channel: "dev", version: "dev" });
    await f.service.initialize();
    await f.service.check();
    expect(f.service.getSnapshot().phase).toBe("unsupported");
    expect(f.counts().checks).toBe(0);
    f.adapter.getLocalInfo = async () => ({ channel: "canary", version: "A" });
    await f.service.initialize();
    let finish!: (info: ReturnType<typeof f.adapter.updateInfo>) => void;
    f.adapter.checkForUpdate = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const check = f.service.check();
    f.service.dispose();
    finish({ updateAvailable: true, updateReady: false, error: "" });
    await check;
    expect(f.counts().downloads).toBe(0);
  });
  test("HTTP rejects foreign/opaque origins, DNS rebinding, missing secret and arbitrary operations", async () => {
    const f = fixture();
    const http = createUpdateHttp("secret", f.service);
    const valid = {
      host: "127.0.0.1:43157",
      "sec-fetch-site": "same-origin",
      "x-station-desktop": "secret",
      origin: "http://127.0.0.1:43157",
    };
    const request = (
      headers: Record<string, string>,
      path = "",
      method = "GET",
    ) =>
      http(
        new Request(`http://127.0.0.1:43157/api/desktop/updates${path}`, {
          headers,
          method,
        }),
      );
    expect(request(valid).status).toBe(200);
    for (const headers of [
      { ...valid, origin: "null" },
      { ...valid, origin: "https://foreign.test" },
      { ...valid, host: "foreign.test" },
      { ...valid, "x-station-desktop": "" },
      { ...valid, "sec-fetch-site": "cross-site" },
    ])
      expect(request(headers, "/apply", "POST").status).toBe(403);
    expect(request(valid, "/exec", "POST").status).toBe(404);
    expect(request(valid, "/apply").status).toBe(404);
    expect(request(valid, "/check", "POST").status).toBe(202);
    expect(http(new Request("http://127.0.0.1:43157/api/desktop/updates/check", {
      headers: valid, method: "POST", body: "unexpected chunked body",
    })).status).toBe(400);
  });
  test("real Bun HTTP transport accepts body-free checks and rejects streamed bodies", async () => {
    const f = fixture();
    let http!: ReturnType<typeof createUpdateHttp>;
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => http(request) });
    const origin = server.url.origin;
    http = createUpdateHttp("secret", f.service, origin);
    const headers = { origin, "sec-fetch-site": "same-origin", "x-station-desktop": "secret" };
    try {
      expect((await fetch(`${origin}/api/desktop/updates/check`, { method: "POST", headers })).status).toBe(202);
      const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("unexpected")); controller.close(); } });
      expect((await fetch(`${origin}/api/desktop/updates/apply`, { method: "POST", headers, body })).status).toBe(400);
      expect(f.counts().prompts).toBe(0);
    } finally {
      await server.stop(true);
      f.service.dispose();
    }
  });
});

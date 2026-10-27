import { PATHS, type BrowserView, type BrowserWindow } from "electrobun/main";
import { CString, dlopen, FFIType } from "bun:ffi";
import { join } from "node:path";
import type { BrowserService } from "./browser-service";

/** Opt-in installed-runtime test authority, never a capability or HTTP route.
 * Executes one fixed probe using the trusted main SDK. No arbitrary page script
 * is accepted from a caller. Reports contain only fixed public fixture results.
 */
export async function verifyInstalledBrowser(
  service: BrowserService,
  views: BrowserView[],
  root: BrowserWindow,
) {
  const assert = (ok: unknown, message: string) => {
    if (!ok) throw new Error(message);
  };
  const until = async <T>(read: () => T, ready: (value: T) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const value = read();
      if (ready(value)) return value;
      await Bun.sleep(100);
    }
    throw new Error("Native browser acceptance timed out.");
  };
  const lease = service.grant();
  const renew = setInterval(() => service.renew(lease), 5000);
  const firstView = views.length;
  try {
    const session = service.open(lease, {
      tabs: [
        { id: "example", url: "https://example.com/" },
        { id: "wikipedia", url: "https://www.wikipedia.org/" },
      ],
      activeTab: "example",
    });
    const snapshot = () =>
      service.perform(lease, session.id, { type: "snapshot" });
    const loaded = await until(snapshot, (s) =>
      s.tabs.every((t) => !t.loading && !!t.title),
    );
    assert(
      loaded.tabs[0].title === "Example Domain" &&
        loaded.tabs[1].title === "Wikipedia",
      "Two unrelated native sites failed.",
    );
    assert(
      loaded.tabs.every((t) => !t.error),
      "Native page reported a load error.",
    );
    const count = views.length;
    const page = views[firstView];
    const diagnostics = dlopen(
      join(PATHS.RESOURCES_FOLDER, "../bin/libNativeWrapper.dll"),
      {
        stationBrowserBounds: { args: [FFIType.ptr], returns: FFIType.ptr },
        stationBrowserFree: { args: [FFIType.ptr], returns: FFIType.void },
      },
    );
    const originalZoom = root.webview.getPageZoom();
    try {
      for (const zoom of [0.8, 1, 1.25, 1.5]) {
        root.webview.setPageZoom(zoom);
        await until(
          () => root.webview.getPageZoom(),
          (value) => Math.abs(value - zoom) < 0.001,
        );
        service.perform(lease, session.id, {
          type: "present",
          frame: {
            x: 120.25,
            y: 80.5,
            width: 600.5,
            height: 300.25,
            visible: true,
          },
        });
        await until(
          () => {
            const pointer = diagnostics.symbols.stationBrowserBounds(page.ptr);
            if (pointer === null) throw new Error("Native browser bounds unavailable");
            try {
              return JSON.parse(new CString(pointer).toString());
            } finally {
              diagnostics.symbols.stationBrowserFree(pointer);
            }
          },
          (bounds) => {
            const scale = (zoom * bounds.dpi) / 96;
            return (
              Math.abs(bounds.x - 120.25 * scale) <= 1 &&
              Math.abs(bounds.y - 80.5 * scale) <= 1 &&
              Math.abs(bounds.width - 600.5 * scale) <= 1 &&
              Math.abs(bounds.height - 300.25 * scale) <= 1
            );
          },
        );
      }
    } finally {
      root.webview.setPageZoom(originalZoom);
      diagnostics.close();
    }
    for (const visible of [true, false, true])
      service.perform(lease, session.id, {
        type: "present",
        frame: { x: 350, y: 250, width: 600, height: 300, visible },
      });
    assert(views.length === count, "Hiding recreated a native view.");
    service.perform(lease, session.id, { type: "activate", tab: "wikipedia" });
    service.perform(lease, session.id, { type: "activate", tab: "example" });
    assert(
      views[firstView] === page && views.length === count,
      "Tab switching replaced the native owner.",
    );
    // Fixed hostile-page probe. There is intentionally no Station preload,
    // event callback or credential in this script or either public fixture URL.
    page.executeJavascript(`(async () => {
      const checks = { noSDK: typeof window.__electrobun === 'undefined',
        noStationBridge: typeof window.__electrobunSendToHost === 'undefined',
        ownRoot: window.top === window && window.opener === null,
        popupDenied: window.open('https://example.org/') === null };
      try { chrome.webview.postMessage({type:'internal', action:'grant', capability:'station:browser/contexts'}); } catch {}
      try { chrome.webview.hostObjects.sync.hostBridge.postMessage('{}'); checks.hostDenied = false; }
      catch { checks.hostDenied = true; }
      try { await fetch('http://127.0.0.1:43157/api/desktop/browser', {credentials:'include'}); checks.localDenied = false; }
      catch { checks.localDenied = true; }
      checks.permissionDenied = await Notification.requestPermission() === 'denied';
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['Station download policy probe']));
      link.download = 'station-browser-probe.txt'; document.body.append(link); link.click();
      document.title = 'Station probe ' + JSON.stringify(checks);
    })();`);
    const probe = await until(snapshot, (s) =>
      s.tabs[0].title.startsWith("Station probe "),
    );
    const checks = JSON.parse(
      probe.tabs[0].title.slice("Station probe ".length),
    );
    assert(
      Object.values(checks).every(Boolean) && Object.keys(checks).length === 7,
      "Native isolation probe failed.",
    );
    await until(snapshot, (s) => s.tabs[0].error.includes("Download blocked"));
    service.perform(lease, session.id, {
      type: "navigate",
      tab: "example",
      url: "https://example.org/",
    });
    await until(
      snapshot,
      (s) =>
        !s.tabs[0].loading &&
        s.tabs[0].url === "https://example.org/" &&
        s.tabs[0].back,
    );
    service.perform(lease, session.id, { type: "back", tab: "example" });
    await until(
      snapshot,
      (s) =>
        !s.tabs[0].loading &&
        s.tabs[0].url === "https://example.com/" &&
        s.tabs[0].forward,
    );
    service.perform(lease, session.id, { type: "forward", tab: "example" });
    await until(
      snapshot,
      (s) => !s.tabs[0].loading && s.tabs[0].url === "https://example.org/",
    );
    service.perform(lease, session.id, { type: "reload", tab: "example" });
    await until(
      snapshot,
      (s) => !s.tabs[0].loading && s.tabs[0].title === "Example Domain",
    );
    service.perform(lease, session.id, { type: "stop", tab: "example" });
    return {
      passed: true,
      sites: loaded.tabs.map((t) => ({ url: t.url, title: t.title })),
      checks,
      navigation: true,
      downloadsDenied: true,
      retainedViews: true,
      zoomBounds: [0.8, 1, 1.25, 1.5],
    };
  } finally {
    clearInterval(renew);
    service.revoke(lease);
    assert(
      views.slice(firstView).every((view) => !view.ptr),
      "Revocation left a native view alive.",
    );
  }
}

import { BrowserView, type BrowserWindow, PATHS } from "electrobun/main";
import { CString, dlopen, FFIType } from "bun:ffi";
import { join } from "node:path";
import type { BrowserTab } from "@station/capabilities";
import type { NativeBrowserDriver } from "./browser-service";
import { browserUrl } from "../src/core/browser-policy";
import { nativeBrowserFrame } from "./browser-geometry";

/** Private controller seam for the pinned, rebuilt Electrobun wrapper. Root
 * remains sandboxed; foreign BrowserViews receive neither preload nor bridges.
 * ABI presence is required before exposing availability. Nothing here is part
 * of the public capability: only serializable operations and status cross it.
 */
export function nativeBrowserDriver(
  root: () => BrowserWindow | undefined,
  observeCreated?: (view: BrowserView) => void,
): NativeBrowserDriver | undefined {
  if (process.platform !== "win32") return;
  const library = dlopen(
    join(PATHS.RESOURCES_FOLDER, "../bin/libNativeWrapper.dll"),
    {
      stationBrowserABI: { args: [], returns: FFIType.i32 },
      stationBrowserSnapshot: { args: [FFIType.ptr], returns: FFIType.ptr },
      stationBrowserFree: { args: [FFIType.ptr], returns: FFIType.void },
      stationBrowserStop: { args: [FFIType.ptr], returns: FFIType.void },
      stationBrowserAddressTarget: {
        args: [FFIType.ptr, FFIType.ptr],
        returns: FFIType.void,
      },
      resizeWebview: {
        args: [
          FFIType.ptr,
          FFIType.f64,
          FFIType.f64,
          FFIType.f64,
          FFIType.f64,
          FFIType.cstring,
        ],
        returns: FFIType.void,
      },
      webviewSetHidden: {
        args: [FFIType.ptr, FFIType.bool],
        returns: FFIType.void,
      },
      webviewSetPassthrough: {
        args: [FFIType.ptr, FFIType.bool],
        returns: FFIType.void,
      },
      webviewGoBack: { args: [FFIType.ptr], returns: FFIType.void },
      webviewGoForward: { args: [FFIType.ptr], returns: FFIType.void },
      webviewReload: { args: [FFIType.ptr], returns: FFIType.void },
    },
  );
  const native = library.symbols;
  if (native.stationBrowserABI() !== 1)
    throw new Error("Station browser native ABI mismatch.");
  return {
    create(input) {
      const window = root();
      if (!window) throw new Error("Station browser window is unavailable.");
      const url = browserUrl(input);
      const view = new BrowserView({
        windowId: window.id,
        hostWebviewId: window.webview.id,
        renderer: "native",
        sandbox: true,
        preload: null,
        allowedProtocols: { views: false, appData: false },
        // Native policy selects an InPrivate controller before the first URL.
        // This host-owned identity is never imported from desk configuration.
        partition: `station-private-${crypto.randomUUID()}`,
        startTransparent: true,
        startPassthrough: true,
        autoResize: false,
        frame: { x: 0, y: 0, width: 1, height: 1 },
        url,
      });
      native.stationBrowserAddressTarget(view.ptr, window.webview.ptr);
      observeCreated?.(view);
      let closed = false;
      const pointer = () => {
        if (closed || !view.ptr) throw new Error("Browser view is closed.");
        return view.ptr;
      };
      return {
        snapshot() {
          const value = native.stationBrowserSnapshot(pointer());
          if (!value) throw new Error("Browser native status failed.");
          try {
            return {
              url,
              title: "",
              loading: true,
              back: false,
              forward: false,
              error: "",
              ...JSON.parse(new CString(value).toString()),
            } as Omit<BrowserTab, "id">;
          } finally {
            native.stationBrowserFree(value);
          }
        },
        navigate(value) {
          view.loadURL(browserUrl(value));
        },
        command(type) {
          const ptr = pointer();
          if (type === "stop") native.stationBrowserStop(ptr);
          else if (type === "back") native.webviewGoBack(ptr);
          else if (type === "forward") native.webviewGoForward(ptr);
          else native.webviewReload(ptr);
        },
        present(frame) {
          const ptr = pointer();
          const bounds = nativeBrowserFrame(
            frame,
            window.webview.getPageZoom(),
          );
          native.webviewSetHidden(ptr, true);
          native.webviewSetPassthrough(ptr, true);
          native.resizeWebview(
            ptr,
            bounds.x,
            bounds.y,
            Math.max(1, bounds.width),
            Math.max(1, bounds.height),
            new TextEncoder().encode("[]\0"),
          );
          if (frame.visible) {
            native.webviewSetPassthrough(ptr, false);
            native.webviewSetHidden(ptr, false);
          }
        },
        dispose() {
          if (closed) return;
          closed = true;
          view.remove();
        },
      };
    },
  };
}

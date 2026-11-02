import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  BuildConfig,
  GlobalShortcut,
  type BrowserView,
  PATHS,
  Screen,
  Tray,
  Updater,
  Utils,
} from "electrobun/main";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createStationApi } from "../server/station-server";
import { createVectorcraftResources } from "../server/vectorcraft-resources";
import { createDesktopUpdates } from "./update-service";
import { createUpdateHttp } from "./update-http";
import { updateLabel } from "../src/contracts/desktop-updates";
import { createBrowserService } from "./browser-service";
import { createBrowserHttp } from "./browser-http";
import { nativeBrowserDriver } from "./browser-native";
import { desktopProfile } from "./profile";
import { registerWindowsCli } from "./windows-cli";
import { createNativeShortcuts, createShortcutHttp } from "./shortcut-service";
import { createLauncher, createLauncherHttp } from "./launcher-service";
import { createControlBroker } from "../server/control-broker";
import { desktopRootBootstrap } from "./root-bootstrap";
import { z } from '@station/protocol';

/** Electrobun 2.0.3-beta.26 is pinned in package.json/hutch.config.ts. Its sandboxed
 * root has no webview tags, so browser control uses the authenticated HTTP seam.
 * The reproducible native patch removes unsafe upstream flags and installs
 * browser policy before navigation. The public capability never returns views.
 * See docs/native-browser.md for the adapter acceptance contract.
 */
const browserTestViews: BrowserView[] | undefined = Bun.env.STATION_BROWSER_VERIFY === "1" ? [] : undefined;
const browsers = createBrowserService(nativeBrowserDriver(() => window, view => browserTestViews?.push(view)));
const browserExpiry = setInterval(() => {
  try { browsers.expire(); } catch { console.error("Browser expiry cleanup failed."); }
}, 1000);

const resources = join(PATHS.RESOURCES_FOLDER, "app/station");
const vectorcraftResources = createVectorcraftResources(join(resources, "runtime/vectorcraft"));
const profileSettings = await Bun.file(join(resources, "runtime/profile.json")).json();
const development = BuildConfig.getSync().channel === "dev" && profileSettings.development === true;
const profile = desktopProfile(profileSettings.acceptance === true, development);
// Only an explicitly prepared dev channel imports checkout HTML. Bun owns its
// frontend HMR websocket; APIs and root credentials stay in this native process.
const verifyPrograms=profileSettings.acceptance===true&&Bun.env.STATION_PROGRAMS_VERIFY==='1';
const data = Utils.paths.userData;
await mkdir(data, { recursive: true });
const envFile = Bun.file(join(data, ".env"));
if (await envFile.exists()) {
  for (const line of (await envFile.text()).split(/\r?\n/)) {
    const match = line.match(
      /^(VERCEL_AUTH_TOKEN|VERCEL_OIDC_TOKEN)\s*=\s*(.*)$/,
    );
    if (match)
      Bun.env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}
const token = crypto.randomUUID();
const api = createStationApi({
  artifactDir: join(data, "artifacts"),
  sandboxConfig: join(resources, "runtime/vercel-sandbox.json"),
  translator: join(resources, "runtime/translator.wasm"),
  worker: join(resources, "runtime/component-worker.js"),
  scriptingDir:join(resources,'runtime/scripting'),
}, token);
let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let stopped = false;
let quitting = false;
let shutdown: Promise<unknown> | undefined;
let server: ReturnType<typeof Bun.serve>;

/** Hide never disposes work. Final quit/handoff disposes once; native quit owns child views. */
function cleanup() {
  if (stopped) return shutdown;
  stopped = true;
  quitting = true;
  if (timer) clearInterval(timer);
  updates.dispose();
  shortcuts.clear();
  launcher.restore();
  clearInterval(shortcutExpiry);
  agentControl.dispose();
  clearInterval(browserExpiry);
  try { browsers.dispose(); } catch { console.error("Browser shutdown cleanup failed."); }
  shutdown = Promise.allSettled([api.dispose(), server?.stop(true)]);
  tray?.remove();
  void shutdown.finally(() => window?.close());
  return shutdown;
}
const updates = createDesktopUpdates(Updater, {
  enabled: profileSettings.updatesEnabled === true,
  async confirm() {
    const { response } = await Utils.showMessageBox({
      title: "Restart Station",
      message: "Restart and install the downloaded update?",
      detail:
        "Active chats, builds and Component runs will end. Saved workspaces and grants are kept.",
      buttons: ["Restart to update", "Later"],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) return false;
    // Stop backend work before the pinned updater arms its post-exit helper.
    // Failed helper setup keeps the API and the same visible WebView usable.
    await api.cancelPending();
    return true;
  },
  ready() {
    Utils.showNotification({
      title: "Station update ready",
      body: "Restart to update from Settings or the Station tray when ready.",
    });
  },
  handoff() {
    void cleanup();
  },
});
const agentControl = createControlBroker(token, profile.origin, join(data, "agent-control"));
const updateHttp = createUpdateHttp(token, updates, profile.origin);
const browserHttp = createBrowserHttp(token, browsers, profile.origin);
const launcher = createLauncher(() => window, Date.now, () => {
  const point = Screen.getCursorScreenPoint();
  return (Screen.getAllDisplays().find(display => point.x >= display.bounds.x && point.x < display.bounds.x + display.bounds.width && point.y >= display.bounds.y && point.y < display.bounds.y + display.bounds.height) ?? Screen.getPrimaryDisplay()).workArea;
});
const launcherHttp = createLauncherHttp(token, profile.origin, launcher);
const dismissLauncher = () => window?.webview.executeJavascript('window.dispatchEvent(new Event("station:launcher-dismiss"))');
const shortcuts = createNativeShortcuts(GlobalShortcut, id => {
  if (quitting || !window) return;
  launcher.arm();
  show();
  // Fixed app event; IDs are bounded configuration, never executable source.
  window.webview.executeJavascript(`window.dispatchEvent(new CustomEvent("station:native-shortcut",{detail:${JSON.stringify(id)}}))`);
});
const shortcutHttp = createShortcutHttp(token, profile.origin, shortcuts);
const shortcutExpiry = setInterval(() => { shortcuts.expire(); if (launcher.expire()) dismissLauncher(); }, 1000);
const html = development ? "" : (await Bun.file(join(resources, "index.html")).text()).replace(
  "<head>",
  '<head><meta name="station-native-root" content="1">',
);
// Pin upstream metadata while still in the packaged bin directory. Bun's HMR
// project root must be the checkout, otherwise it refuses to watch source files.
if (development) { await Updater.getLocalInfo(); process.chdir(join(profileSettings.sourceDirectory, "../..")); }
const devHtml = development ? (await import(join(profileSettings.sourceDirectory, "desktop/index.html"))).default : undefined;
try {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: profile.port,
    development: development ? { hmr: true, console: true } : false,
    ...(devHtml ? { routes: { "/": devHtml } } : {}),
    async fetch(request) {
      const url = new URL(request.url);
      if (
        url.origin !== profile.origin ||
        request.headers.get("host") !== new URL(profile.origin).host
      )
        return new Response("Forbidden", { status: 403 });
      const vectorcraft = await vectorcraftResources(request);
      if (vectorcraft) return vectorcraft;
      if (url.pathname === "/api/desktop/browser") return browserHttp(request);
      if (url.pathname === "/api/desktop/shortcuts") return shortcutHttp(request);
      if (url.pathname === "/api/desktop/launcher") return launcherHttp(request);
      // A per-launch supervisor secret can only quit this explicitly prepared
      // dev process. It is never exposed to the renderer, tasks or installed apps.
      if (url.pathname === "/api/desktop/dev/quit") {
        if (!development || !Bun.env.STATION_DEV_SESSION || request.method !== "POST" || request.headers.get("x-station-dev-session") !== Bun.env.STATION_DEV_SESSION || request.headers.get("origin") !== profile.origin || request.headers.get("content-length") !== "0") return new Response("Forbidden", { status: 403 });
        setTimeout(quit, 20);
        return new Response(null, { status: 204 });
      }
      if(url.pathname==='/api/desktop/programs-acceptance'){
        if(!verifyPrograms||request.method!=='POST'||request.headers.get('origin')!==profile.origin||request.headers.get('sec-fetch-site')!=='same-origin'||request.headers.get('x-station-app')!==token)return new Response('Unavailable',{status:403});
        return request.text().then(async source=>{if(source.length>8192)return new Response('Limit',{status:413});const report=z.object({passed:z.boolean(),rendered:z.boolean(),interactive:z.boolean(),deniedSource:z.boolean(),serviceStopped:z.boolean(),engineSha256:z.string().max(64),error:z.string().max(2048)}).strict().parse(JSON.parse(source));await Bun.write(join(data,'program-acceptance.json'),JSON.stringify(report,null,2));return Response.json({saved:true});});
      }
      if (url.pathname.startsWith("/api/control/")) return agentControl.fetch(request);
      if (url.pathname.startsWith("/api/desktop/")) return updateHttp(request);
      if (url.pathname === "/")
        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "no-store",
            "Content-Security-Policy": "frame-ancestors 'none'",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
          },
        });
      return api(request);
    },
  });
} catch (error) {
  await Utils.showMessageBox({
    type: "error",
    title: "Station",
    message: "Station could not start.",
    detail:
      `Close any other Station window and try again. Port ${profile.port} must be available.`,
  });
  console.error(error);
  Utils.quit();
  throw error;
}
function show() {
  if (quitting || !window) return;
  window.unminimize();
  window.show();
  window.activate();
}
function quit() {
  quitting = true;
  Utils.quit();
}
window = new BrowserWindow({
  title: development ? "Station Development" : "Station",
  url: server.url.toString(),
  renderer: "native",
  sandbox: true,
  frame: { width: 1440, height: 960, x: 80, y: 60 },
  // External documents never replace the trusted app; guests retain their own sandbox.
  navigationRules: JSON.stringify(["^*", `${profile.origin}/`]),
});
window.webview.on("will-navigate", () => {
  launcher.restore();
  shortcuts.clear();
  agentControl.dispose();
  // A root document reload ends every renderer lease before the new document
  // can restore configuration. A navigation signal may revoke, never grant.
  try { browsers.dispose(); } catch { console.error("Browser reload cleanup failed."); }
});
// Native NavigationCompleted emits did-navigate even with preloads/RPC disabled.
window.webview.on("did-navigate", () => {
  window?.webview.executeJavascript(desktopRootBootstrap(profile.origin, token,verifyPrograms));
});
if (browserTestViews) {
  let tested = false;
  window.webview.on("did-navigate", () => {
    if (tested) return;
    tested = true;
    void import("./browser-acceptance").then(async ({ verifyInstalledBrowser }) => {
      let report;
      try { report = await verifyInstalledBrowser(browsers, browserTestViews, window!); }
      catch (error) { report = { passed: false, error: error instanceof Error ? error.message : String(error) }; }
      await Bun.write(join(data, "browser-acceptance.json"), JSON.stringify(report, null, 2));
    });
  });
}
window.on("will-close", (event) => {
  if (quitting) return;
  const close = event as { response: { allow: boolean } };
  if (launcher.active) { close.response = { allow: false }; launcher.restore(); dismissLauncher(); return; }
  if (tray?.id && tray.visible) {
    close.response = { allow: false };
    window!.hide();
  }
});
window.on("close", () => {
  if (!stopped) quit();
});
Electrobun.events.on("before-quit", (event) => {
  // applyUpdate asks approval BEFORE helper arming. A failed handoff must stay usable.
  if (updates.getSnapshot().phase !== "applying" && !stopped) {
    event.response = { allow: false };
    void Promise.resolve(cleanup()).finally(() => {
      Utils.quit();
    });
  }
});
process.on("exit", () => {
  if (!stopped) cleanup();
});

async function action(name: string) {
  if (name === "show") { if (launcher.restore()) dismissLauncher(); show(); }
  if (name === "quit") quit();
  if (name === "check-update") await updates.check();
  if (name === "apply-update") await updates.apply();
  if (name === "open-data") Utils.openPath(data);
}
function refreshMenu() {
  const state = updates.getSnapshot();
  const enabled = ![
    "unsupported",
    "checking",
    "downloading",
    "applying",
    "ready",
  ].includes(state.phase);
  const items: Parameters<Tray["setMenu"]>[0] = [
    { type: "normal", label: "Show Station", action: "show" },
    { type: "normal", label: updateLabel(state), enabled: false },
    {
      type: "normal",
      label:
        state.phase === "error" ? "Retry update check" : "Check for updates",
      action: "check-update",
      enabled,
    },
    ...(state.phase === "ready" || state.phase === "applying"
      ? [
          {
            type: "normal" as const,
            label:
              state.phase === "applying" ? "Restarting…" : "Restart to update",
            action: "apply-update",
            enabled: state.phase === "ready",
          },
        ]
      : []),
    { type: "normal", label: "Open Station data folder", action: "open-data" },
    { type: "divider" as const },
    { type: "normal", label: "Quit", action: "quit" },
  ];
  ApplicationMenu.setApplicationMenu([
    { label: "Station", submenu: items },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "divider" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
  ]);
  try {
    tray?.setMenu(items);
  } catch (error) {
    console.error("Station tray menu:", error);
    tray?.remove();
    tray = undefined;
    show();
  }
}
try {
  tray = new Tray({
    title: "Station",
    image: join(resources, "runtime/station.ico"),
    template: false,
  });
  if (!tray.id || !tray.visible) throw new Error("Native tray is unavailable.");
  refreshMenu();
  tray.on("tray-clicked", (event) => {
    void action((event as { data: { action: string } }).data.action || "show");
  });
} catch (error) {
  tray?.remove();
  tray = undefined;
  console.error("Station tray:", error);
  show();
  void Utils.showMessageBox({
    title: "Station tray unavailable",
    message:
      "Station will quit when its window closes. You can reopen it from the Start menu.",
  });
}
Electrobun.events.on("application-menu-clicked", (event) => {
  void action(event.data.action);
});
updates.subscribe(refreshMenu);
// Electrobun has build hooks, not an installed-user hook. Register only after a
// real installed app starts successfully; dev/checkout bundles cannot claim PATH.
void registerWindowsCli({
  platform: process.platform,
  channel: BuildConfig.getSync().channel,
  development: profileSettings.development === true,
  acceptance: profileSettings.acceptance === true,
  executable: process.execPath,
  localAppData: process.env.LOCALAPPDATA,
  resources,
}).catch(error => console.error("Station CLI registration:", error));
await updates.initialize();
refreshMenu();
if (profileSettings.updatesEnabled === true) {
  void updates.check();
  timer = setInterval(() => void updates.check(), 5 * 60_000);
}

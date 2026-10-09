import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  PATHS,
  Updater,
  Utils,
} from "electrobun/main";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createStationApi } from "../station-server";

const resources = join(PATHS.RESOURCES_FOLDER, "app/station");
const data = Utils.paths.userData;
await mkdir(data, { recursive: true });
// Optional user-owned backend credentials, outside the install/update directory.
const envFile = Bun.file(join(data, ".env"));
if (await envFile.exists()) {
  const env = Bun.env; // Bun's .env parser is not exposed as a public API.
  for (const line of (await envFile.text()).split(/\r?\n/)) {
    const match = line.match(
      /^(VERCEL_AUTH_TOKEN|VERCEL_OIDC_TOKEN)\s*=\s*(.*)$/,
    );
    if (match) env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}
const api = createStationApi({
  artifactDir: join(data, "artifacts"),
  sandboxConfig: join(resources, "runtime/vercel-sandbox.json"),
  translator: join(resources, "runtime/translator.wasm"),
  worker: join(resources, "runtime/component-worker.js"),
});
// A fixed desktop origin preserves localStorage across launches and updates.
// Fail on a collision rather than opening another process's content or changing origin.
let server: ReturnType<typeof Bun.serve>;
try {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 43157,
    development: false,
    fetch(request) {
      if (new URL(request.url).pathname === "/")
        return new Response(Bun.file(join(resources, "index.html")), {
          headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
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
      "Close any other Station window and try again. Port 43157 must be available.",
  });
  console.error(error);
  Utils.quit();
  throw error;
}

new BrowserWindow({
  title: "Station",
  url: server.url.toString(),
  renderer: "native",
  sandbox: true,
  frame: { width: 1440, height: 960, x: 80, y: 60 },
});

let checking = false;
function refreshMenu() {
  ApplicationMenu.setApplicationMenu([
    {
      label: "Station",
      submenu: [
        {
          label: checking ? "Checking for updates…" : "Check for updates",
          action: "check-update",
          enabled: !checking,
        },
        {
          label: "Restart to update",
          action: "apply-update",
          enabled: Updater.updateInfo().updateReady,
        },
        { label: "Open Station data folder", action: "open-data" },
        { type: "divider" },
        { role: "quit" },
      ],
    },
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
}

/** Download automatically; applying an update always requires a user action. */
async function checkForUpdates(manual = false) {
  if (checking) return;
  checking = true;
  refreshMenu();
  try {
    const update = await Updater.checkForUpdate();
    if (update.error) throw new Error(update.error);
    if (update.updateAvailable && !Updater.updateInfo().updateReady) {
      await Updater.downloadUpdate();
      if (!Updater.updateInfo().updateReady)
        throw new Error(
          Updater.updateInfo().error ?? "Update download did not complete.",
        );
      Utils.showNotification({
        title: "Station update ready",
        body: "Choose Station → Restart to update when you're ready.",
      });
    }
    if (manual)
      await Utils.showMessageBox({
        title: "Station updates",
        message: Updater.updateInfo().updateReady
          ? "An update is ready. Choose Station → Restart to update."
          : "Station is up to date.",
      });
  } catch (error) {
    console.error("Station update check:", error);
    if (manual)
      await Utils.showMessageBox({
        type: "error",
        title: "Station updates",
        message: "Could not check for updates. Try again shortly.",
        detail: error instanceof Error ? error.message : String(error),
      });
  } finally {
    checking = false;
    refreshMenu();
  }
}

Electrobun.events.on("application-menu-clicked", async (event) => {
  if (event.data.action === "check-update") await checkForUpdates(true);
  if (event.data.action === "open-data") Utils.openPath(data);
  if (
    event.data.action === "apply-update" &&
    Updater.updateInfo().updateReady
  ) {
    const { response } = await Utils.showMessageBox({
      title: "Restart Station",
      message: "Restart and install the downloaded update?",
      detail:
        "Active chats and Component runs will end. Saved workspaces are kept.",
      buttons: ["Restart to update", "Later"],
      defaultId: 1,
      cancelId: 1,
    });
    if (response === 0) await Updater.applyUpdate();
  }
});
refreshMenu();
void checkForUpdates();
setInterval(() => void checkForUpdates(), 5 * 60_000);

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { watch, type FSWatcher } from "node:fs";

/** One owner for preparation, CSS and the native watcher. Native development
 * always uses a separate identity, origin and persistent WebView2 profile. */
const cwd = resolve(import.meta.dir, "..");
const devSession = crypto.randomUUID();
const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: "development", STATION_DESKTOP_DEV: "1", STATION_DEV_SESSION: devSession };
if (env.STATION_DESKTOP_ACCEPTANCE === "1") throw new Error("Unset STATION_DESKTOP_ACCEPTANCE before desktop:dev");
// Fail before expensive builds. Never connect to or stop a port's other owner.
try { const probe = Bun.listen({ hostname: "127.0.0.1", port: 43159, socket: { data() {} } }); probe.stop(true); }
catch { throw new Error("Station Development port 43159 is busy. Quit that development instance before starting another."); }
const children = new Set<ReturnType<typeof Bun.spawn>>();
let stopping = false;
let shutdown: Promise<void> | undefined;
const watchers: FSWatcher[] = [];
const fingerprints = new Map<string, string>();
const changedPaths = new Set<string>();
let pending: ReturnType<typeof setTimeout> | undefined;
const fingerprint = async (path: string) => {
  const file = Bun.file(path);
  return await file.exists() ? new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex") : "missing";
};
async function quitNative() {
  await fetch("http://127.0.0.1:43159/api/desktop/dev/quit", { method: "POST", headers: { "x-station-dev-session": devSession, origin: "http://127.0.0.1:43159", "content-length": "0" }, signal: AbortSignal.timeout(2000) });
}
function stop() {
  return shutdown ??= (async () => {
    stopping = true; for (const watcher of watchers) watcher.close(); if (pending) clearTimeout(pending);
    await quitNative().catch(() => {});
    // Allow owned API/build/scope cleanup before stopping the watcher parents.
    for (let i = 0; i < 30; i++) { try { const probe = Bun.listen({ hostname: "127.0.0.1", port: 43159, socket: { data() {} } }); probe.stop(true); break; } catch { await Bun.sleep(100); } }
    for (const child of children) if (child.exitCode === null) {
      if (process.platform === "win32") Bun.spawnSync(["taskkill", "/PID", String(child.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore", windowsHide: true });
      else child.kill();
    }
  })();
}
process.once("SIGINT", () => void stop()); process.once("SIGTERM", () => void stop());
function spawn(args: string[]) {
  const child = Bun.spawn(args, { cwd, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  children.add(child); void child.exited.then(() => children.delete(child)); return child;
}
try {
  for (const script of ["prepare:web", "styles", "scripts/embed-sample-source.ts", "scripts/prepare-desktop.ts", "scripts/build-browser-native.ts"]) {
    const code = await spawn([process.execPath, ...(script.startsWith("scripts/") ? [script] : ["run", script])]).exited;
    if (stopping) break;
    if (code !== 0) throw new Error(`${script} failed (exit ${code})`);
  }
  if (!stopping) {
    const require = createRequire(import.meta.url);
    const tailwind = join(dirname(require.resolve("@tailwindcss/cli/package.json")), "dist/index.mjs");
    const css = spawn([process.execPath, tailwind, "-i", "src/ui/tailwind.css", "-o", "src/ui/generated.css", "--watch=always"]);
    const directories = ["desktop", "server", "src/contracts", "src/core", "src/features"];
    // Windows can emit metadata notifications when the bundler opens a source
    // file. Snapshot bytes before launch; only actual source changes may quit it.
    for (const directory of directories) for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: join(cwd, directory), absolute: true })) fingerprints.set(file, await fingerprint(file));
    for (const directory of directories) watchers.push(watch(join(cwd, directory), { recursive: true }, (_event, file) => {
      if (!file?.endsWith(".ts") || stopping) return;
      changedPaths.add(resolve(cwd, directory, file));
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { void (async () => {
        const paths = [...changedPaths]; changedPaths.clear();
        let changed = false;
        for (const path of paths) { const next = await fingerprint(path); if (next !== fingerprints.get(path)) changed = true; fingerprints.set(path, next); }
        if (changed && !stopping) { console.info("Native source changed; gracefully quitting the owned dev window for Electrobun to rebuild."); await quitNative().catch(() => {}); }
      })().catch(error => console.error("Development source check failed", error)); }, 400);
    }));
    const native = spawn([process.execPath, "x", "electrobun", "dev", "--watch"]);
    console.info("Station Development: http://127.0.0.1:43159 — native WebView2, frontend HMR, CSS watching, backend rebuild/restart. Quit from the tray when finished.");
    const code = await Promise.race([css.exited, native.exited]);
    if (!stopping) process.exitCode = code;
  }
} finally { await stop(); await Promise.allSettled([...children].map(child => child.exited)); }

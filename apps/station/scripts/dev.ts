import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

/** Own the server and CSS watcher together. Development never inherits production
 * mode, and Ctrl+C or either watcher failing stops the other owned children.
 */
const app = resolve(import.meta.dir, ".."), root = resolve(app, "../..");
const children = new Set<ReturnType<typeof Bun.spawn>>();
const env = { ...process.env, NODE_ENV: "development" };
let stopping = false;
function stop() {
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
function spawn(args: string[], cwd = app) {
  const child = Bun.spawn(args, { cwd, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  children.add(child);
  void child.exited.then(() => children.delete(child));
  return child;
}
async function run(script: string) {
  const code = await spawn([process.execPath, "run", script]).exited;
  if (stopping) return false;
  if (code !== 0) throw new Error(`${script} failed (exit ${code})`);
  return true;
}
try {
  if (await run("prepare:web") && await run("styles")) {
    const require = createRequire(import.meta.url);
    const tailwind = join(dirname(require.resolve("@tailwindcss/cli/package.json")), "dist/index.mjs");
    const css = spawn([process.execPath, tailwind, "-i", "src/ui/tailwind.css", "-o", "src/ui/generated.css", "--watch=always"]);
    const server = spawn([process.execPath, "--watch", "apps/station/server/server.ts"], root);
    console.info("Station development: UI HMR and Tailwind watching enabled. Use the exact URL printed by the server; bun start is a separate non-watching entry.");
    const code = await Promise.race([css.exited, server.exited]);
    if (!stopping) { process.exitCode = code || 1; console.error(`A development process exited (${code}); stopping its companion watcher.`); }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stop();
  await Promise.allSettled([...children].map(child => child.exited));
}

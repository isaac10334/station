import { Sandbox } from "@vercel/sandbox";
import { writeFile } from "node:fs/promises";

const token = process.env.VERCEL_AUTH_TOKEN;
if (!token && !process.env.VERCEL_OIDC_TOKEN)
  throw new Error("Vercel authentication is missing. Run vercel link and vercel env pull.");
const configUrl = new URL("../vercel-sandbox.json", import.meta.url);
const config = await Bun.file(configUrl).json() as {
  teamId: string; projectId: string; snapshotId: string; toolchain: string;
};
const sandbox = await Sandbox.create({
  ...(token ? { token, teamId: config.teamId, projectId: config.projectId } : {}),
  source: { type: "snapshot", snapshotId: config.snapshotId },
  timeout: 15 * 60_000, persistent: false, networkPolicy: "allow-all",
  tags: { purpose: "unit-workspace-dependencies" },
});

async function command(cmd: string, args: string[], cwd = "/vercel/unit") {
  const result = await sandbox.runCommand({ cmd, args, cwd, stdout: process.stdout, stderr: process.stderr });
  if (result.exitCode !== 0) throw new Error(`${cmd} failed with exit code ${result.exitCode}`);
}

try {
  await command("sudo", ["apt-get", "update", "-qq"], "/vercel");
  await command("sudo", ["apt-get", "install", "-y", "-qq", "build-essential"], "/vercel");
  await sandbox.mkDir("/vercel/unit");
  await sandbox.mkDir("/vercel/unit/src");
  await sandbox.mkDir("/vercel/unit/wit");
  await sandbox.mkDir("/vercel/unit/wit/deps");
  await sandbox.mkDir("/vercel/unit/wit/deps/wasi-clocks");
  const paths = ["Cargo.toml", "Cargo.lock", "src/lib.rs", "wit/world.wit", "wit/deps/wasi-clocks/monotonic-clock.wit", "wit/deps/wasi-clocks/types.wit"];
  await sandbox.writeFiles(await Promise.all(paths.map(async (path) => ({
    path: `/vercel/unit/${path}`,
    content: Buffer.from(await Bun.file(new URL(`../components/greeting/${path}`, import.meta.url)).arrayBuffer()),
  }))));
  await command("/vercel/.cargo/bin/cargo", ["+nightly-2026-09-08", "fetch", "--locked", "--target", "wasm32-wasip2", "--manifest-path", "/vercel/unit/Cargo.toml"]);
  await sandbox.update({ networkPolicy: "deny-all" });
  await command("/vercel/.cargo/bin/cargo", ["+nightly-2026-09-08", "build", "--release", "--offline", "--locked", "--target", "wasm32-wasip2", "--manifest-path", "/vercel/unit/Cargo.toml"]);
  const output = await sandbox.readFileToBuffer({ path: "target/wasm32-wasip2/release/greeting.wasm", cwd: "/vercel/unit" });
  if (!output || output.byteLength < 8) throw new Error("Sample Component build produced no bytes.");
  console.log(`Sandbox sample build: ${output.byteLength} bytes`);
  await command("rm", ["-rf", "/vercel/unit"], "/vercel");
  const snapshot = await sandbox.snapshot({ expiration: 30 * 24 * 60 * 60_000 });
  config.snapshotId = snapshot.snapshotId;
  await writeFile(configUrl, JSON.stringify(config, null, 2) + "\n");
  console.log(`Build-ready snapshot: ${snapshot.snapshotId}`);
} finally {
  await sandbox.delete();
}

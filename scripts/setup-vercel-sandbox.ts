import { Sandbox } from "@vercel/sandbox";
import { writeFile } from "node:fs/promises";

const token = process.env.VERCEL_AUTH_TOKEN;
if (!token && !process.env.VERCEL_OIDC_TOKEN)
  throw new Error("Vercel authentication is missing. Run vercel link and vercel env pull.");

const teamId = "team_JVoYCgv0HQNBHmoIKBk25D4j";
const projectId = "prj_My7GAEBPFmWJDLjBAFHAjzhV3sv1";
const sandbox = await Sandbox.create({
  ...(token ? { token, teamId, projectId } : {}),
  image: "vercel/sandbox/universal:latest",
  timeout: 40 * 60_000,
  persistent: false,
  networkPolicy: "allow-all",
  tags: { purpose: "unit-workspace-toolchain" },
});

async function run(command: string) {
  const result = await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", command],
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (result.exitCode !== 0) throw new Error(`Sandbox command failed (${result.exitCode}): ${command}`);
}

try {
  await run("sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq build-essential");
  await run("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal");
  await run("$HOME/.cargo/bin/rustup toolchain install nightly-2026-09-08 --profile minimal");
  await run("$HOME/.cargo/bin/rustup target add wasm32-wasip2 --toolchain nightly-2026-09-08");
  const versions = await sandbox.runCommand("sh", ["-lc", "$HOME/.cargo/bin/rustc +nightly-2026-09-08 --version && $HOME/.cargo/bin/cargo +nightly-2026-09-08 --version"]);
  if (versions.exitCode !== 0) throw new Error(await versions.stderr());
  const toolchain = `${(await versions.stdout()).trim()}\nwasm32-wasip2\nwit-bindgen 0.60.0; wasi-clocks 0.3.1`;
  console.log(toolchain);
  const snapshot = await sandbox.snapshot({ expiration: 30 * 24 * 60 * 60_000 });
  await writeFile(new URL("../vercel-sandbox.json", import.meta.url), JSON.stringify({
    teamId,
    projectId,
    snapshotId: snapshot.snapshotId,
    toolchain,
  }, null, 2) + "\n");
  console.log(`Toolchain snapshot: ${snapshot.snapshotId}`);
} finally {
  await sandbox.delete();
}

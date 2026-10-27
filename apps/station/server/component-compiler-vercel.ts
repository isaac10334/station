import { Sandbox } from "@vercel/sandbox";
import { BuildFailure, type BuildSource } from "../src/core/build-contract";
import type { ComponentBuildPaths } from "./component-build";
const MAX_ARTIFACT_BYTES = 5_000_000;
/** Legacy Vercel compiler adapter. It does not inspect or publish artifacts. */
export async function compileWithVercel(source: BuildSource, paths: ComponentBuildPaths, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const configFile = Bun.file(paths.sandboxConfig);
  if (!(await configFile.exists()))
    throw new BuildFailure(
      "Sandbox toolchain is not provisioned. Run bun run setup:sandbox.",
      503,
    );
  const { teamId, projectId, snapshotId, toolchain } =
    (await configFile.json()) as Record<string, string>;
  const token = process.env.VERCEL_AUTH_TOKEN;
  if (!token && !process.env.VERCEL_OIDC_TOKEN)
    throw new BuildFailure(
      "Vercel Sandbox authentication is missing. Run vercel link and vercel env pull.",
      503,
    );
  const sandbox = await Sandbox.create({
    ...(token ? { token, teamId, projectId } : {}),
    source: { type: "snapshot", snapshotId },
    persistent: false,
    timeout: 10 * 60_000,
    networkPolicy: "deny-all",
    tags: { purpose: "station-build", asset: source.id },
  }).catch((error) => {
    if (
      error instanceof Error &&
      /Oidc|credentials|authentication/i.test(`${error.name} ${error.message}`)
    )
      throw new BuildFailure(
        "Vercel authentication is unavailable or expired. Refresh your local Vercel login/OIDC credentials and retry.",
        503,
      );
    throw error;
  });
  let deletion: Promise<unknown> | undefined;
  const remove = () => deletion ??= sandbox.delete();
  const abort = () => { void remove().catch(console.error); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    await sandbox.mkDir("/vercel/unit");
    await sandbox.mkDir("/vercel/unit/src");
    await sandbox.mkDir("/vercel/unit/wit");
    await sandbox.mkDir("/vercel/unit/wit/deps");
    await sandbox.mkDir("/vercel/unit/wit/deps/wasi-clocks");
    await sandbox.writeFiles(
      Object.entries(source.files).map(([path, content]) => ({
        path: `/vercel/unit/${path}`,
        content: new TextEncoder().encode(content),
      })),
    );
    const result = await sandbox.runCommand({
      cmd: "/vercel/.cargo/bin/cargo",
      args: [
        "+nightly-2026-09-08",
        "build",
        "--release",
        "--offline",
        "--locked",
        "--target",
        "wasm32-wasip2",
        "--manifest-path",
        "/vercel/unit/Cargo.toml",
      ],
      cwd: "/vercel/unit",
    });
    if (result.exitCode !== 0) {
      const diagnostics = (await result.stderr()).slice(-12_000);
      throw new BuildFailure(`Component build failed:\n${diagnostics}`, 422);
    }
    const artifactPath = `target/wasm32-wasip2/release/${source.id.replaceAll("-", "_")}.wasm`;
    const output = await sandbox.readFileToBuffer({
      path: artifactPath,
      cwd: "/vercel/unit",
    });
    if (
      !output ||
      output.byteLength === 0 ||
      output.byteLength > MAX_ARTIFACT_BYTES
    )
      throw new BuildFailure(
        "Build did not produce a valid sized Component artifact.",
        422,
      );
    const bytes = new Uint8Array(output);
    return { bytes, toolchain, environmentId: snapshotId };
  } finally {
    signal?.removeEventListener("abort", abort);
    await remove();
  }
}

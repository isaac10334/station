export type BuildSource = {
  id: string;
  revision: number;
  files: Record<string, string>;
};

/** Recorded provenance for one build, not a signed attestation. Byte identity and build identity are separate. */
export type BuiltArtifact = {
  schemaVersion: 2;
  buildId: string;
  id: string;
  revision: number;
  sourceSha256: string;
  sha256: string;
  bytes: number;
  builtBy: "vercel-sandbox";
  profile: "component-model-0.3";
  worldDigest: string;
  imports: string[];
  toolchain: string;
  snapshotId: string;
  witSha256: string;
  translatorSha256: string;
};

const validId = /^[a-z][a-z0-9-]{0,62}$/;
const validPath = /^(Cargo\.(toml|lock)|src\/[a-zA-Z0-9_-]+\.rs|wit\/[a-zA-Z0-9_-]+\.wit|wit\/deps\/wasi-clocks\/(monotonic-clock|types)\.wit)$/;

export class BuildFailure extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function validateSource(value: unknown): BuildSource {
  if (!value || typeof value !== "object") throw new BuildFailure("Expected one Component source project.");
  const input = value as Partial<BuildSource>;
  if (typeof input.id !== "string" || !validId.test(input.id)) throw new BuildFailure("Invalid asset ID.");
  if (!Number.isSafeInteger(input.revision) || input.revision! < 0) throw new BuildFailure("Invalid source revision.");
  if (!input.files || typeof input.files !== "object" || Array.isArray(input.files)) throw new BuildFailure("Invalid source files.");
  const files = input.files;
  if (!files["Cargo.toml"] || !files["Cargo.lock"] || !files["src/lib.rs"] || !files["wit/world.wit"] ||
      !files["wit/deps/wasi-clocks/monotonic-clock.wit"] || !files["wit/deps/wasi-clocks/types.wit"])
    throw new BuildFailure("P3 builds require Cargo.toml, Cargo.lock, Rust source, world WIT, and the pinned WASI clocks WIT files.");
  if (Object.entries(files).some(([path, contents]) => !validPath.test(path) || typeof contents !== "string"))
    throw new BuildFailure("Only Rust, WIT, and Cargo.toml source files are accepted.");
  if (new TextEncoder().encode(JSON.stringify(files)).byteLength > 256_000)
    throw new BuildFailure("Source exceeds 256 KB.");
  const packageName = files["Cargo.toml"].match(/^\[package\]\s*\r?\n(?:[^[]*?\r?\n)*?name\s*=\s*"([a-z][a-z0-9-]*)"/m)?.[1];
  if (packageName !== input.id) throw new BuildFailure("Cargo package name must match the asset ID.");
  return { id: input.id, revision: input.revision!, files };
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Hash every editable build input, including Cargo.lock and authored WIT, in stable path order. */
export async function sourceSha256(files: Record<string, string>): Promise<string> {
  const canonical = JSON.stringify(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return sha256(new TextEncoder().encode(canonical));
}

/** Hash the exact WIT source and vendored dependencies shipped with a build. */
export async function witSha256(files: Record<string, string>): Promise<string> {
  return sourceSha256(Object.fromEntries(Object.entries(files).filter(([path]) => path.startsWith("wit/"))));
}

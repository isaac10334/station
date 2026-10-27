import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";

/** A build tool is trusted by pinned bytes, never by its cache location alone. */
export type PinnedExecutable = {
  name: string;
  url: string;
  archiveName: string;
  archiveSha256: string;
  executableSha256: string;
};
const hash = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
async function readOptional(path: string): Promise<Uint8Array | undefined> {
  try { return new Uint8Array(await readFile(path)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
function verify(bytes: Uint8Array, expected: string, path: string) {
  if (hash(bytes) !== expected) throw new Error(`Checksum mismatch: ${path}. Restore the pinned tool, or remove this cache file and retry.`);
}
async function writeAtomic(path: string, bytes: Uint8Array) {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}

/** Provision a fixed ZIP member atomically. Explicit overrides never fall back to downloads.
 * Downloads and existing cache entries must pass both archive and executable hashes.
 */
export async function ensurePinnedExecutable(spec: PinnedExecutable, options: {
  directory: string;
  override?: string;
  download?: (url: string) => Promise<Uint8Array>;
}): Promise<string> {
  const executable = options.override ?? join(options.directory, spec.name);
  const current = await readOptional(executable);
  if (current) { verify(current, spec.executableSha256, executable); return executable; }
  if (options.override) throw new Error(`Configured scripting compiler is missing: ${executable}. Fix STATION_SCRIPTING_COMPILER or unset it to use the verified tool cache.`);
  await mkdir(options.directory, { recursive: true });
  const archivePath = join(options.directory, spec.archiveName);
  let archive = await readOptional(archivePath);
  if (!archive) {
    console.info(`Preparing ${spec.name} from ${spec.url}`);
    archive = await (options.download ?? (async url => {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Compiler download failed (${response.status}): ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    }))(spec.url);
    verify(archive, spec.archiveSha256, archivePath);
    await writeAtomic(archivePath, archive);
  } else verify(archive, spec.archiveSha256, archivePath);
  const bytes = unzipSync(archive, { filter: file => file.name === spec.name })[spec.name];
  if (!bytes) throw new Error(`Pinned compiler archive is missing ${spec.name}`);
  verify(bytes, spec.executableSha256, executable);
  await writeAtomic(executable, bytes);
  return executable;
}

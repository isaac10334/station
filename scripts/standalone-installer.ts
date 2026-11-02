import { resolve } from "node:path";

export const INSTALLER_METADATA_MARKER = "ELECTROBUN_METADATA_V1";
export const INSTALLER_ARCHIVE_MARKER = "ELECTROBUN_ARCHIVE_V1";

/** Assemble the embedded format consumed by pinned Electrobun 2.0.3-beta.26's
 * package/src/extractor/main.zig:23-24,1270-1448. Its native installer first tries
 * adjacent companions, then reads this executable's metadata marker, at most
 * 4096 JSON bytes, archive marker and zstd bytes through EOF. Preserve metadata
 * and archive bytes exactly; do not append a signature or other data afterward.
 * This packages the existing installer without replacing its identity, profile,
 * uninstall, install-lock or launch behavior. Re-audit before changing the pin.
 * Installed acceptance must run the output alone in a clean directory so an
 * adjacent legacy companion cannot mask a broken embedded payload.
 */
export async function createStandaloneInstaller(setupExePath: string, outputExePath: string) {
  if (!/\.exe$/i.test(setupExePath) || resolve(setupExePath) === resolve(outputExePath))
    throw new Error("Standalone installer requires distinct input and output EXE paths");
  const stem = setupExePath.slice(0, -4);
  const inputs = [setupExePath, `${stem}.metadata.json`, `${stem}.tar.zst`];
  for (const path of inputs) {
    if (!await Bun.file(path).exists()) throw new Error(`Standalone installer input is missing: ${path}`);
  }
  const [setup, metadata, archive] = await Promise.all(inputs.map(async path => new Uint8Array(await Bun.file(path).arrayBuffer())));
  if (setup.length < 1_000_000 || setup[0] !== 77 || setup[1] !== 90 ||
      archive.length < 1_000_000 || archive.subarray(0, 4).join() !== "40,181,47,253")
    throw new Error("Standalone installer executable or archive is truncated or invalid");
  if (!metadata.length || metadata.length > 4096) throw new Error("Standalone installer metadata must contain 1-4096 bytes");
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(metadata)); }
  catch { throw new Error("Standalone installer metadata is invalid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      Object.keys(parsed).some(key => !["identifier", "name", "channel", "hash"].includes(key)) ||
      typeof parsed.identifier !== "string" || !parsed.identifier ||
      /[\x00-\x1f"%*/:<>?\\|]/.test(parsed.identifier) || /[ .]$/.test(parsed.identifier) ||
      typeof parsed.name !== "string" || !parsed.name ||
      !["stable", "canary", "dev"].includes(parsed.channel as string) ||
      (parsed.hash !== undefined && parsed.hash !== null && typeof parsed.hash !== "string"))
    throw new Error("Standalone installer metadata does not match the pinned native format");
  await Bun.write(outputExePath, new Blob([setup, INSTALLER_METADATA_MARKER, metadata, INSTALLER_ARCHIVE_MARKER, archive]));
}

if (import.meta.main) {
  const [setup, output] = process.argv.slice(2);
  if (!setup || !output) throw new Error("Usage: bun scripts/standalone-installer.ts <Setup.exe> <output.exe>");
  await createStandaloneInstaller(setup, output);
}

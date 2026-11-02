import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStandaloneInstaller, INSTALLER_METADATA_MARKER, INSTALLER_ARCHIVE_MARKER } from "../scripts/standalone-installer";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "station-standalone-"));
  const setupPath = join(directory, "Station-Setup-canary.exe");
  const outputPath = join(directory, "standalone.exe");
  const metadataPath = setupPath.replace(/\.exe$/, ".metadata.json");
  const archivePath = setupPath.replace(/\.exe$/, ".tar.zst");
  const setup = new Uint8Array(1_000_001); setup.set([77, 90]);
  const archive = new Uint8Array(1_000_001); archive.set([40, 181, 47, 253]);
  const metadata = '{\n  "identifier":"com.isaacharvey.station", "name":"Station", "channel":"canary", "hash":"abc123"\n}\n';
  await Promise.all([Bun.write(setupPath, setup), Bun.write(metadataPath, metadata), Bun.write(archivePath, archive)]);
  return { directory, setupPath, outputPath, metadataPath, archivePath, setup, archive, metadata };
}

test("standalone installer preserves exact native executable, metadata and archive bytes", async () => {
  const f = await fixture();
  try {
    await createStandaloneInstaller(f.setupPath, f.outputPath);
    const actual = new Uint8Array(await Bun.file(f.outputPath).arrayBuffer());
    const expected = new Uint8Array(await new Blob([f.setup, INSTALLER_METADATA_MARKER, f.metadata, INSTALLER_ARCHIVE_MARKER, f.archive]).arrayBuffer());
    expect(actual).toEqual(expected);
    expect(new Uint8Array(await Bun.file(f.setupPath).arrayBuffer())).toEqual(f.setup);
    await expect(createStandaloneInstaller(f.setupPath, f.setupPath)).rejects.toThrow("distinct");
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

test("standalone installer rejects missing, truncated or invalid companions before writing output", async () => {
  const f = await fixture();
  try {
    for (const path of [f.setupPath, f.metadataPath, f.archivePath]) {
      const saved = await Bun.file(path).arrayBuffer();
      await rm(path);
      await expect(createStandaloneInstaller(f.setupPath, f.outputPath)).rejects.toThrow("missing");
      await Bun.write(path, "truncated");
      await expect(createStandaloneInstaller(f.setupPath, f.outputPath)).rejects.toThrow();
      await Bun.write(path, saved);
    }
    for (const metadata of ["{}", "null", '{"identifier":"../foreign","name":"Station","channel":"canary"}', f.metadata.replace('"canary"', '"unknown"'), f.metadata.trimEnd().slice(0, -1) + ',"extra":1}', " ".repeat(4097)]) {
      await Bun.write(f.metadataPath, metadata);
      await expect(createStandaloneInstaller(f.setupPath, f.outputPath)).rejects.toThrow();
    }
    expect(await Bun.file(f.outputPath).exists()).toBe(false);
  } finally { await rm(f.directory, { recursive: true, force: true }); }
});

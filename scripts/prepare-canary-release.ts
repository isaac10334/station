import { join } from "node:path";
import { copyFile } from "node:fs/promises";
import { createStandaloneInstaller } from "./standalone-installer";

const prefix = "canary-win-x64";
export const installerName = `${prefix}-Station-Setup-canary.exe`;
export const installerZipName = `${prefix}-Station-Setup-canary.zip`;

/** Validate the channel contract before publishing any release payloads. */
export function validateCanaryManifest(value: unknown, version?: string) {
  const manifest = value as {
    schemaVersion: number; identifier: string; channel: string; platform: string;
    arch: string; version: string; hash: string; artifact: { file: string };
  };
  if (!manifest || manifest.schemaVersion !== 1 ||
      manifest.identifier !== "com.isaacharvey.station" || manifest.channel !== "canary" ||
      manifest.platform !== "win" || manifest.arch !== "x64" ||
      !/^\d+\.\d+\.\d+-canary\.\d+(?:\.\d+)?$/.test(manifest.version) ||
      (version && manifest.version !== version) || !/^[a-z0-9]+$/.test(manifest.hash) ||
      !manifest.artifact || !/^canary-win-x64-[a-zA-Z0-9.-]+\.tar\.zst$/.test(manifest.artifact.file)) {
    throw new Error("Invalid Windows canary manifest or build version");
  }
  return manifest;
}

/** Retain immutable full archives so a channel advance cannot replace an in-flight download. */
export async function prepareCanaryRelease(directory: string, version?: string,
  setupExePath = join(directory, "../build/canary-win-x64/Station-Setup-canary.exe")) {
  const metadataPath = join(directory, `${prefix}-update.json`);
  const manifest = validateCanaryManifest(await Bun.file(metadataPath).json(), version);
  const archive = Bun.file(join(directory, manifest.artifact.file));
  const installer = Bun.file(join(directory, installerZipName));
  if (!(await archive.exists()) || !(await installer.exists()))
    throw new Error("Canary archive or installer is missing");
  const archiveMagic = new Uint8Array(await archive.slice(0, 4).arrayBuffer());
  const installerMagic = new Uint8Array(await installer.slice(0, 2).arrayBuffer());
  if (archive.size < 1_000_000 || installer.size < 1_000_000 ||
      archiveMagic.join() !== "40,181,47,253" || installerMagic.join() !== "80,75")
    throw new Error("Canary archive or installer is truncated or invalid");
  const setupMetadata = await Bun.file(setupExePath.replace(/\.exe$/i, ".metadata.json")).json();
  if (setupMetadata.identifier !== manifest.identifier || setupMetadata.channel !== manifest.channel ||
      setupMetadata.name !== "Station" || setupMetadata.hash !== manifest.hash)
    throw new Error("Standalone installer identity or hash differs from the release manifest");
  await createStandaloneInstaller(setupExePath, join(directory, installerName));
  const immutableName = `${prefix}-Station-${manifest.hash}.tar.zst`;
  if (manifest.artifact.file !== immutableName)
    await copyFile(join(directory, manifest.artifact.file), join(directory, immutableName));
  await Bun.write(metadataPath, JSON.stringify({ ...manifest, artifact: { file: immutableName } }));
  console.log(`Verified ${manifest.version}; updater archive: ${immutableName}`);
}

if (import.meta.main)
  await prepareCanaryRelease(process.argv[2] ?? "apps/station/artifacts", process.env.STATION_VERSION);

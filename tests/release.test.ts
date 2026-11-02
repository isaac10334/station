import { expect, test } from "bun:test";
import { canaryInstaller, CANARY_BASE, CANARY_INSTALLER } from "../apps/site/src/canary-release";
import { validateCanaryManifest, prepareCanaryRelease, installerZipName } from "../scripts/prepare-canary-release";
import { verifySite } from "../scripts/verify-site";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const release = {
  tag_name: "canary", body: "Windows canary from abc. Archived build: canary-12-2.",
  assets: [{ name: CANARY_INSTALLER, browser_download_url: `${CANARY_BASE}/canary/${CANARY_INSTALLER}`, size: 42_000_000 }],
};
const manifest = {
  schemaVersion: 1, identifier: "com.isaacharvey.station", channel: "canary",
  platform: "win", arch: "x64", version: "0.1.0-canary.12.2", hash: "abcd1234",
  artifact: { file: "canary-win-x64-Station-canary.tar.zst" },
};

test("website uses the channel's immutable installer and retains legacy compatibility", () => {
  expect(canaryInstaller(release).url).toBe(`${CANARY_BASE}/canary-12-2/${CANARY_INSTALLER}`);
  expect(canaryInstaller({ ...release, body: "Legacy release" }).url).toBe(`${CANARY_BASE}/canary/${CANARY_INSTALLER}`);
  for (const invalid of [
    { ...release, tag_name: "stable" }, { ...release, draft: true }, { ...release, assets: [] },
    { ...release, assets: [{ ...release.assets[0], browser_download_url: "https://example.com/setup.zip" }] },
  ]) expect(() => canaryInstaller(invalid)).toThrow();
});

test("publication rejects foreign identity, path traversal and stale build versions", () => {
  expect(validateCanaryManifest(manifest, manifest.version)).toEqual(manifest);
  for (const invalid of [null, { ...manifest, channel: "stable" }, { ...manifest, arch: "arm64" },
    { ...manifest, identifier: "another.app" }, { ...manifest, hash: "../hash" },
    { ...manifest, artifact: { file: "../archive.tar.zst" } }, { ...manifest, artifact: undefined },
  ]) expect(() => validateCanaryManifest(invalid)).toThrow();
  expect(() => validateCanaryManifest(manifest, "0.1.0-canary.13.1")).toThrow();
});

test("publication retains old full archives and points metadata at existing immutable bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "station-release-"));
  try {
    const metadataPath = join(directory, "canary-win-x64-update.json");
    const setupExePath = join(directory, "Station-Setup-canary.exe");
    await Bun.write(metadataPath, JSON.stringify(manifest));
    await expect(prepareCanaryRelease(directory)).rejects.toThrow("missing");
    const archive = new Uint8Array(1_000_001);
    archive.set([40, 181, 47, 253]);
    const installer = new Uint8Array(1_000_001);
    installer.set([80, 75]);
    await Bun.write(join(directory, manifest.artifact.file), archive);
    await Bun.write(join(directory, installerZipName), installer);
    const executable = new Uint8Array(1_000_001); executable.set([77, 90]);
    await Bun.write(setupExePath, executable);
    await Bun.write(setupExePath.replace(".exe", ".tar.zst"), archive);
    const setupMetadata = { identifier: manifest.identifier, channel: manifest.channel, name: "Station", hash: manifest.hash };
    const setupMetadataPath = setupExePath.replace(".exe", ".metadata.json");
    await Bun.write(setupMetadataPath, JSON.stringify({ ...setupMetadata, identifier: "com.isaacharvey.station.acceptance" }));
    await expect(prepareCanaryRelease(directory, manifest.version, setupExePath)).rejects.toThrow("identity or hash");
    await Bun.write(setupMetadataPath, JSON.stringify(setupMetadata));
    await prepareCanaryRelease(directory, manifest.version, setupExePath);
    expect((await Bun.file(join(directory, CANARY_INSTALLER)).arrayBuffer()).byteLength).toBeGreaterThan(2_000_000);
    const prepared = await Bun.file(metadataPath).json();
    expect(prepared.artifact.file).toBe("canary-win-x64-Station-abcd1234.tar.zst");
    expect(await Bun.file(join(directory, prepared.artifact.file)).arrayBuffer()).toEqual(archive.buffer);
    expect(await Bun.file(join(directory, manifest.artifact.file)).exists()).toBe(true);
    await Bun.write(join(directory, installerZipName), "truncated");
    await expect(prepareCanaryRelease(directory)).rejects.toThrow("truncated");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("site gate rejects missing assets and the production JSX crash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "station-site-"));
  try {
    await Bun.write(join(directory, "index.html"), `<a href="${CANARY_BASE}/canary/${CANARY_INSTALLER}">Download</a><script src="./app.js"></script>`);
    await expect(verifySite(directory)).rejects.toThrow("Missing site asset");
    await Bun.write(join(directory, "app.js"), "jsxDEV(App, {})");
    await expect(verifySite(directory)).rejects.toThrow("development JSX");
    await Bun.write(join(directory, "app.js"), "jsx(App, {})");
    await verifySite(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  importPackage,
  parseManifest,
  packageMembers,
  type PackageInstallation,
} from "../src/core/package-assets";
import { forkInstallation } from "../src/core/fork-package";
import { parseTheme } from "../src/core/theme-assets";
test("forking an installed snapshot creates independent package identity and remaps theme icon resources", () => {
  const assets = importPackage(
    readFileSync(
      new URL(
        "../../../docs/examples/svg-studio.station.json",
        import.meta.url,
      ),
      "utf8",
    ),
    [],
  );
  const author = assets.find((asset) => asset.kind === "package")!,
    manifest = parseManifest(author.files!["station.json"]!);
  const installation: PackageInstallation = {
    id: manifest.id,
    name: manifest.name,
    packageAssetId: author.id,
    revision: 0,
    enabled: true,
    manifest,
    assets: packageMembers(manifest, assets),
    builds: {},
    grants: { editor: ["station:editor/session"] },
  };
  const fork = forkInstallation(installation, assets),
    copy = fork.assets.find((asset) => asset.kind === "package")!;
  expect(parseManifest(copy.files!["station.json"]!).id).not.toBe(manifest.id);
  expect(fork.packageId).not.toBe(author.id);
  const theme = fork.assets.find((asset) => asset.kind === "theme")!;
  const reference = parseTheme(theme.files!["theme.json"]!).icons!.Share;
  expect(
    fork.assets.find((asset) => asset.id === reference.assetId)?.files?.[
      reference.path
    ],
  ).toContain("<svg");
  expect(
    fork.assets.some(
      (asset) => "grants" in asset && Object.values(asset.grants).some(Boolean),
    ),
  ).toBe(false);
});

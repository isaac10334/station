import {
  exportPackage,
  importPackage,
  parseManifest,
  type PackageInstallation,
} from "./package-assets";
import type { Asset, DataAsset } from "./asset-state";

/** Fork the installed snapshot, including deleted authoring sources. No grants or bytes are copied. */
export function forkInstallation(
  installation: PackageInstallation,
  existing: Asset[],
) {
  const packageAsset: DataAsset = {
    kind: "package",
    id: installation.packageAssetId,
    instanceId: crypto.randomUUID(),
    name: `${installation.name.slice(0, 115)} fork`,
    description: "Forked from an installed snapshot",
    revision: 0,
    files: { "station.json": JSON.stringify(installation.manifest, null, 2) },
  };
  const assets = importPackage(
    exportPackage(packageAsset, installation.assets),
    existing,
  );
  const fork = assets.find((asset) => asset.kind === "package")!;
  const manifest = parseManifest(fork.files!["station.json"]!);
  manifest.id = `${manifest.id.slice(0, 60)}-fork-${crypto.randomUUID().slice(0, 8)}`;
  manifest.name = fork.name;
  fork.files!["station.json"] = JSON.stringify(manifest, null, 2);
  return { assets, packageId: fork.id };
}

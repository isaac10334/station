export const CANARY_INSTALLER = "canary-win-x64-Station-Setup-canary.exe";
export const CANARY_BASE = "https://github.com/isaac10334/station/releases/download";

/** Resolve a published immutable installer, retaining the fixed channel URL for older releases. */
export function canaryInstaller(release: {
  tag_name?: string; draft?: boolean; body?: string;
  assets?: { name: string; browser_download_url: string; size: number }[];
}) {
  const asset = release.assets?.find(asset => asset.name === CANARY_INSTALLER);
  if (release.tag_name !== "canary" || release.draft || !asset ||
      asset.size <= 0 || asset.browser_download_url !== `${CANARY_BASE}/canary/${CANARY_INSTALLER}`)
    throw new Error("Canary installer unavailable");
  const build = /Archived build: (canary-\d+-\d+)\./.exec(release.body ?? "")?.[1];
  return { url: `${CANARY_BASE}/${build ?? "canary"}/${CANARY_INSTALLER}`, size: asset.size };
}

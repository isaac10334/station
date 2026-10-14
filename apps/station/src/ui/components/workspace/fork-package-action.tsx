import type { Workspace } from "../../../core/model";
import type { PackageInstallation } from "../../../core/package-assets";
import { forkInstallation } from "../../../core/fork-package";
import { deps } from "../../../composition";
import { IconAction } from "../ui/icon-action";
import { Copy } from "../../lib/icons";
export function ForkPackageAction({
  workspace,
  installation,
}: {
  workspace: Workspace;
  installation: PackageInstallation;
}) {
  return (
    <IconAction
      label="Fork package source"
      className="size-7 border-transparent bg-transparent"
      onClick={() => {
        const fork = forkInstallation(installation, workspace.assets);
        deps.store.importAssets(fork.assets);
        deps.store.dispatchDock({ type: "openAsset", assetId: fork.packageId });
      }}
    >
      <Copy />
    </IconAction>
  );
}

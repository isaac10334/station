import type { Workspace } from "./workspace-state";
/** Pure catalog lookup, shared by navigation, rendering and authorization. No runtime startup. */
export function installedDefinitions(workspace: Workspace) {
  const desk = workspace.desks.find(
    (desk) => desk.id === workspace.activeDeskId,
  )!;
  return workspace.installations
    .filter((item) => item.enabled)
    .flatMap((installation) =>
      installation.manifest.contributions.map((contribution) => ({
        installation,
        contribution,
        id: `${installation.id}/${contribution.id}`,
      })),
    )
    .filter((item) => !desk.disabledContributions.includes(item.id));
}

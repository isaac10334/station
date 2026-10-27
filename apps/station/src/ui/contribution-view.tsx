import { useEffect, useState } from "react";
import type { Workspace } from "../core/workspace-state";
import type { Asset } from "../core/asset-state";
import type { Panel } from "../core/docking";
import { DockOwnedLayout, useDockController } from "./docking/react";
import {
  composeContribution,
  installedDefinitions,
} from "../services/package-runtime";
import { ForkPackageAction } from "./components/workspace/fork-package-action";
import { packageRuntime } from "../composition";
const { contributionBindings } = packageRuntime;
import { SandboxFrame } from "./sandbox-frame";
import { useEditorOwner } from "./components/workspace/editor-workspace";
import { ProgramWidget } from './components/workspace/program-widget';

function BoundEditor({
  asset,
  panel,
  workspace,
}: {
  asset: Asset;
  panel: Panel;
  workspace: Workspace;
}) {
  useEditorOwner(asset, panel.id);
  return <ContributionBody panel={panel} workspace={workspace} />;
}
/** Missing installations retain the saved instance; re-enabling restores its renderer. */
export function ContributionView({
  panel,
  workspace,
}: {
  panel: Panel;
  workspace: Workspace;
}) {
  const asset =
    "assetId" in panel && panel.assetId
      ? workspace.assets.find((asset) => asset.id === panel.assetId)
      : undefined;
  return asset && !panel.ownerId ? (
    <BoundEditor asset={asset} panel={panel} workspace={workspace} />
  ) : (
    <ContributionBody panel={panel} workspace={workspace} />
  );
}
function ContributionBody({
  panel,
  workspace,
}: {
  panel: Panel;
  workspace: Workspace;
}) {
  const { layout, command } = useDockController();
  const definition = installedDefinitions(workspace).find(
    (item) => item.id === panel.definitionId,
  );
  const [error, setError] = useState("");
  const body =
    panel.slotId === "body" &&
    panel.ownerId &&
    layout.panels[panel.ownerId]?.definitionId === panel.definitionId;
  useEffect(() => {
    if (
      !definition ||
      body ||
      !definition.contribution.slots.length ||
      layout.containers[panel.id]
    )
      return;
    try {
      const result = command(
        composeContribution(
          panel,
          definition.contribution,
          definition.installation,
        ),
      );
      if (!result.ok) setError(result.reason);
    } catch (error) {
      setError(String(error));
    }
  }, [definition?.installation, panel.id]);
  if (!definition)
    return (
      <div className="station-contribution">
        <p>
          This contribution is unavailable. Enable or reinstall its package to
          restore it.
        </p>
      </div>
    );
  if(definition.installation.programs?.[definition.contribution.id])return <ProgramWidget panel={panel}/>;
  if (!body && definition.contribution.slots.length)
    return (
      <div className="station-contribution">
        {panel.kind !== "asset" && (
          <div className="flex shrink-0 justify-end border-b border-line px-2 py-1">
            <ForkPackageAction
              workspace={workspace}
              installation={definition.installation}
            />
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <DockOwnedLayout ownerId={panel.id} controls={false} />
      </div>
    );
  return (
    <ContributionFrame
      key={`${definition.installation.installationId ?? definition.installation.revision}:${definition.installation.builds[definition.contribution.id]?.documentHash}:${JSON.stringify(definition.installation.grants)}:${JSON.stringify(definition.installation.metadataTargets)}:${panel.definitionId}`}
      panel={panel}
      workspace={workspace}
    />
  );
}
function ContributionFrame({
  panel,
  workspace,
}: {
  panel: Panel;
  workspace: Workspace;
}) {
  const definition = installedDefinitions(workspace).find(
    (item) => item.id === panel.definitionId,
  )!;
  const [connection, setConnection] = useState<ReturnType<
    typeof contributionBindings
  > | null>(null);
  useEffect(() => {
    const connection = contributionBindings(
      workspace,
      panel,
      definition.installation,
      definition.contribution,
    );
    setConnection(connection);
    return () => connection.dispose();
  }, []);
  const build = definition.installation.builds[definition.contribution.id];
  return (
    <div className="station-contribution">
      {!panel.ownerId && panel.kind !== "asset" && (
        <div className="flex shrink-0 items-center justify-end border-b border-line px-2 py-1">
          <ForkPackageAction
            workspace={workspace}
            installation={definition.installation}
          />
        </div>
      )}
      {build && connection ? (
        <SandboxFrame
          html={build.document}
          title={definition.contribution.title}
          bindings={connection.bindings}
        />
      ) : (
        <p>Opening widget…</p>
      )}
    </div>
  );
}

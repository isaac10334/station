import { useEffect, useState } from "react";
import { ForkPackageAction } from "./fork-package-action";
import type { Asset, Workspace } from "../../../core/model";
import type { Panel } from "../../../core/docking";
import { editorPaneTarget } from "../../../core/editor-panes";
import { deps } from "../../../composition";
import { installedDefinitions } from "../../../core/contribution-catalog";
import { useDockController } from "../../docking/react";
import { ActionTooltip } from "../ui/action-tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { Code, Columns, RotateCcw, Settings, Check } from "../../lib/icons";

/** Editor choices, recovery and defaults share one compact control strip. */
export function EditorControls({
  asset,
  panel,
  workspace,
  onShowSource,
}: {
  asset: Asset;
  panel: Extract<Panel, { kind: "asset" }>;
  workspace: Workspace;
  onShowSource?: () => void;
}) {
  const { layout, command } = useDockController();
  const [pending, setPending] = useState<
    "files" | "code" | "preview" | "problems" | null
  >(null);
  useEffect(() => {
    if (!pending) return;
    const existing = Object.values(layout.panels).find(
      (child) =>
        child.kind === "editor-part" &&
        child.ownerId === panel.id &&
        child.part === pending,
    );
    const target = editorPaneTarget(layout, panel.id, pending);
    if (existing) {
      command({ type: "activate", panelId: existing.id });
      setPending(null);
    } else if (target) {
      command({
        type: "createEditorPart",
        ownerId: panel.id,
        assetId: asset.id,
        part: pending,
        slotId: pending,
        target,
      });
      setPending(null);
    } else if (layout.containers[panel.id]) setPending(null);
  }, [pending, layout, panel.id, asset.id]);
  const choices = installedDefinitions(workspace).filter(
    (item) =>
      item.contribution.role === "editor" &&
      item.contribution.assetKinds.includes(asset.kind),
  );
  const title =
    choices.find((item) => item.id === panel.definitionId)?.contribution
      .title ?? "Station editor";
  const parts =
    asset.kind === "web-content"
      ? (["files", "code", "preview", "problems"] as const)
      : (["files", "code", "problems"] as const);
  return (
    <div className="station-project-toolbar border-b border-line text-xs">
      <DropdownMenu>
        <ActionTooltip label="Open with a different editor">
          <DropdownMenuTrigger
            aria-label="Open with"
            size="sm"
            variant="ghost"
            chevron
          >
            <Code />
            {title}
          </DropdownMenuTrigger>
        </ActionTooltip>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Open with</DropdownMenuLabel>
            {[
              { id: "", title: "Station editor" },
              ...choices.map((item) => ({
                id: item.id,
                title: item.contribution.title,
              })),
            ].map((item) => (
              <DropdownMenuItem
                key={item.id}
                icon={
                  (panel.definitionId ?? "") === item.id ? <Check /> : <Code />
                }
                onClick={() =>
                  command({
                    type: "setEditor",
                    panelId: panel.id,
                    definitionId: item.id || undefined,
                  })
                }
              >
                {item.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <ActionTooltip label="Show editor panes">
          <DropdownMenuTrigger
            size="sm"
            variant="ghost"
            iconOnly
            aria-label="Show editor panes"
          >
            <Columns />
          </DropdownMenuTrigger>
        </ActionTooltip>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Editor panes</DropdownMenuLabel>
            {parts.map((part) => {
              const existing = Object.values(layout.panels).find(
                (child) =>
                  child.kind === "editor-part" &&
                  child.ownerId === panel.id &&
                  child.part === part,
              );
              const target = editorPaneTarget(layout, panel.id, part);
              return (
                <DropdownMenuItem
                  key={part}
                  disabled={!existing && !target && !onShowSource}
                  icon={existing ? <Check /> : <Columns />}
                  onClick={() => {
                    onShowSource?.();
                    setPending(part);
                  }}
                >
                  {part[0].toUpperCase() + part.slice(1)}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={<RotateCcw />}
              onClick={() =>
                command({
                  type: "setEditor",
                  panelId: panel.id,
                  definitionId: panel.definitionId,
                })
              }
            >
              Reset pane layout
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <ActionTooltip label="Editor defaults">
          <DropdownMenuTrigger
            size="sm"
            variant="ghost"
            iconOnly
            aria-label="Editor defaults"
          >
            <Settings />
          </DropdownMenuTrigger>
        </ActionTooltip>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Use {title} by default</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() =>
                deps.store.patchDesk({
                  editorDefaults: {
                    ...deps.store.desk().editorDefaults,
                    [asset.kind]: panel.definitionId ?? "",
                  },
                })
              }
            >
              For this desk
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                deps.store.setWorkspaceEditor(
                  asset.kind,
                  panel.definitionId ?? "",
                )
              }
            >
              For this workspace
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {choices.find((item) => item.id === panel.definitionId) && (
        <ForkPackageAction
          workspace={workspace}
          installation={
            choices.find((item) => item.id === panel.definitionId)!.installation
          }
        />
      )}
      <span className="ml-auto truncate text-fg-3">{asset.name}</span>
    </div>
  );
}

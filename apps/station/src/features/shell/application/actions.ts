/** Shared shell metadata and explicit routing ports. No React, host reflection or grants. */
import {
  invokeAction,
  type ActionDescriptor,
  type ActionPorts,
} from "@loop-kit/ui";
import { HOME_ID, panelSurface } from "../../../core/docking";
import type { Workspace } from "../../../core/workspace-state";
import { installedDefinitions } from "../../../core/contribution-catalog";
export interface ShellActionGroup {
  readonly heading: string;
  readonly items: readonly ActionDescriptor[];
}
export function shellActions(workspace: Workspace): ShellActionGroup[] {
  const action = (
    id: string,
    label: string,
    icon: string,
    shortcut?: string,
    params?: ActionDescriptor["invocation"]["params"],
  ): ActionDescriptor => ({
    id,
    label,
    icon: { kind: "symbol", name: icon },
    shortcut,
    source: { kind: "shell", id: "station.shell" },
    requiredAuthority: [],
    invocation: { kind: "shell", id, params },
  });
  const dock = (
    id: string,
    label: string,
    icon: string,
    params: NonNullable<ActionDescriptor["invocation"]["params"]>,
    shortcut?: string,
  ): ActionDescriptor => ({
    ...action(id, label, icon, shortcut),
    requiredAuthority: ["layout.write"],
    invocation: { kind: "command", id: "dock.apply", params },
  });
  return [
    {
      heading: "Installed commands",
      items: installedDefinitions(workspace)
        .filter((item) => item.contribution.role === "command")
        .map((item) => ({
          id: `command:${item.id}`,
          label: item.contribution.title,
          description: `${item.installation.name} · Open command input`,
          source: { kind: "contribution" as const, id: item.id },
          requiredAuthority: [],
          invocation: {
            kind: "shell" as const,
            id: "installed-command",
            params: { definitionId: item.id },
          },
        })),
    },
    {
      heading: "Navigate",
      items: [
        action("overview", "Open overview", "Home", undefined, {
          panelId: HOME_ID,
        }),
        action("browser", "Toggle asset browser", "Folder", "shift+w"),
        action("settings", "Open settings", "Settings"),
        action("inspector", "Open widget inspector", "Sliders"),
        action(
          "sidebar-side",
          `Move sidebar ${workspace.dock.sidebarSide === "left" ? "right" : "left"}`,
          "Sidebar",
        ),
        dock(
          "sidebar-visibility",
          workspace.dock.hidden.sidebar ? "Show sidebar" : "Hide sidebar",
          "Sidebar",
          {
            type: "visibility",
            surface: "sidebar",
            hidden: !workspace.dock.hidden.sidebar,
          },
          "shift+q",
        ),
        dock(
          "main-visibility",
          workspace.dock.hidden.main
            ? "Show main surface"
            : "Hide main surface",
          "Columns",
          {
            type: "visibility",
            surface: "main",
            hidden: !workspace.dock.hidden.main,
          },
        ),
        {
          ...action("undo", "Undo layout", "Undo", "mod+z"),
          enabledWhen: "canUndo",
        },
        {
          ...action("redo", "Redo layout", "Redo", "mod+shift+z"),
          enabledWhen: "canRedo",
        },
        {
          ...action("back", "Back to previous panel", "ArrowLeft"),
          enabledWhen: "canBack",
        },
        {
          ...action("forward", "Forward to next panel", "ArrowRight"),
          enabledWhen: "canForward",
        },
        action("palette", "Command palette", "Command", "mod+k"),
      ],
    },
    {
      heading: "Create",
      items: [
        action("new-web-asset", "New web content", "Plus"),
        action("new-asset", "New Component", "Plus"),
        action("new-workspace", "New workspace", "Folder"),
      ],
    },
  ];
}
/** Missing implementations fail closed. Callers supply trusted local controllers;
 * command invocations always enter the existing versioned registry port. */
export function createActionRouter(ports: ActionPorts) {
  return (action: ActionDescriptor, signal?: AbortSignal) =>
    invokeAction(action, ports, signal);
}
export function navigationAvailable(
  workspace: Workspace,
  ids: readonly string[],
) {
  return ids.some((id) => panelSurface(workspace.dock, id) === "main");
}

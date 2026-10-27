/** Trusted shell workflows. Descriptor data cannot introduce new controller implementations. */
import type { DataValue, ActionPorts } from "@loop-kit/ui";
import { HOME_ID, type Command, type Result } from "../../../core/docking";
import type { Workspace } from "../../../core/workspace-state";
import type { Overlay } from "./overlays";
import { installedDefinitions } from "../../../core/contribution-catalog";
export function shellActionImplementations(ports: {
  workspace(): Workspace;
  command(value: Command): Result;
  revealPanel(id: string): Promise<void>;
  toggleBrowser(): void;
  showOverlay(value: Overlay): void;
  openInspector(): Promise<void>;
  navigate(direction: "back" | "forward"): void;
  undo(): void;
  redo(): void;
  palette(): void;
}): ActionPorts["shell"] {
  return (id, params: Readonly<Record<string, DataValue>>) => {
    const workspace = ports.workspace();
    switch (id) {
      case "overview":
        return ports.revealPanel(HOME_ID);
      case "browser":
        return ports.toggleBrowser();
      case "settings":
        return ports.showOverlay({ kind: "settings" });
      case "inspector":
        return ports.openInspector();
      case "palette":
        return ports.palette();
      case "undo":
        return ports.undo();
      case "redo":
        return ports.redo();
      case "back":
      case "forward":
        return ports.navigate(id);
      case "installed-command":
        if (
          typeof params.definitionId !== "string" ||
          !installedDefinitions(workspace).some(
            (item) =>
              item.id === params.definitionId &&
              item.contribution.role === "command",
          )
        )
          throw new Error("Missing contribution");
        return ports.command({
          type: "createCommandOutput",
          definitionId: params.definitionId,
          target: { surface: "main", intent: "tab" },
        });
      case "sidebar-side":
        return ports.command({
          type: "sidebarSide",
          side: workspace.dock.sidebarSide === "left" ? "right" : "left",
        });
      case "sidebar-visibility":
        return ports.command({
          type: "visibility",
          surface: "sidebar",
          hidden: !workspace.dock.hidden.sidebar,
        });
      case "main-visibility":
        return ports.command({
          type: "visibility",
          surface: "main",
          hidden: !workspace.dock.hidden.main,
        });
      case "new-web-asset":
        return ports.showOverlay({ kind: "create", target: "web-content" });
      case "new-asset":
        return ports.showOverlay({ kind: "create", target: "component" });
      case "new-workspace":
        return ports.showOverlay({ kind: "create", target: "workspace" });
      default:
        throw new Error(`Unknown shell action: ${id}`);
    }
  };
}

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { IconAction } from "../ui/icon-action";
import { ActionTooltip } from "../ui/action-tooltip";
import { DockToolbar } from "../../docking/react";
import { TOOLBAR_TOOL_DEFINITIONS } from "../../../core/toolbar-tools";
import type { ActionDescriptor } from "@loop-kit/ui";
import { SemanticIcon } from "../../semantic-icons";
import { ContentToolbar } from "../ui/content-toolbar";

/** A protected internal definition renders host controls without serializing callbacks. */
export function BuiltinToolbarTool({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const definition = TOOLBAR_TOOL_DEFINITIONS[id];
  if (!definition) throw new Error(`Unknown toolbar tool: ${id}`);
  return (
    <span
      className="contents"
      data-widget-definition={definition.id}
      data-protected-widget
    >
      {children}
    </span>
  );
}

/** A shell action's presentation; callers own navigation, dock commands, and services. */
export type SurfaceToolbarAction = {
  action: ActionDescriptor;
  disabled?: boolean;
  secondary?: boolean;
};

export function MainSurfaceToolbar({
  history,
  actions,
  onSearch,
  children,
  onAction,
}: {
  history: SurfaceToolbarAction[];
  actions: SurfaceToolbarAction[];
  onSearch: () => void;
  children: ReactNode;
  onAction: (action: ActionDescriptor) => unknown;
}) {
  const render = (action: SurfaceToolbarAction) => (
    <BuiltinToolbarTool key={action.action.id} id={action.action.id}>
      <IconAction
        key={action.action.id}
        label={action.action.label}
        disabled={action.disabled}
        className={action.secondary ? "dock-mobile-secondary" : undefined}
        onClick={() => {
          void onAction(action.action);
        }}
        data-action-id={action.action.id}
        data-action-source={action.action.source.id}
      >
        {action.action.icon && <SemanticIcon icon={action.action.icon} />}
      </IconAction>
    </BuiltinToolbarTool>
  );
  return (
    <div
      className="panel-nav dock-shell-toolbar"
      role="toolbar"
      aria-label="Main surface tools"
    >
      <ContentToolbar left={<div className="flex items-center gap-1">{history.map(render)}</div>} center={<BuiltinToolbarTool id="search">
        <ActionTooltip label="Search assets and panels (Ctrl+K)">
          <button
            type="button"
            className="dock-search-button"
            aria-label="Search workspace"
            onClick={onSearch}
          >
            <Search size={15} />
            <span>Search workspace</span>
          </button>
        </ActionTooltip>
      </BuiltinToolbarTool>} right={<div className="flex items-center gap-1">
      {actions.map(render)}
      <DockToolbar />
      {children}
      </div>} />
    </div>
  );
}

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { IconAction } from "@/components/ui/icon-action";
import { ActionTooltip } from "@/components/ui/action-tooltip";

/** A shell action's presentation; callers own navigation, dock commands, and services. */
export type SurfaceToolbarAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
};

export function MainSurfaceToolbar({
  history,
  actions,
  onSearch,
  children,
}: {
  history: SurfaceToolbarAction[];
  actions: SurfaceToolbarAction[];
  onSearch: () => void;
  children: ReactNode;
}) {
  const render = (action: SurfaceToolbarAction) => (
    <IconAction
      key={action.id}
      label={action.label}
      disabled={action.disabled}
      className={action.secondary ? "dock-mobile-secondary" : undefined}
      onClick={action.onClick}
    >
      {action.icon}
    </IconAction>
  );
  return (
    <div
      className="panel-nav dock-shell-toolbar"
      role="toolbar"
      aria-label="Main surface tools"
    >
      {history.map(render)}
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
      <span className="spacer" />
      {actions.map(render)}
      {children}
    </div>
  );
}

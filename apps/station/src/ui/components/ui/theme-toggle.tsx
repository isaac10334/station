import { ActionTooltip } from "./action-tooltip";
import {
  ThemeToggle as SharedThemeToggle,
  type ThemeSelection,
} from "@station/ui/theme-toggle";
export { changeTheme } from "@station/ui/theme-toggle";
export function ThemeToggle({
  theme,
  onThemeChange,
  className = "icon-button",
}: {
  theme: ThemeSelection;
  onThemeChange: (theme: ThemeSelection) => void;
  className?: string;
}) {
  return (
    <ActionTooltip label="Change color theme">
      <SharedThemeToggle
        theme={theme}
        onThemeChange={onThemeChange}
        className={className}
      />
    </ActionTooltip>
  );
}

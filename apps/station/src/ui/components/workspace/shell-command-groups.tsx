/** Palette projection; reusable metadata remains React-free in the shell feature. */
import {
  actionState,
  type ActionDescriptor,
  type ActionPorts,
} from "@loop-kit/ui";
import type { ShellActionGroup } from "../../../features/shell/application/actions";
import type { CommandGroup } from "../ui/command-palette";
import { SemanticIcon } from "../../semantic-icons";
export function shellCommandGroups(
  groups: readonly ShellActionGroup[],
  invoke: (action: ActionDescriptor) => unknown,
  condition: ActionPorts["condition"],
): CommandGroup[] {
  return groups.map((group) => ({
    heading: group.heading,
    items: group.items
      .filter((action) => actionState(action, condition).visible)
      .map((action) => ({
        id: action.id,
        label: action.label,
        hint: action.description,
        shortcut: action.shortcut,
        icon: action.icon ? <SemanticIcon icon={action.icon} /> : undefined,
        disabled: !actionState(action, condition).enabled,
        action,
        onSelect: () => Promise.resolve(invoke(action)),
      })),
  }));
}

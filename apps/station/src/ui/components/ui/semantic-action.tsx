/** Host adapters for one action identity across navigation, menu and context-menu rows. */
import {
  actionState,
  type ActionDescriptor,
  type ActionPorts,
} from "@loop-kit/ui";
import { DropdownMenuItem } from "./dropdown-menu";
import { SemanticIcon } from "../../semantic-icons";
type Props = {
  action: ActionDescriptor;
  invoke: (action: ActionDescriptor) => unknown;
  condition?: ActionPorts["condition"];
};
const deny = () => false;
export function SemanticActionMenuItem({
  action,
  invoke,
  condition = deny,
}: Props) {
  const state = actionState(action, condition);
  if (!state.visible) return null;
  return (
    <DropdownMenuItem
      disabled={!state.enabled}
      icon={action.icon ? <SemanticIcon icon={action.icon} /> : undefined}
      shortcut={action.shortcut}
      description={action.description}
      data-action-id={action.id}
      data-action-source={action.source.id}
      onClick={() => {
        void invoke(action);
      }}
    >
      {action.label}
    </DropdownMenuItem>
  );
}
export function SemanticActionButton({
  action,
  invoke,
  condition = deny,
  className,
}: Props & { className?: string }) {
  const state = actionState(action, condition);
  if (!state.visible) return null;
  return (
    <button
      type="button"
      disabled={!state.enabled}
      className={className}
      data-action-id={action.id}
      data-action-source={action.source.id}
      onClick={() => {
        void invoke(action);
      }}
    >
      {action.icon && <SemanticIcon icon={action.icon} />} {action.label}
    </button>
  );
}

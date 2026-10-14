import {
  hostSurface,
  visitNode,
  type DockLayout,
  type Stack,
  type Target,
} from "./docking";

/** Recover a contextual pane in an eligible slot of its owner, never in another editor. */
export function editorPaneTarget(
  layout: DockLayout,
  ownerId: string,
  part: string,
): Target | null {
  const surface = hostSurface(layout, ownerId);
  if (!surface) return null;
  const slots: Stack[] = [];
  visitNode(layout.containers[ownerId] ?? null, (node) => {
    if (
      node.kind === "stack" &&
      (!node.allowedDefinitions ||
        node.allowedDefinitions.includes(`station:editor/${part}`))
    )
      slots.push(node);
  });
  const slot =
    slots.find(
      (slot) => slot.slotId === part || slot.id.endsWith(`:slot:${part}`),
    ) ??
    slots.find((slot) => !slot.tabs.length) ??
    slots[0];
  return slot ? { surface, ownerId, nodeId: slot.id, intent: "tab" } : null;
}

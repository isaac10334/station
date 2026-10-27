import { z } from "zod";
import { visitNode, hostSurface, type DockLayout, type Stack, type Surface } from "./docking";
import type { SlotReference } from "./slot-reference";

/** Inspector metadata; these entries grant no access to the destination. */
export function widgetTargetSlots(layout: DockLayout): { reference: SlotReference; label: string }[] {
  const entries: { reference: SlotReference; label: string }[] = [];
  const scan = (root: Parameters<typeof visitNode>[0], surface: Surface, ownerId?: string) => { let index = 0; visitNode(root, n => { if (n.kind === "stack") entries.push({ reference: { surface, ownerId, nodeId: n.id }, label: `${ownerId ? layout.panels[ownerId]?.displayName || ownerId : surface} · slot ${++index}` }); }); };
  for (const surface of ["main", "dashboard", "sidebar", "bottom", "toolbar"] as const) scan(layout.surfaces[surface], surface);
  for (const [ownerId, root] of Object.entries(layout.containers)) scan(root, hostSurface(layout, ownerId) ?? "dashboard", ownerId);
  return entries;
}

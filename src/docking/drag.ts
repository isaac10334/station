/**
 * Drop intent resolution shared by pointer and keyboard drags. Modifier policy is
 * explicit here so skins cannot disagree about what Shift or Alt means.
 *
 * @example
 * resolveIntent("tab", { shift: true, alt: false }, { x: 4, y: 40, width: 200, height: 100 }); // "left"
 */
import type { Intent } from "./core";

export type Modifiers = { shift: boolean; alt: boolean };
export type PointInTarget = { x: number; y: number; width: number; height: number };

export function nearestEdge(point: PointInTarget): Exclude<Intent, "append" | "tab"> {
  const distances = { left: point.x, right: point.width - point.x, top: point.y, bottom: point.height - point.y };
  return (Object.entries(distances).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "right") as Exclude<Intent, "append" | "tab">;
}

/** Alt wins when both modifiers are down; Shift otherwise forces a split edge. */
export function resolveIntent(base: Intent, modifiers: Modifiers, point: PointInTarget): Intent {
  if (modifiers.alt) return "tab";
  if (modifiers.shift) return nearestEdge(point);
  return base;
}

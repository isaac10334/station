/**
 * Drop intent resolution shared by pointer and keyboard drags. Modifier policy is
 * explicit here so skins cannot disagree about what Shift or Alt means.
 *
 * @example
 * resolveIntent("tab", { shift: true, alt: false }, { x: 4, y: 40, width: 200, height: 100 }); // "left"
 */
import type { Intent, Target } from "./core";
import type { KeyboardCoordinateGetter } from "@dnd-kit/core";
import { clippedBounds } from "./geometry";

export type Modifiers = { shift: boolean; alt: boolean };
export type PointInTarget = { x: number; y: number; width: number; height: number };

export function nearestEdge(point: PointInTarget): Exclude<Intent, "append" | "tab" | "swap"> {
  const distances = { left: point.x, right: point.width - point.x, top: point.y, bottom: point.height - point.y };
  return (Object.entries(distances).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "right") as Exclude<Intent, "append" | "tab" | "swap">;
}

/** Arrow keys visit visible registered targets accepted by the host's placement policy. */
export function createDockKeyboardCoordinates(select: (id: string | null) => void, accepts?: (target: Target, panelId: string, point: PointInTarget) => boolean) {
 let selected: string | null = null;
 const coordinateGetter: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.code)) return;
  event.preventDefault();
  const targets = context.droppableContainers.getEnabled().filter((item) => {
    const element = item.node.current, rect = element ? clippedBounds(element) : null;
    const target = item.data.current?.target as Target | undefined;
    const panelId = context.active?.data.current?.item?.panelId as string | undefined;
    if (accepts && target && panelId && rect && !accepts(target, panelId, { x: rect.width / 2, y: rect.height / 2, width: rect.width, height: rect.height })) return false;
    return (String(item.id).startsWith("dock-target:") || item.data.current?.tabId) && rect && rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && element && getComputedStyle(element).visibility !== "hidden";
  });
  targets.sort((a, b) => { const ra = a.node.current!.getBoundingClientRect(), rb = b.node.current!.getBoundingClientRect(); return Math.round(ra.top / 12) - Math.round(rb.top / 12) || ra.left - rb.left || String(a.id).localeCompare(String(b.id)); });
  if (!targets.length) return currentCoordinates;
  const current = targets.findIndex((item) => item.id === (selected ?? context.over?.id));
  const step = event.code === "ArrowLeft" || event.code === "ArrowUp" ? -1 : 1;
  const next = targets[(current + step + targets.length) % targets.length];
  selected = String(next.id); select(selected);
  const rect = clippedBounds(next.node.current!);
  const active = context.collisionRect;
  return { x: rect.left + rect.width * (next.data.current?.tabId ? .25 : .5) - (active?.width ?? 0) / 2, y: rect.top + rect.height / 2 - (active?.height ?? 0) / 2 };
};
 return { coordinateGetter, reset: () => { selected = null; select(null); } };
}

/** Alt wins when both modifiers are down; Shift otherwise forces a split edge. */
export function resolveIntent(base: Intent, modifiers: Modifiers, point: PointInTarget): Intent {
  if (modifiers.alt) return "tab";
  if (modifiers.shift) return nearestEdge(point);
  return base;
}

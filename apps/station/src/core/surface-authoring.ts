import { authoredSurfaceSchema, type AuthoredSurface } from "./authored-surface";
import type { UiNode } from "@loop-kit/ui";
type MutableNode = { -readonly [P in keyof UiNode]: P extends "children" ? MutableNode[] : UiNode[P] };

/** Apply one inert structure edit and validate the whole candidate before commit.
 * Source keys identify nodes, never live docking instances or capabilities. */
export function editSurface(surface: AuthoredSurface, key: string, patch: Partial<UiNode>): AuthoredSurface {
  const next = structuredClone(surface);
  const visit = (node: MutableNode): boolean => {
    if (node.key === key) { Object.assign(node, patch, { key }); return true; }
    return node.children?.some(visit) ?? false;
  };
  if (!visit(next.frame.root as MutableNode)) throw new Error("Element unavailable");
  return authoredSurfaceSchema.parse(next);
}

/** Move existing keyed source into a child slot. Cycles, leaf parents, invalid
 * slots and foreign keys fail atomically through the shared element registry. */
export function moveSurfaceNode(surface: AuthoredSurface, key: string, parentKey: string): AuthoredSurface {
  if (key === surface.frame.root.key) throw new Error("The root cannot move");
  const next = structuredClone(surface);
  let moving: MutableNode | undefined, parent: MutableNode | undefined;
  const detach = (node: MutableNode) => {
    if (node.key === parentKey) parent = node;
    node.children = node.children?.filter(child => { if (child.key === key) { moving = child; return false; } detach(child); return true; });
  };
  detach(next.frame.root as MutableNode);
  if (!moving || !parent) throw new Error("Drop onto an existing parent outside the moving subtree");
  (parent.children ??= []).push(moving);
  return authoredSurfaceSchema.parse(next);
}

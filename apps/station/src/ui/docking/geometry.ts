/**
 * Visible backing geometry shared by presentation clipping and drag targeting.
 * Optional readers predict nested frame translation before a batched DOM write,
 * so children follow their owner's scroll in the same frame.
 */
export function clippedBounds(node: HTMLElement, geometry?: {
  rect: (element: HTMLElement) => DOMRect;
  style: (element: HTMLElement) => CSSStyleDeclaration;
  clipPath: (element: HTMLElement) => string;
}) {
  const readRect = geometry?.rect ?? ((element: HTMLElement) => element.getBoundingClientRect());
  const readStyle = geometry?.style ?? getComputedStyle;
  const rect = readRect(node);
  let left = rect.left, top = rect.top, right = rect.right, bottom = rect.bottom;
  for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = readStyle(ancestor);
    if (style.display === "contents") continue;
    const clip = readRect(ancestor);
    if (/(auto|scroll|hidden|clip)/.test(style.overflow + style.overflowX + style.overflowY)) {
      left = Math.max(left, clip.left); top = Math.max(top, clip.top); right = Math.min(right, clip.right); bottom = Math.min(bottom, clip.bottom);
    }
    const clipPath = geometry?.clipPath(ancestor) ?? style.clipPath;
    if (clipPath.startsWith("inset(")) {
      const inset = clipPath.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
      left = Math.max(left, clip.left + (inset[3] ?? inset[1] ?? inset[0])); top = Math.max(top, clip.top + inset[0]); right = Math.min(right, clip.right - (inset[1] ?? inset[0])); bottom = Math.min(bottom, clip.bottom - (inset[2] ?? inset[0]));
    }
  }
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

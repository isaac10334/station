/** Visible backing geometry shared by presentation clipping and drag targeting. */
export function clippedBounds(node: HTMLElement) {
  const rect = node.getBoundingClientRect();
  let left = rect.left, top = rect.top, right = rect.right, bottom = rect.bottom;
  for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.display === "contents") continue;
    const clip = ancestor.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflow + style.overflowX + style.overflowY)) {
      left = Math.max(left, clip.left); top = Math.max(top, clip.top); right = Math.min(right, clip.right); bottom = Math.min(bottom, clip.bottom);
    }
    if (style.clipPath.startsWith("inset(")) {
      const inset = style.clipPath.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
      left = Math.max(left, clip.left + (inset[3] ?? inset[1] ?? inset[0])); top = Math.max(top, clip.top + inset[0]); right = Math.min(right, clip.right - (inset[1] ?? inset[0])); bottom = Math.min(bottom, clip.bottom - (inset[2] ?? inset[0]));
    }
  }
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

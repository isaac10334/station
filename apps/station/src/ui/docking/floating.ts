/** Display bounds and movement use the same clamp, including after viewport resize. */
export function floatingBounds(
  position: { x: number; y: number; width: number; height: number },
  viewport = { width: innerWidth, height: innerHeight },
) {
  const width = Math.max(1, Math.min(position.width, viewport.width - 16));
  const height = Math.max(1, Math.min(position.height, viewport.height - 64));
  return {
    width,
    height,
    x: Math.max(8, Math.min(position.x, viewport.width - width - 8)),
    y: Math.max(8, Math.min(position.y, viewport.height - height - 8)),
  };
}

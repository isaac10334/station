/** Fit the fixed editor viewport once per geometry change. Canvas mutations must
 * never become measurements of the next viewport (scrollbars cause oscillation).
 * Hidden frames retain their last drawing until a positive size is available. */
export function createSvgViewportFit(apply: (width: number, height: number, zoom: number) => void) {
  let previous = "";
  return (width: number, height: number, contentWidth: number, contentHeight: number, force = false) => {
    width = Math.floor(width); height = Math.floor(height);
    if (![width, height, contentWidth, contentHeight].every(value => Number.isFinite(value) && value > 0)) return false;
    const key = `${width}:${height}:${contentWidth}:${contentHeight}`;
    if (!force && previous === key) return false;
    previous = key;
    const zoom = Math.max(0.1, Math.min(20, Math.max(1, width - 32) / contentWidth, Math.max(1, height - 32) / contentHeight));
    apply(width, height, zoom);
    return true;
  };
}

import type { BrowserFrame } from "@station/capabilities";

/** DOM measurements are CSS pixels; Electrobun expects window logical pixels
 * and applies monitor DPI itself. Only the root page zoom belongs here. Using
 * devicePixelRatio would apply monitor scaling twice on high-DPI displays.
 */
export function nativeBrowserFrame(
  frame: BrowserFrame,
  pageZoom: number,
): BrowserFrame {
  if (!Number.isFinite(pageZoom) || pageZoom <= 0)
    throw new Error("Invalid root browser zoom.");
  return {
    x: frame.x * pageZoom,
    y: frame.y * pageZoom,
    width: frame.width * pageZoom,
    height: frame.height * pageZoom,
    visible: frame.visible,
  };
}

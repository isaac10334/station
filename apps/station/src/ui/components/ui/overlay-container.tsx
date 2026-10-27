import { createContext, useContext, type ReactNode } from "react";

/** A focused widget stays in its native dialog's top layer. Its portals must
 * remain in that layer too, so menus/tooltips/dialogs preserve input and focus.
 * Ordinary surfaces use the primitives' default body portal.
 */
export const OverlayContainerContext = createContext<HTMLElement | undefined>(undefined);
export const useOverlayContainer = () => useContext(OverlayContainerContext);

const OverlayLayerContext = createContext<string | undefined>(undefined);
/** Portaled descendants paint above their owning popup, regardless of the base
 * token order. Keep portals outside scrolling content; inherit only layer order.
 * This prevents a dropdown inside a popover from painting underneath its parent.
 */
export function useOverlayZIndex(token: "--z-popover" | "--z-dropdown") {
  const parent = useContext(OverlayLayerContext);
  return parent ? `calc(${parent} + 1)` : `var(${token})`;
}
export function OverlayLayer({ value, children }: { value: string; children: ReactNode }) {
  return <OverlayLayerContext.Provider value={value}>{children}</OverlayLayerContext.Provider>;
}

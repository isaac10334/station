import { useOverlayContainer } from "./overlay-container";
import type { ReactElement, ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";

/** Compose onto the actual control, including menu triggers; never adds a focusable wrapper. */
export function ActionTooltip({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactElement;
}) {
  const container = useOverlayContainer();
  return (
    <Tooltip.Root>
      <Tooltip.Trigger delay={350} render={children} />
      <Tooltip.Portal container={container}>
        <Tooltip.Positioner sideOffset={6} className="z-(--z-tooltip)">
          <Tooltip.Popup className="rounded-md border border-line-2 bg-raised px-2.5 py-1.5 text-xs text-fg shadow-pop">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

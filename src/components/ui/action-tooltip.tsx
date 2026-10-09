import type { ReactElement } from "react";
import { Tooltip } from "@base-ui/react/tooltip";

/** Compose onto the actual control, including menu triggers; never adds a focusable wrapper. */
export function ActionTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger delay={350} render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-(--z-tooltip)">
          <Tooltip.Popup className="rounded-md border border-line-2 bg-raised px-2.5 py-1.5 text-xs text-fg shadow-pop">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

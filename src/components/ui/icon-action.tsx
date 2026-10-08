import type { ButtonHTMLAttributes } from "react";
import { Tooltip } from "@base-ui/react/tooltip";

/** A labelled icon button with the same tooltip on hover and keyboard focus. */
export function IconAction({ label, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <Tooltip.Root><Tooltip.Trigger delay={350} render={<button type="button" {...props} aria-label={label} className={`station-icon-action ${className}`} />}>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Positioner sideOffset={6} style={{ zIndex: 230 }}><Tooltip.Popup className="station-tooltip">{label}</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal></Tooltip.Root>;
}

import type { ButtonHTMLAttributes } from "react";
import { ActionTooltip } from "./action-tooltip";
import { cn } from "@/lib/utils";

/** A labelled icon button with the same tooltip on hover and keyboard focus. */
export function IconAction({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <ActionTooltip label={label}>
      <button
        type="button"
        {...props}
        aria-label={props["aria-label"] ?? label}
        className={cn(
          "station-icon-action inline-grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line-2 bg-raised p-0 text-fg-2 hover:bg-hover hover:text-fg active:scale-94 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-3 disabled:cursor-default disabled:opacity-40",
          className,
        )}
      >
        {children}
      </button>
    </ActionTooltip>
  );
}

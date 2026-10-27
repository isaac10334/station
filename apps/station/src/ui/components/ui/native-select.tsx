import type { ComponentProps } from "react";
import { ChevronDown } from "../../lib/icons";
import { cn } from "../../lib/utils";

/** A native single-choice field with the same tokens and focus treatment as Input. */
export function NativeSelect({
  className,
  compact = false,
  children,
  ...props
}: ComponentProps<"select"> & { compact?: boolean }) {
  return (
    <div className="relative min-w-0">
      <select
        className={cn(
          "w-full min-w-0 appearance-none rounded-[10px] border border-line-2 bg-frame pl-3 pr-8 text-fg outline-none",
          "transition-colors hover:border-fg-4 focus-visible:border-fg-3 focus-visible:ring-1 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
          compact ? "h-8 text-xs" : "h-9 text-base sm:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-3"
        size={14}
      />
    </div>
  );
}

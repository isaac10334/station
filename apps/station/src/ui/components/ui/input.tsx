import * as React from "react"

import { cn } from "../../lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-[10px] border border-line-2 bg-frame px-3 py-1 text-base text-fg shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-[13px] motion-reduce:transition-none",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

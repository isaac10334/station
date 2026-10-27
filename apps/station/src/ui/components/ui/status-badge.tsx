import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";

/** Compact, static adaptation of Stealth badge's soft/outline tones for dense trees.
 * Source: https://stealth.pm/r/badge.json. No width animation in a hierarchy row.
 */
export function StatusBadge({ tone = "neutral", icon, className, children, ...props }: ComponentProps<"span"> & {
  tone?: "neutral" | "info" | "warning"; icon?: ReactNode;
}) {
  return <span {...props} className={cn("inline-flex h-[18px] shrink-0 items-center gap-1 whitespace-nowrap rounded-[5px] border border-transparent px-1.5 text-[11px] font-medium leading-none", tone === "info" ? "bg-info-soft text-info" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-fg/7 text-fg-3", className)}>
    {icon && <span aria-hidden className="[&_svg]:size-3">{icon}</span>}{children}
  </span>;
}

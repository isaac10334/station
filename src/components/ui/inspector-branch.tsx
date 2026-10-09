import { useState, type ReactNode } from "react";

/** Native disclosure semantics and keyboard access, using the shared docking inspector tree geometry. */
export function InspectorBranch({ title, meta, children, initiallyOpen = true }: {
  title: ReactNode; meta?: ReactNode; children: ReactNode; initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details className="station-tree-branch" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span className="min-w-0 break-words">{title}</span>{meta !== undefined && <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-3">{meta}</span>}</summary>
    <div className="station-tree-children">{children}</div>
  </details>;
}

import { useState, type ReactNode } from "react";
import { Button } from "../ui/button";

/** Shared hierarchy/Inspector/inert-preview organization. Responsive behavior
 * depends on the widget container, so editors also work in compact dock slots. */
export function EditorWorkbench({ hierarchy, inspector, children }: { hierarchy: ReactNode; inspector: ReactNode; children: ReactNode }) {
  const [width, setWidth] = useState("fill");
  return <div className="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
    <div className="grid min-w-0 grid-cols-1 @min-[800px]:min-h-0 @min-[800px]:flex-1 @min-[800px]:grid-cols-[180px_minmax(0,1fr)_240px]">
      <aside aria-label="Definition hierarchy" className="min-w-0 border-b border-line p-3 @min-[800px]:overflow-auto @min-[800px]:border-r @min-[800px]:border-b-0"><h3 className="mb-3 text-sm font-medium">Hierarchy</h3>{hierarchy}</aside>
      <section aria-label="Responsive definition preview" className="min-w-0 bg-frame p-3 @min-[800px]:overflow-auto">
        <div role="group" aria-label="Preview width" className="mb-3 flex flex-wrap gap-1">{["375", "768", "fill"].map(value => <Button key={value} size="sm" variant={width === value ? "secondary" : "ghost"} aria-pressed={width === value} onClick={() => setWidth(value)}>{value === "fill" ? "Fit" : `${value}px`}</Button>)}</div>
        <p className="mb-3 text-xs text-fg-3">Inert preview · no scripts, services or actions run.</p>
        <div className="mx-auto max-w-full rounded border border-line bg-raised" style={{ width: width === "fill" ? "100%" : `${width}px` }}>{children}</div>
      </section>
      <aside aria-label="Definition Inspector" className="min-w-0 border-t border-line p-3 @min-[800px]:overflow-auto @min-[800px]:border-t-0 @min-[800px]:border-l"><h3 className="mb-3 text-sm font-medium">Inspector</h3>{inspector}</aside>
    </div>
  </div>;
}

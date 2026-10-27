import type { ReactNode } from "react";

/** Equal side tracks keep the center aligned with the surface. Wrap in the caller's toolbar primitive. */
export function ContentToolbar({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return <div className="content-toolbar">
    <div className="content-toolbar-left">{left}</div>
    <div className="content-toolbar-center">{center}</div>
    <div className="content-toolbar-right">{right}</div>
  </div>;
}

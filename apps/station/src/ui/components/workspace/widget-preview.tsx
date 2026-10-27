import { BUILTIN_AUTHORED_SURFACES } from "../../../core/authored-surface";
import { PortableSurface } from "./portable-surface";
import type { WidgetSeed } from "../../../core/widget-definitions";
import { BUILTIN_WIDGET_DEFINITIONS } from "../../../core/widget-definitions";

/** Inert renderer previews never acquire capabilities, navigate, run guests or
 * mount live services. The same preview is used by the catalog and visual editor. */
export function WidgetPreview({
  seed,
  small = false,
}: {
  seed: WidgetSeed;
  small?: boolean;
}) {
  const title =
    seed.defaults?.displayName || BUILTIN_WIDGET_DEFINITIONS[seed.widget].title;
  const shell = ["app-shell", "desktop-shell"].includes(seed.widget);
  return (
    <div
      aria-hidden="true"
      className={`station-widget-preview ${small ? "is-small" : ""}`}
      style={{ backgroundColor: seed.defaults?.background }}
    >
      {!seed.defaults?.hideDisplayName && (
        <div className="station-widget-preview-title">{title}</div>
      )}
      {(seed.defaults?.surface ?? BUILTIN_AUTHORED_SURFACES[seed.widget as keyof typeof BUILTIN_AUTHORED_SURFACES]) ? (
        <div inert className={small ? "max-h-24 overflow-hidden" : ""}><PortableSurface preview frame={(seed.defaults?.surface ?? BUILTIN_AUTHORED_SURFACES[seed.widget as keyof typeof BUILTIN_AUTHORED_SURFACES]).frame} onEvent={() => {}} /></div>
      ) : shell ? (
        <div
          className={`station-shell-preview ${seed.widget === "desktop-shell" ? "is-desktop" : ""}`}
        >
          <aside />
          <section>
            <div />
            <div />
          </section>
          <footer />
        </div>
      ) : seed.slots?.length ? (
        <div className="station-slot-preview">
          {seed.slots.map((slot, i) => (
            <div key={i}>
              {slot.length ? (
                slot.map((child, j) => (
                  <WidgetPreview key={j} seed={child} small />
                ))
              ) : (
                <span className="text-xs text-fg-3">Empty slot</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-2 p-3">
          <span className="h-2 w-3/4 rounded bg-selected" />
          <span className="h-2 w-1/2 rounded bg-hover" />
          <span className="h-2 w-2/3 rounded bg-hover" />
        </div>
      )}
    </div>
  );
}

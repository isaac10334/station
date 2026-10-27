import type { ReactNode } from "react";
import { bindAuthoredSurface, type AuthoredSurface } from "../../../core/authored-surface";
import { PortableSurface } from "./portable-surface";

/** One renderer for authored hierarchies. Controllers supply data and explicitly
 * named callbacks; source editing and inert previews never acquire a controller. */
export function AuthoredSurfaceView({ surface, inputs, actions = {}, buttonAppearance }: {
  surface: AuthoredSurface;
  inputs: Readonly<Record<string, string | boolean>>;
  actions?: Readonly<Partial<Record<"activate" | "locate", () => void>>>;
  buttonAppearance?: { variant: "default" | "secondary" | "outline" | "ghost"; fullWidth?: boolean; graphic?: ReactNode; tooltip?: string };
}) {
  try {
    const frame = bindAuthoredSurface(surface, inputs);
    return <><PortableSurface frame={frame} buttonAppearance={buttonAppearance} onEvent={event => {
      if (event.type === "activate") {
        const action = surface.actions[event.key];
        if (action) actions[action]?.();
      }
    }} />{inputs.error && <span role="alert" className="sr-only">{inputs.error}</span>}</>;
  } catch (error) {
    return <p role="alert" className="p-3 text-sm text-danger">{String(error)}. Open or fork the definition to repair its bindings. Authored source is retained.</p>;
  }
}

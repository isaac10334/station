import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
} from "react";
import type { Station } from "@station/capabilities/guest";
import { setIconOverrides } from "./theme-icons.js";
import * as Icons from "./icons.js";
import type { IconName } from "@station/capabilities/icons";
export * from "./icons.js";
export { setIconOverrides } from "./theme-icons.js";
/** The guest/host semantic icon catalog uses the same names and SVG mask renderer. */
export function Icon({ name, ...props }: Icons.IconProps & { name: IconName }) {
  const Component = Icons[name];
  return <Component {...props} />;
}
const tokens = {
  color: "var(--station-fg, #ededed)",
  fontFamily: "var(--station-font, system-ui)",
  borderRadius: "var(--station-radius, 8px)",
};
/** Portable guest controls depend on semantic variables, not Station's host DOM or Tailwind. */
export function Button({
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      style={{
        ...tokens,
        background: "var(--station-raised, #202020)",
        border: "1px solid var(--station-line, #393939)",
        padding: "8px 12px",
        fontSize: 13,
        cursor: props.disabled ? "default" : "pointer",
        opacity: props.disabled ? 0.45 : 1,
        ...style,
      }}
    />
  );
}
export function Surface({ style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{
        ...tokens,
        background: "var(--station-frame, #171717)",
        padding: "var(--station-spacing, 8px)",
        ...style,
      }}
    />
  );
}
export function Stack({
  direction = "column",
  gap = 8,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  direction?: CSSProperties["flexDirection"];
  gap?: number;
}) {
  return (
    <div
      {...props}
      style={{ display: "flex", flexDirection: direction, gap, ...style }}
    />
  );
}

/** Own this unsubscribe with your guest UI lifetime. SDK variables are applied by connect(). */
export const bindTheme = (station: Pick<Station, "theme">) =>
  station.theme.subscribe((theme) => setIconOverrides(theme.icons ?? {}));

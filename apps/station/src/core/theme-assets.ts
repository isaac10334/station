import { z } from "zod";
import { ICON_NAMES } from "@station/capabilities/icons";
import { validSourcePath } from "./source-project";

const color = z
  .string()
  .regex(
    /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|hsl|oklch)\([\d.,% /+-]+\))$/,
  );
/** Theme assets contain data, never CSS rules or external resources. */
export const themeSchema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["dark", "light"]),
    colors: z.object({
      frame: color,
      raised: color,
      fg: color,
      muted: color,
      line: color,
      selected: color,
      focus: color,
      danger: color,
    }),
    font: z.enum(["IBM Plex Sans", "IBM Plex Mono", "system-ui"]),
    density: z.enum(["compact", "comfortable"]),
    spacing: z.number().min(4).max(24),
    radius: z.number().min(0).max(24),
    icons: z
      .record(
        z
          .string()
          .refine(
            (name) => (ICON_NAMES as readonly string[]).includes(name),
            "Unknown semantic icon",
          ),
        z
          .object({
            assetId: z.string().max(160),
            path: z
              .string()
              .refine(validSourcePath)
              .refine((path) => path.endsWith(".svg")),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type ThemeDefinition = z.infer<typeof themeSchema>;
export const DEFAULT_THEME: ThemeDefinition = {
  version: 1,
  mode: "dark",
  colors: {
    frame: "#171717",
    raised: "#202020",
    fg: "#ededed",
    muted: "#999999",
    line: "#393939",
    selected: "#303030",
    focus: "#a5b4fc",
    danger: "#f87171",
  },
  font: "IBM Plex Sans",
  density: "compact",
  spacing: 8,
  radius: 8,
};
export function parseTheme(source: string): ThemeDefinition {
  const theme = themeSchema.parse(JSON.parse(source));
  if (
    typeof CSS !== "undefined" &&
    Object.values(theme.colors).some((value) => !CSS.supports("color", value))
  )
    throw new Error("Invalid theme color");
  return theme;
}
/** Only known properties are emitted. The same variables are sent to guest frames. */
export function themeVariables(theme: ThemeDefinition): Record<string, string> {
  const font = themeFont(theme.font);
  return {
    "--frame": theme.colors.frame,
    "--raised": theme.colors.raised,
    "--fg": theme.colors.fg,
    "--fg-2": theme.colors.fg,
    "--fg-3": theme.colors.muted,
    "--line": theme.colors.line,
    "--line-2": theme.colors.line,
    "--selected": theme.colors.selected,
    "--focus-ring": theme.colors.focus,
    "--danger": theme.colors.danger,
    "--font-sans": font,
    "--font-body": font,
    "--font-heading": font,
    "--spacing": `${theme.spacing / 2}px`,
    "--radius-sm": `${Math.max(0, theme.radius - 2)}px`,
    "--radius-md": `${theme.radius}px`,
    "--radius-lg": `${theme.radius + 2}px`,
    "--station-spacing": `${theme.spacing}px`,
    "--station-radius": `${theme.radius}px`,
  };
}
/** Match the bundled Fontsource family while retaining a local fallback in guest frames. */
export const themeFont = (font: ThemeDefinition["font"]) =>
  font === "IBM Plex Sans"
    ? '"IBM Plex Sans Variable", system-ui, sans-serif'
    : font === "IBM Plex Mono"
      ? '"IBM Plex Mono", ui-monospace, monospace'
      : "system-ui, sans-serif";

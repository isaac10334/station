import { parseThemeColor } from "./theme-color";
import { z } from "zod";
import { ICON_NAMES } from "@station/capabilities/icons";
import { validSourcePath } from "./source-project";

const color = z
  .string()
  .refine(
    (value) => parseThemeColor(value) !== null,
    "Use a hex, rgb, hsl, or oklch literal color.",
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
      sidebar: color.optional(),
    }),
    font: z.enum(["IBM Plex Sans", "IBM Plex Mono", "system-ui"]),
    density: z.enum(["compact", "comfortable"]),
    spacing: z.number().min(4).max(24),
    radius: z.number().min(0).max(24),
    tints: z.object({ blue: color, violet: color, coral: color, mint: color, slate: color }).strict().optional(),
    layout: z.object({
      pageGutter: z.number().min(16).max(96),
      pageTitle: z.number().min(24).max(48),
      rowHeight: z.number().min(28).max(56),
      toolbarHeight: z.number().min(32).max(56),
      bodySize: z.number().min(11).max(18).default(13),
    }).strict().optional(),
    syntax: z.object({ keyword: color, string: color, number: color, function: color }).strict().optional(),
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
/** Bounded renderer metrics, editable as theme data; older assets inherit these defaults. */
export const DEFAULT_THEME_LAYOUT = { pageGutter: 48, pageTitle: 34, rowHeight: 36, toolbarHeight: 40, bodySize: 13 };
export const DEFAULT_THEME_TINTS = { blue: "#5479a5", violet: "#7361b5", coral: "#b26649", mint: "#367b79", slate: "#73757d" };
export const DEFAULT_THEME: ThemeDefinition = {
  version: 1,
  mode: "light",
  colors: {
    frame: "#f7f6f3",
    raised: "#ffffff",
    sidebar: "#f0f1f4",
    fg: "#25262b",
    muted: "#73757d",
    line: "#dedee2",
    selected: "#e8e9ee",
    focus: "#7361b5",
    danger: "#c44b52",
  },
  font: "system-ui",
  density: "compact",
  spacing: 8,
  radius: 7,
  layout: { ...DEFAULT_THEME_LAYOUT },
  tints: { ...DEFAULT_THEME_TINTS },
};
export function parseTheme(source: string): ThemeDefinition {
  const theme = themeSchema.parse(JSON.parse(source));
  if (
    typeof CSS !== "undefined" &&
    [...Object.values(theme.colors), ...Object.values(theme.syntax ?? {}), ...Object.values(theme.tints ?? {})].some((value) => value !== undefined && !CSS.supports("color", value))
  )
    throw new Error("Invalid theme color");
  return theme;
}
/** Rebase a single visual edit on current source. Invalid Code edits are never
 * overwritten by a stale visual snapshot; callers retain the draft on failure.
 */
export function patchThemeSource(
  source: string,
  change: (theme: ThemeDefinition) => ThemeDefinition,
): string {
  const next = JSON.stringify(change(parseTheme(source)), null, 2);
  parseTheme(next);
  return next;
}
/** Only known properties are emitted. The same variables are sent to guest frames. */
export function themeVariables(theme: ThemeDefinition): Record<string, string> {
  const font = themeFont(theme.font);
  const layout = theme.layout ?? DEFAULT_THEME_LAYOUT;
  return {
    // Root theme mode selects defaults for un-authored tokens. Complete the
    // authored surface palette so background aliases cannot retain the opposite
    // mode's page/hover colors while foreground uses the asset's own colors.
    "--page": theme.colors.frame,
    "--frame": theme.colors.frame,
    "--raised": theme.colors.raised,
    "--sidebar": theme.colors.sidebar ?? theme.colors.frame,
    "--fg": theme.colors.fg,
    "--fg-2": theme.colors.fg,
    "--fg-3": theme.colors.muted,
    "--fg-4": theme.colors.muted,
    "--line": theme.colors.line,
    "--line-2": theme.colors.line,
    "--selected": theme.colors.selected,
    "--hover": theme.colors.selected,
    "--focus-ring": theme.colors.focus,
    "--danger": theme.colors.danger,
    "--syntax-keyword": theme.syntax?.keyword ?? theme.colors.focus,
    "--syntax-string": theme.syntax?.string ?? theme.colors.fg,
    "--syntax-number": theme.syntax?.number ?? theme.colors.focus,
    "--syntax-function": theme.syntax?.function ?? theme.colors.fg,
    "--font-sans": font,
    "--font-body": font,
    "--font-heading": font,
    "--spacing": `${theme.spacing / 2}px`,
    "--radius-sm": `${Math.max(0, theme.radius - 2)}px`,
    "--radius-md": `${theme.radius}px`,
    "--radius-lg": `${theme.radius + 2}px`,
    "--station-spacing": `${theme.spacing}px`,
    "--station-radius": `${theme.radius}px`,
    "--station-page-gutter": `${layout.pageGutter}px`,
    "--station-page-title": `${layout.pageTitle}px`,
    "--station-row-height": `${layout.rowHeight}px`,
    "--station-toolbar-height": `${layout.toolbarHeight}px`,
    "--station-body-size": `${layout.bodySize}px`,
    ...Object.fromEntries(Object.entries(theme.tints ?? { blue: theme.colors.focus, violet: theme.colors.focus, coral: theme.colors.danger, mint: theme.colors.focus, slate: theme.colors.muted }).map(([name, value]) => [`--widget-tint-${name}`, value])),
  };
}
/** Match the bundled Fontsource family while retaining a local fallback in guest frames. */
export const themeFont = (font: ThemeDefinition["font"]) =>
  font === "IBM Plex Sans"
    ? '"IBM Plex Sans Variable", system-ui, sans-serif'
    : font === "IBM Plex Mono"
      ? '"IBM Plex Mono", ui-monospace, monospace'
      : "system-ui, sans-serif";

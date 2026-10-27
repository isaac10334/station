/** Explicit theme inputs. Asset parsing and validation stay shared with existing theme authoring. */
import type { SemanticTokens } from "@loop-kit/ui";
import { themeFont, type ThemeDefinition } from "./theme-assets";
export function semanticTheme(inputs: {
  preference: "light" | "dark" | "system";
  systemDark: boolean;
  asset?: ThemeDefinition;
}): SemanticTokens {
  const mode =
    inputs.asset?.mode ??
    (inputs.preference === "system"
      ? inputs.systemDark
        ? "dark"
        : "light"
      : inputs.preference);
  const dark = mode === "dark",
    theme = inputs.asset;
  return {
    mode,
    color: {
      surface: theme?.colors.frame ?? (dark ? "#0d0d0d" : "#fbfbfa"),
      raised: theme?.colors.raised ?? (dark ? "#141414" : "#ffffff"),
      text: theme?.colors.fg ?? (dark ? "#ededed" : "#151515"),
      muted: theme?.colors.muted ?? (dark ? "#6b6b6b" : "#8d8d89"),
      border: theme?.colors.line ?? (dark ? "#1c1c1c" : "#ebebe8"),
      hover: theme?.colors.selected ?? (dark ? "#161616" : "#f1f1ef"),
      selection: theme?.colors.selected ?? (dark ? "#303030" : "#e8e8e5"),
      focus: theme?.colors.focus ?? (dark ? "#a5b4fc" : "#67528c"),
      disabled: theme?.colors.muted ?? (dark ? "#454545" : "#b8b8b3"),
      danger: theme?.colors.danger ?? (dark ? "#e5646a" : "#d23f45"),
    },
    typography: {
      family: themeFont(theme?.font ?? "IBM Plex Sans"),
      body: theme?.layout?.bodySize ?? 13,
      label: 12,
      lineHeight: 1.5,
    },
    spacing: {
      unit: theme?.spacing ?? 8,
      control: theme?.density === "comfortable" ? 36 : 28,
      row: theme?.layout?.rowHeight ?? 36,
    },
    radius: theme?.radius ?? 8,
    icon: { small: 14, medium: 16, large: 20 },
  };
}
/** Renderer mapping uses the same names as authored-theme/guest variables. */
export function semanticTokenVariables(
  tokens: SemanticTokens,
): Record<string, string> {
  return {
    "--page": tokens.color.surface,
    "--frame": tokens.color.surface,
    "--raised": tokens.color.raised,
    "--fg": tokens.color.text,
    "--fg-3": tokens.color.muted,
    "--line": tokens.color.border,
    "--hover": tokens.color.hover,
    "--selected": tokens.color.selection,
    "--focus-ring": tokens.color.focus,
    "--danger": tokens.color.danger,
    // Rebind aliases at this scope: inherited CSS aliases resolve at their owner.
    "--background": tokens.color.surface,
    "--foreground": tokens.color.text,
    "--primary": tokens.color.text,
    "--primary-foreground": tokens.color.surface,
    "--secondary": tokens.color.raised,
    "--secondary-foreground": tokens.color.text,
    "--muted": tokens.color.hover,
    "--muted-foreground": tokens.color.muted,
    "--accent-ui": tokens.color.hover,
    "--accent-ui-foreground": tokens.color.text,
    "--border": tokens.color.border,
    "--ring": tokens.color.focus,
    "--font-body": tokens.typography.family,
    "--station-spacing": `${tokens.spacing.unit}px`,
    "--station-radius": `${tokens.radius}px`,
  };
}

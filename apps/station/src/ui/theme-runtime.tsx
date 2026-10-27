import { builtinIconAsset } from "../core/builtin-icons";
import { useEffect, useRef } from "react";
import type { Workspace } from "../core/workspace-state";
import { deps } from "../composition";
import { setIconOverrides } from "@station/ui/theme-icons";
import { resolvedSvgIcon } from "../services/svg-icons";
import { assetFiles } from "../core/source-project";
import {
  parseTheme,
  themeVariables,
  type ThemeDefinition,
} from "../core/theme-assets";

/** Applies validated asset data; an invalid edit keeps the previous valid token set. */
export function ThemeAssets({ workspace }: { workspace: Workspace }) {
  const last = useRef<{ id: string; theme: ThemeDefinition } | null>(null),
    previous = useRef<Record<string, string>>({});
  const desk = workspace.desks.find(
    (desk) => desk.id === workspace.activeDeskId,
  )!;
  const id = desk.themeId ?? workspace.themeId;
  const asset = workspace.assets.find(
    (asset) => asset.id === id && asset.kind === "theme",
  );
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      for (const [key, value] of Object.entries(previous.current))
        value
          ? root.style.setProperty(key, value)
          : root.style.removeProperty(key);
      previous.current = {};
      setIconOverrides({});
      const app = deps.store.get().app;
      root.dataset.theme =
        app.theme === "system"
          ? matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : app.theme;
      root.dataset.density = app.density;
    };
    if (!id || !asset) {
      clear();
      last.current = null;
      return;
    }
    try {
      last.current = { id, theme: parseTheme(asset.files!["theme.json"]!) };
    } catch {
      if (last.current?.id !== id) {
        clear();
        return;
      }
    }
    if (!last.current) return;
    for (const [key, value] of Object.entries(
      themeVariables(last.current.theme),
    )) {
      if (!(key in previous.current))
        previous.current[key] = root.style.getPropertyValue(key);
      root.style.setProperty(key, value);
    }
    const icons: Record<string, string> = {};
    for (const [name, reference] of Object.entries(
      last.current.theme.icons ?? {},
    )) {
      const source = workspace.assets.find(
        (asset) => asset.id === reference.assetId,
      ) ?? builtinIconAsset(reference.assetId);
      try {
        if (source)
          icons[name] = resolvedSvgIcon(assetFiles(source)[reference.path]!);
      } catch {
        /* Invalid images retain their trusted built-in glyph. */
      }
    }
    setIconOverrides(icons);
    root.dataset.theme = last.current.theme.mode;
    root.dataset.density = last.current.theme.density;
  }, [id, asset?.revision, workspace.assets]);
  useEffect(
    () => () => {
      const root = document.documentElement;
      setIconOverrides({});
      for (const [key, value] of Object.entries(previous.current))
        value
          ? root.style.setProperty(key, value)
          : root.style.removeProperty(key);
    },
    [],
  );
  return null;
}

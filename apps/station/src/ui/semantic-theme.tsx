import { builtinIconAsset } from "../core/builtin-icons";
/** Explicit host theme/icon context. DOM globals remain an outer compatibility adapter. */
import {
  createContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Workspace } from "../core/workspace-state";
import { parseTheme, type ThemeDefinition } from "../core/theme-assets";
import { semanticTheme } from "../core/semantic-theme";
import { assetFiles } from "../core/source-project";
import { IconResolutionContext, type IconResolution } from "./semantic-icons";
export const SemanticThemeContext = createContext(
  semanticTheme({ preference: "dark", systemDark: true }),
);
const subscribeSystem = (listener: () => void) => {
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const systemSnapshot = () => matchMedia("(prefers-color-scheme: dark)").matches;
export function SemanticThemeProvider({
  workspace,
  preference,
  children,
  resolveSvg,
}: {
  workspace: Workspace;
  preference: "light" | "dark" | "system";
  children: ReactNode;
  resolveSvg?: (source: string) => string;
}) {
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    systemSnapshot,
    () => true,
  );
  const last = useRef<{ id: string; theme: ThemeDefinition } | undefined>(
    undefined,
  );
  const id =
    workspace.desks.find((desk) => desk.id === workspace.activeDeskId)
      ?.themeId ?? workspace.themeId;
  const asset = workspace.assets.find(
    (asset) => asset.id === id && asset.kind === "theme",
  );
  const resolved = useMemo(() => {
    if (!asset) {
      last.current = undefined;
      return undefined;
    }
    try {
      const theme = parseTheme(asset.files!["theme.json"]!);
      last.current = { id: asset.id, theme };
      return theme;
    } catch {
      return last.current?.id === asset.id ? last.current.theme : undefined;
    }
  }, [asset?.id, asset?.revision]);
  const tokens = useMemo(
    () => semanticTheme({ preference, systemDark, asset: resolved }),
    [preference, systemDark, resolved],
  );
  const icons = useMemo<IconResolution>(() => {
    const assetIcon = (assetId: string, path: string) => {
      const source = workspace.assets.find((asset) => asset.id === assetId) ?? builtinIconAsset(assetId);
      try {
        return source ? resolveSvg?.(assetFiles(source)[path]!) : undefined;
      } catch {
        return undefined;
      }
    };
    return {
      sizes: tokens.icon,
      asset: assetIcon,
      providers: {},
      symbols: Object.fromEntries(
        Object.entries(resolved?.icons ?? {}).flatMap(([name, ref]) => {
          const url = assetIcon(ref.assetId, ref.path);
          return url ? [[name, url]] : [];
        }),
      ),
    };
  }, [workspace.assets, resolved, resolveSvg, tokens]);
  return (
    <SemanticThemeContext.Provider value={tokens}>
      <IconResolutionContext.Provider value={icons}>
        {children}
      </IconResolutionContext.Provider>
    </SemanticThemeContext.Provider>
  );
}

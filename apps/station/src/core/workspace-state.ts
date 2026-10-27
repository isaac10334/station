/** Pure persisted workspace shapes. Live scopes, credentials and handles never enter these values. */
import type { Asset } from "./asset-state";
import type { AssetGroup } from "./asset-groups";
import type { Desk, DeskSetup } from "./desks";
import type { PackageInstallation } from "./package-assets";
import type { DockLayout } from "./docking";
import type { NavigationFilter } from "./navigation-filter";
export type Workspace = {
  /** Authored preferences, never live native registrations or grants. */
  shortcuts?: import("./shortcuts").ShortcutSettings;
  programming?: import("./programs").ProgrammingState;
  id: string;
  name: string;
  description: string;
  selectedAssetId: string | null;
  assets: Asset[];
  /** Visual organization; asset identity is independent of group membership. */
  assetGroups?: AssetGroup[];
  desks: Desk[];
  activeDeskId: string;
  defaultSetup: DeskSetup | null;
  /** Asset selected for future desks; legacy defaultSetup remains a compatibility fallback. */
  defaultTemplateId?: string;
  installations: PackageInstallation[];
  themeId: string | null;
  editorDefaults: Record<string, string>;
  editorPolicyId?: string;
  dock: DockLayout;
  navigation: NavigationFilter;
};

export type AppSettings = {
  theme: "dark" | "light" | "system";
  density: "compact" | "comfortable";
  accent: "indigo" | "blue" | "cyan" | "violet";
  ai: {
    provider: "openrouter" | "vercel";
    openrouter: { key: string; model: string; url: string };
    vercel: { key: string; model: string; url: string };
  };
};

export type State = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  app: AppSettings;
};

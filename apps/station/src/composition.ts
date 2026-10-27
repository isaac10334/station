import { createComposition } from "./application";
import type { KeyValueStorage } from "./contracts/storage";
import { createWorkspaceSharing } from "./services/workspace-sharing";
export { createComposition } from "./application";

/** Browser-only bootstrap. Headless consumers import application.ts instead. */
const browserStorage: KeyValueStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

export const deps = createComposition(browserStorage);
export const packageRuntime = deps.packageRuntime;
export const sharing = createWorkspaceSharing(deps.store);

const SESSION_KEY = "unit-workspace.demo-session.v1";
export const demoSession = {
  get(): { kind: "guest" | "demo"; email?: string } | null {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return value?.kind === "guest" || value?.kind === "demo" ? value : null;
    } catch {
      return null;
    }
  },
  set(value: { kind: "guest" | "demo"; email?: string } | null) {
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  },
};

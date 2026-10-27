import { createContext, useContext, type ReactNode } from "react";
import type { DesktopShortcutsPort } from "../contracts/shortcuts";
const Context = createContext<DesktopShortcutsPort | null>(null);
export function ShortcutServices({ value, children }: { value: DesktopShortcutsPort; children: ReactNode }) { return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useShortcutServices() { const value = useContext(Context); if (!value) throw new Error("Shortcut services were not composed"); return value; }

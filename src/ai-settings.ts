import type { KeyValueStorage } from "./model";

const SETTINGS_KEY = "station.ai-settings.v1";
export type AISettings = Readonly<{ apiKey: string; model: string; rememberKey: boolean }>;
/** User-owned credentials are separate from workspace content, grants and tool output.
 * Memory is the default. Remembering opts into plaintext browser storage accessible
 * to same-origin scripts; this is not a secure credential vault.
 */
export function createAISettings(storage: KeyValueStorage) {
  let current: AISettings = { apiKey: "", model: "openai/gpt-4.1-mini", rememberKey: false };
  try {
    const saved = JSON.parse(storage.getItem(SETTINGS_KEY) || "null");
    if (saved && typeof saved.model === "string") current = {
      model: saved.model, apiKey: saved.rememberKey === true && typeof saved.apiKey === "string" ? saved.apiKey : "", rememberKey: saved.rememberKey === true,
    };
  } catch { /* A malformed setting must not prevent Station from opening. */ }
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    save(next: AISettings) {
      if (!/^[\w.-]+\/[\w./:-]+$/.test(next.model.trim())) throw new Error("Use a Gateway model ID such as openai/gpt-4.1-mini.");
      const value = Object.freeze({ ...next, apiKey: next.apiKey.trim(), model: next.model.trim() });
      storage.setItem(SETTINGS_KEY, JSON.stringify({ ...value, apiKey: value.rememberKey ? value.apiKey : "" }));
      current = value;
      for (const listener of listeners) listener();
    },
  };
}
export type AISettingsStore = ReturnType<typeof createAISettings>;

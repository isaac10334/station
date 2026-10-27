import type { KeyValueStorage } from "../../../contracts/storage";
import { DEFAULT_CHAT_MODEL } from "../../../core/chat-models";

const SETTINGS_KEY = "station.ai-settings.v1";
import type { AISettings } from "../../../contracts/widget-runtime";
export type { AISettings, AISettingsStore } from "../../../contracts/widget-runtime";
/** User-owned credentials are separate from workspace content, grants and tool output.
 * Memory is the default. Remembering opts into plaintext browser storage accessible
 * to same-origin scripts; this is not a secure credential vault.
 */
export function createAISettings(storage: KeyValueStorage) {
  let current: AISettings = { apiKey: "", model: DEFAULT_CHAT_MODEL, rememberKey: false };
  try {
    const saved = JSON.parse(storage.getItem(SETTINGS_KEY) || "null");
    if (saved && typeof saved.model === "string" && saved.model.length <= 200 && /^[\w.-]+\/[\w./:-]+$/.test(saved.model)) current = {
      model: saved.model, apiKey: saved.rememberKey === true && typeof saved.apiKey === "string" ? saved.apiKey : "", rememberKey: saved.rememberKey === true,
    };
  } catch { /* A malformed setting must not prevent Station from opening. */ }
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    save(next: AISettings) {
      if (next.model.trim().length > 200 || !/^[\w.-]+\/[\w./:-]+$/.test(next.model.trim())) throw new Error(`Use a Gateway model ID such as ${DEFAULT_CHAT_MODEL}.`);
      const value = Object.freeze({ ...next, apiKey: next.apiKey.trim(), model: next.model.trim() });
      storage.setItem(SETTINGS_KEY, JSON.stringify({ ...value, apiKey: value.rememberKey ? value.apiKey : "" }));
      current = value;
      for (const listener of listeners) listener();
    },
  };
}

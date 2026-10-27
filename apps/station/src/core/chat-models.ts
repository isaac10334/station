/** Curated public Gateway catalog, checked 2026-10-14. Base USD/M tokens;
 * context tiers, caching, reasoning tokens and account availability can differ.
 * Keep this headless data separate from the picker and user credentials.
 */
export const DEFAULT_CHAT_MODEL = "openai/gpt-6-luna";
export const CHAT_MODELS = [
  {
    id: DEFAULT_CHAT_MODEL,
    name: "GPT-6 Luna",
    input: 0.1,
    output: 0.5,
    tags: ["reasoning", "tools", "vision", "long-context"],
  },
  {
    id: "anthropic/claude-haiku-5.5",
    name: "Claude Haiku 5.5",
    input: 0.1,
    output: 0.5,
    tags: ["reasoning", "tools", "vision", "long-context"],
  },
  {
    id: "openai/gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    input: 2,
    output: 10,
    tags: ["reasoning", "tools", "vision", "long-context"],
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    name: "Claude Sonnet 5.5",
    input: 2,
    output: 10,
    tags: ["reasoning", "tools", "vision", "long-context"],
  },
  {
    id: "google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    input: 1.5,
    output: 9,
    tags: ["reasoning", "tools", "vision", "long-context"],
  },
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 mini",
    input: 0.4,
    output: 1.6,
    tags: ["tools", "vision", "long-context"],
  },
] as const;

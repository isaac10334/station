/** Trusted in-process AI contract. Callbacks/tools are host values, never iframe RPC values. */
import { defineCapability } from "@loop-kit/capabilities";
import type { ModelMessage, ToolSet } from "ai";
/** Bounded inert tool progress; excludes provider errors and credentials. */
export type AIProgress = {
  id: string;
  name: string;
  state: "running" | "done" | "error";
  result?: string;
};
export interface AIConversation {
  /** Streams a bounded turn. Tool implementations belong to Station and enforce grants.
   * Text/progress callbacks are inert display data, never HTML or authority.
   * Cancellation rejects and stops callbacks, including pending tool reviews.
   * Limits: 100 input messages / 128k serialized characters, 64k reply characters,
   * 8192 output tokens, twelve steps, 180 seconds. No automatic retry/model switch.
   */
  run(
    messages: ModelMessage[],
    tools: ToolSet,
    signal: AbortSignal,
    onText: (text: string) => void,
    onProgress?: (event: AIProgress) => void,
  ): Promise<ModelMessage[]>;
}
export const legacyAIConversation = defineCapability<AIConversation>({
  id: "unit:workspace/ai-conversation",
  version: "1.0.0",
});

export const aiConversation = defineCapability<AIConversation>({ id: "station:ai/conversation", version: "1.0.0" });

/** Trusted local draft writer; callers must obtain human review for each save.
 * Creates new Markdown source only, never edits, installs or executes content. */
export const aiNoteDraftWriter = defineCapability<{ create(name: string, markdown: string): { id: string; name: string } }>({ id: "station:ai/note-drafts", version: "1.0.0" });

/** Trusted in-process AI contract. Callbacks/tools are host values, never iframe RPC values. */
import { defineCapability } from "@loop-kit/capabilities";
import type { ModelMessage, ToolSet } from "ai";
export interface AIConversation {
  /** Streams a bounded turn. Tool implementations belong to Station and enforce grants. */
  run(messages: ModelMessage[], tools: ToolSet, signal: AbortSignal, onText: (text: string) => void): Promise<ModelMessage[]>;
}
export const aiConversation = defineCapability<AIConversation>({ id: "unit:workspace/ai-conversation", version: "1.0.0" });


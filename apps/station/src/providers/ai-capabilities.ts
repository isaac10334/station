import { defineCapability } from "@loop-kit/capabilities";
import type { Host } from "@loop-kit/host";
import { createGateway, streamText, isStepCount, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import type { AISettingsStore } from "../services/ai-settings";
import { STATION_ASSISTANT_CONTEXT } from "./station-assistant-context";

import { aiConversation, type AIConversation } from "../contracts/ai-conversation";
export { aiConversation } from "../contracts/ai-conversation";
/** The key only enters the fixed Gateway provider, never prompts, tools or diagnostics. */
export function provideAIConversation(host: Host, settings: AISettingsStore, resolveModel: (key: string, model: string) => LanguageModel = (apiKey, model) => createGateway({ apiKey })(model)) {
  host.define(aiConversation, { name: "AI conversation", description: "run(messages, tools, signal, onText): Promise<ModelMessage[]> — send conversation and approved tool results to Vercel AI Gateway using the user's key." });
  host.provide(aiConversation, {
    create: ({ signal: ownedSignal }) => ({
      async run(messages, tools, signal, onText) {
        const { apiKey, model } = settings.get();
        if (!apiKey) throw new Error("Add your AI Gateway key in AI settings.");
        const abortSignal = AbortSignal.any([ownedSignal, signal, AbortSignal.timeout(120_000)]);
        abortSignal.throwIfAborted();
        const result = streamText({
          model: resolveModel(apiKey, model), messages, tools, abortSignal,
          system: STATION_ASSISTANT_CONTEXT,
          stopWhen: isStepCount(5), maxOutputTokens: 4096, maxRetries: 0, onError: () => {},
        });
        for await (const part of result.fullStream) {
          abortSignal.throwIfAborted();
          if (part.type === "text-delta") onText(part.text);
          if (part.type === "error") throw new Error("Gateway request failed. Check your key, model and Gateway credits, then retry.");
        }
        abortSignal.throwIfAborted();
        return await result.responseMessages;
      },
    }),
  }, { name: "Vercel AI Gateway", description: "Direct browser requests with a user-provided key; cancellable, five steps and 120 seconds per turn. No server-side credentials." });
}

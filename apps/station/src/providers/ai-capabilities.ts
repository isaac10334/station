import { provideCompatibilityAlias } from "./capability-aliases";
import type { Host } from "@loop-kit/host";
import { createGateway, streamText, isStepCount, type LanguageModel } from "ai";
import type { AISettingsStore } from "../features/ai/application/settings";
import { STATION_ASSISTANT_CONTEXT } from "./station-assistant-context";

import { aiConversation, legacyAIConversation } from "../contracts/ai-conversation";
export { aiConversation } from "../contracts/ai-conversation";
/** The key only enters the fixed Gateway provider, never prompts, tools or diagnostics. */
export function provideAIConversation(
  host: Host,
  settings: AISettingsStore,
  resolveModel: (key: string, model: string) => LanguageModel = (
    apiKey,
    model,
  ) => createGateway({ apiKey })(model),
) {
  provideCompatibilityAlias(host, legacyAIConversation, aiConversation);
  host.define(aiConversation, {
    name: "AI conversation",
    description:
      "run(messages, tools, signal, onText): Promise<ModelMessage[]> — send conversation and approved tool results to Vercel AI Gateway using the user's key.",
  });
  host.provide(
    aiConversation,
    {
      create: ({ signal: ownedSignal }) => ({
        async run(messages, tools, signal, onText, onProgress) {
          const { apiKey, model } = settings.get();
          if (!apiKey)
            throw new Error("Add your AI Gateway key in AI settings.");
          const controller = new AbortController();
          const abortSignal = AbortSignal.any([
            ownedSignal,
            signal,
            controller.signal,
            AbortSignal.timeout(180_000),
          ]);
          abortSignal.throwIfAborted();
          if (
            messages.length > 100 ||
            JSON.stringify(messages).length > 128_000
          )
            throw new Error("Conversation limit");
          const result = streamText({
            model: resolveModel(apiKey, model),
            messages,
            tools,
            abortSignal,
            system: STATION_ASSISTANT_CONTEXT,
            stopWhen: isStepCount(12),
            maxOutputTokens: 8192,
            maxRetries: 0,
            onError: () => {},
          });
          try {
            let textLength = 0;
            for await (const part of result.fullStream) {
              abortSignal.throwIfAborted();
              if (part.type === "text-delta") {
                textLength += part.text.length;
                if (textLength > 65536)
                  throw new Error("Reply limit exceeded.");
                onText(part.text);
              }
              if (part.type === "tool-call")
                onProgress?.({
                  id: part.toolCallId,
                  name: part.toolName,
                  state: "running",
                });
              if (part.type === "tool-result")
                onProgress?.({
                  id: part.toolCallId,
                  name: part.toolName,
                  state: "done",
                  result: JSON.stringify(part.output).slice(0, 8000),
                });
              if (part.type === "tool-error")
                onProgress?.({
                  id: part.toolCallId,
                  name: part.toolName,
                  state: "error",
                  result: "Tool failed or access was cancelled.",
                });
              if (part.type === "abort") throw new Error("Response stopped.");
              if (part.type === "error")
                throw new Error(
                  "Gateway request failed. Check your key, model and Gateway credits, then retry.",
                );
            }
            abortSignal.throwIfAborted();
            return await result.responseMessages;
          } finally {
            controller.abort();
          }
        },
      }),
    },
    {
      name: "Vercel AI Gateway",
      description:
        "Direct browser requests with a user-provided key; cancellable, twelve steps and 180 seconds per turn. No server-side credentials.",
    },
  );
}

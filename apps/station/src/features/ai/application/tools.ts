import { tool, jsonSchema, type ToolSet } from "ai";
import { z } from "zod";
import {
  stationAssetCatalog as assetCatalog,
  stationAssetReader as assetReader,
  stationWebDraftWriter as webDraftWriter,
} from "@station/capabilities";

import { aiConversation, aiNoteDraftWriter } from "../../../contracts/ai-conversation";
import type { GrantedWidgetScope } from "../../../contracts/widget-runtime";
import type { createStationControl, InvocationContext } from "../../commands/application/runtime";
import { createCommandClient } from "../../commands/application/client";

/** Task mode uses exactly the external command schemas/policy. Legacy draft tools
 * remain separate until the user explicitly selects an authorized internal task.
 */
export function createAuthorizedAITools(control: ReturnType<typeof createStationControl>, context: InvocationContext, turnSignal?: AbortSignal): ToolSet {
  const tools: ToolSet = {};
  const commands = createCommandClient({ version: control.version, subscribe: control.subscribe, execute: request => control.executeFor(context, request) });
  const task = control.inspectAccess().tasks.find(t => t.id === context.taskId);
  if (!task || task.source !== "internal") throw new Error("Explicit internal task required");
  for (const command of control.describe()) {
    if (!task.scope.operations.includes(command.method) && !["permissions.inspect", "permissions.request", "operations.inspect", "operations.cancel"].includes(command.method)) continue;
    tools[`station_${command.method.replaceAll(".", "_")}`] = tool({
      description: `${command.description}. Inspect state for a current version before mutation.`,
      inputSchema: jsonSchema<{ params?: unknown; version?: { epoch: string; revision: number }; requestId?: string }>({ type: "object", properties: { params: JSON.parse(JSON.stringify(command.schema)), version: { type: "object", properties: { epoch: { type: "string" }, revision: { type: "integer", minimum: 0 } }, required: ["epoch", "revision"], additionalProperties: false }, requestId: { type: "string", maxLength: 200 } }, additionalProperties: false }),
      execute: async (request, options) => {
        const signals = [turnSignal, options.abortSignal].filter((signal): signal is AbortSignal => !!signal);
        const signal = signals.length ? AbortSignal.any(signals) : undefined;
        signal?.throwIfAborted();
        const response = control.executeFor(context, { method: command.method, ...request });
        if (!response.result?.operationId) return response;
        const result = await commands.wait(response.result.operationId, signal);
        const version = control.version();
        return { result, version, revision: version.revision };
      },
    });
  }
  return tools;
}

/** Explicit operation metadata maps capability authority to model-facing tools. */
export const AI_GRANTS = [
  { id: aiNoteDraftWriter.id, name: "Create Markdown drafts", description: "Propose notes, plans and summaries. Review the full source before each save." },
  {
    id: aiConversation.id,
    name: "Use AI Gateway",
    description:
      "Send messages and enabled tool results to your selected model.",
  },
  {
    id: assetCatalog.id,
    name: "List assets",
    description:
      "Share asset names, IDs, kinds and revisions. Excludes source.",
  },
  {
    id: assetReader.id,
    name: "Read asset source",
    description: "Share the source of requested assets with the model.",
  },
  {
    id: webDraftWriter.id,
    name: "Create web drafts",
    description: "Propose new HTML assets. Each save requires your review.",
  },
] as const;
import type { DraftProposal, ChatContextRead } from "../contracts/chat";
export type { DraftProposal, ChatContextRead } from "../contracts/chat";
/** Exact inert resource result shared with the model, retained only by this chat. */


/** Only granted tools are advertised. Execution acquires checked, owned providers.
 * Approval is supplied by trusted UI, never inferred from model text.
 */
export function createAITools(
  scope: GrantedWidgetScope,
  grants: ReadonlySet<string>,
  review: (draft: DraftProposal) => Promise<boolean>,
  onActivity: (message: string) => void,
  onContext: (read: ChatContextRead) => void = () => {},
): ToolSet {
  const tools: ToolSet = {};
  let contextBytes = 0;
  let contextReads = 0;
  const record = (resource: string, result: unknown) => {
    scope.signal.throwIfAborted();
    if (++contextReads > 20)
      throw new Error("Context read count exceeded for this turn.");
    const content = JSON.stringify(result);
    contextBytes += new TextEncoder().encode(content).byteLength;
    if (contextBytes > 96 * 1024)
      throw new Error("Context read budget exceeded for this turn.");
    onContext({ resource, content });
    return result;
  };
  if (grants.has(assetCatalog.id))
    tools.listAssets = tool({
      description:
        "List asset metadata in this workspace; does not read source.",
      inputSchema: z.object({}),
      execute: async (_input, options) => {
        options.abortSignal?.throwIfAborted();
        const catalog = await scope.acquire(assetCatalog);
        options.abortSignal?.throwIfAborted();
        const result = catalog.list();
        onActivity(
          `Listed ${Math.min(result.length, 200)} of ${result.length} assets`,
        );
        return record("Asset metadata", {
          assets: result.slice(0, 200),
          total: result.length,
        });
      },
    });
  if (grants.has(assetReader.id))
    tools.readAsset = tool({
      description: "Read the source of an asset by ID in this workspace.",
      inputSchema: z.object({ id: z.string().min(1).max(200) }),
      execute: async ({ id }, options) => {
        options.abortSignal?.throwIfAborted();
        const reader = await scope.acquire(assetReader);
        options.abortSignal?.throwIfAborted();
        const result = reader.read(id);
        const shared = record(`Asset source: ${id}`, result);
        onActivity(`Read source: ${result.name}`);
        return shared;
      },
    });
  if (grants.has(webDraftWriter.id))
    tools.createWebDraft = tool({
      description:
        "Propose a new HTML asset for user review. Never edits or runs assets.",
      inputSchema: z.object({
        name: z.string().min(1).max(120),
        html: z.string().max(65536),
      }),
      execute: async (draft, options) => {
        scope.signal.throwIfAborted();
        onActivity(`Awaiting review: ${draft.name}`);
        const signal = options.abortSignal
          ? AbortSignal.any([scope.signal, options.abortSignal])
          : scope.signal;
        const allowed = await new Promise<boolean>((resolve, reject) => {
          const abort = () => reject(new Error("Draft review cancelled."));
          if (signal.aborted) {
            abort();
            return;
          }
          signal.addEventListener("abort", abort, { once: true });
          void review(draft)
            .then(resolve, reject)
            .finally(() => signal.removeEventListener("abort", abort));
        });
        signal.throwIfAborted();
        if (!allowed) {
          onActivity(`Declined draft: ${draft.name}`);
          return { status: "declined" };
        }
        const writer = await scope.acquire(webDraftWriter);
        signal.throwIfAborted();
        const result = writer.create(draft.name, draft.html);
        onActivity(`Saved draft: ${result.name}`);
        return { status: "saved", ...result };
      },
    });
  if (grants.has(aiNoteDraftWriter.id)) tools.createMarkdownDraft = tool({
    description: "Propose a new Markdown note, plan or summary. The user reviews its complete source before saving. Never edits existing assets or runs code.",
    inputSchema: z.object({ name: z.string().trim().min(1).max(120), markdown: z.string().max(65536) }),
    execute: async (draft, options) => {
      const signal = options.abortSignal ? AbortSignal.any([scope.signal, options.abortSignal]) : scope.signal;
      signal.throwIfAborted();
      onActivity(`Awaiting review: ${draft.name}`);
      const allowed = await new Promise<boolean>((resolve, reject) => {
        const abort = () => reject(new Error("Draft review cancelled."));
        signal.addEventListener("abort", abort, { once: true });
        void review({ ...draft, format: "markdown" }).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
      });
      signal.throwIfAborted();
      if (!allowed) { onActivity(`Declined draft: ${draft.name}`); return { status: "declined" }; }
      const writer = await scope.acquire(aiNoteDraftWriter);
      signal.throwIfAborted();
      const result = writer.create(draft.name, draft.markdown);
      onActivity(`Saved note: ${result.name}`);
      return { status: "saved", ...result };
    },
  });
  return tools;
}

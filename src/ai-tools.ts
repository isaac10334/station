import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { assetCatalog, assetReader, webDraftWriter } from "./workspace-capabilities";
import { aiConversation } from "./ai-capabilities";
import type { GrantedWidgetScope } from "./widget-grants";

/** Explicit operation metadata maps capability authority to model-facing tools. */
export const AI_GRANTS = [
  { id: aiConversation.id, name: "Use AI Gateway", description: "Send messages and enabled tool results to your selected model." },
  { id: assetCatalog.id, name: "List assets", description: "Share asset names, IDs, kinds and revisions. Excludes source." },
  { id: assetReader.id, name: "Read asset source", description: "Share the source of requested assets with the model." },
  { id: webDraftWriter.id, name: "Create web drafts", description: "Propose new HTML assets. Each save requires your review." },
] as const;
export type DraftProposal = { name: string; html: string };

/** Only granted tools are advertised. Execution acquires checked, owned providers.
 * Approval is supplied by trusted UI, never inferred from model text.
 */
export function createAITools(scope: GrantedWidgetScope, grants: ReadonlySet<string>, review: (draft: DraftProposal) => Promise<boolean>, onActivity: (message: string) => void): ToolSet {
  const tools: ToolSet = {};
  if (grants.has(assetCatalog.id)) tools.listAssets = tool({
    description: "List asset metadata in this workspace; does not read source.", inputSchema: z.object({}),
    execute: async () => { const catalog = await scope.acquire(assetCatalog); const result = catalog.list(); onActivity(`Listed ${Math.min(result.length, 200)} of ${result.length} assets`); return { assets: result.slice(0, 200), total: result.length }; },
  });
  if (grants.has(assetReader.id)) tools.readAsset = tool({
    description: "Read the source of an asset by ID in this workspace.", inputSchema: z.object({ id: z.string().min(1).max(200) }),
    execute: async ({ id }) => { const reader = await scope.acquire(assetReader); const result = reader.read(id); onActivity(`Read source: ${result.name}`); return result; },
  });
  if (grants.has(webDraftWriter.id)) tools.createWebDraft = tool({
    description: "Propose a new HTML asset for user review. Never edits or runs assets.", inputSchema: z.object({ name: z.string().min(1).max(120), html: z.string().max(65536) }),
    execute: async draft => {
      onActivity(`Awaiting review: ${draft.name}`);
      if (!await review(draft)) { onActivity(`Declined draft: ${draft.name}`); return { status: "declined" }; }
      const writer = await scope.acquire(webDraftWriter);
      const result = writer.create(draft.name, draft.html);
      onActivity(`Saved draft: ${result.name}`);
      return { status: "saved", ...result };
    },
  });
  return tools;
}

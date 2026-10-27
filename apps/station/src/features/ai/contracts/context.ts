import { z } from "zod";

/** Explicit user selection, pinned to the source revision shown in the composer.
 * Selection shares only this source snapshot; it confers no model tool authority. */
export const promptReferenceSchema = z.object({ assetId: z.string().min(1).max(160), path: z.string().max(240).optional(), revision: z.number().int().nonnegative() }).strict();
export type PromptReference = z.infer<typeof promptReferenceSchema>;
export type PromptSource = PromptReference & { name: string; kind: string };
export type PromptAttachment = PromptSource & { content: string };
export interface PromptContextPort {
  list(workspaceId: string): readonly PromptSource[];
  read(workspaceId: string, reference: PromptReference): PromptAttachment;
  subscribe(listener: () => void): () => void;
}

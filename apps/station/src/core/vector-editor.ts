import { z } from "zod";

/** Document commands stay in the isolated application. No Station/native methods,
 * executable source or path-based file operations are accepted by this adapter. */
export const vectorCommandSchema = z.object({
  id: z.string().regex(/^[a-zA-Z][\w.-]{0,159}$/),
  params: z.record(z.string().max(120), z.json()).default({}),
}).strict().refine(value => JSON.stringify(value).length <= 32768, "Command exceeds 32 KiB");
export const vectorCommandInfoSchema = z.object({ id: z.string().max(160), label: z.string().max(500), params: z.string().max(12000), enabled: z.boolean(), allowed: z.boolean() }).strict();
export type VectorCommand = z.infer<typeof vectorCommandSchema>;
export type VectorCommandInfo = z.infer<typeof vectorCommandInfoSchema>;
export function allowedVectorCommand(id: string) {
  return /^(shape|object|select|layer|path|type|artboard|view)\./.test(id) || ["edit.undo", "edit.redo", "edit.selectAll", "edit.deselect"].includes(id);
}
export const VECTOR_EDITOR_ID = "station:vectorcraft";

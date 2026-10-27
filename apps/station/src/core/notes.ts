import { z } from "zod";
/** Notes are source values. Assets wrap them in identity/revision/permissions;
 * inline properties and widget defaults may carry the same portable value. */
export const NOTE_LIMIT = 262144;
export const safeNoteLink = (href: string) => /^(?:https?:\/\/|mailto:|#)/i.test(href) && !/[\u0000-\u001f\u007f]/.test(href);
const types = new Set(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "codeBlock", "table", "quote", "divider", "text", "link", "tableContent", "tableCell"]);
export const richNoteSchema = z.object({ version: z.literal(1), blocks: z.array(z.json()).max(4096) }).strict().superRefine((value, ctx) => {
  let count = 0;
  const visit = (node: unknown, depth: number): void => {
    if (++count > 30000 || depth > 40) throw new Error("Note structure exceeds limits");
    if (Array.isArray(node)) { for (const child of node) visit(child, depth + 1); }
    else if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      if (typeof record.type === "string" && !types.has(record.type)) throw new Error(`Unsupported note element: ${record.type}`);
      if (record.href !== undefined && (typeof record.href !== "string" || !safeNoteLink(record.href))) throw new Error("Use an HTTP, HTTPS, mail or fragment link");
      for (const child of Object.values(record)) visit(child, depth + 1);
    }
  };
  try { if (JSON.stringify(value).length > NOTE_LIMIT) throw new Error("Note exceeds 256 KiB"); visit(value.blocks, 0); }
  catch (error) { ctx.addIssue({ code: "custom", message: String(error) }); }
});
export function parseRichNote(source: string) {
  if (source.length > NOTE_LIMIT) throw new Error("Note exceeds 256 KiB");
  return richNoteSchema.parse(JSON.parse(source));
}
export const EMPTY_NOTE = JSON.stringify({ version: 1, blocks: [{ type: "paragraph", content: [] }] }, null, 2);
export const noteValueSchema = z.object({ format: z.enum(["markdown", "note"]), source: z.string().max(NOTE_LIMIT) }).strict().superRefine((value, ctx) => {
  if (value.format === "note") try { parseRichNote(value.source); } catch (error) { ctx.addIssue({ code: "custom", message: String(error) }); }
});
export type NoteValue = z.infer<typeof noteValueSchema>;
export function notePath(kind: "note" | "markdown") { return kind === "note" ? "note.json" : "note.md"; }

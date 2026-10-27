import { z } from "zod";
import { dataDocumentSchema, type DataDocument } from "./data-sources";

/** Authored capture rules are inert data beside data.json, never scripts or grants.
 * First enabled match wins against the original text. One capture writes one row;
 * rules cannot create assets, call services, recurse or process existing records.
 */
export const captureRuleSchema = z.object({
  id: z.string().min(1).max(120),
  enabled: z.boolean(),
  match: z.enum(["contains", "starts-with"]),
  text: z.string().trim().min(1).max(200),
  status: z.string().trim().min(1).max(120),
  stripPrefix: z.boolean().default(false),
}).strict();
export const captureRulesSchema = z.object({ version: z.literal(1), rules: z.array(captureRuleSchema).max(20) }).strict()
  .refine(value => new Set(value.rules.map(rule => rule.id)).size === value.rules.length, "Rule IDs must be unique");
export type CaptureRules = z.infer<typeof captureRulesSchema>;
export type CaptureRule = z.infer<typeof captureRuleSchema>;
export const EMPTY_CAPTURE_RULES: CaptureRules = { version: 1, rules: [] };

export function readCaptureRules(source?: string): CaptureRules {
  return source === undefined ? EMPTY_CAPTURE_RULES : captureRulesSchema.parse(JSON.parse(source));
}

/** Validate the destination before a draft can be cleared or any source committed. */
export function validateCaptureSource(document: DataDocument) {
  if (document.provider !== "local.table") throw new Error("Capture needs a writable local table.");
  for (const id of ["text", "created", "status"]) {
    const column = document.columns.find(column => column.id === id);
    if (!column || !["text", "select"].includes(column.type)) throw new Error("Inbox needs text, created and status columns.");
  }
  if (document.records.length >= 500) throw new Error("This inbox is full. Remove or archive records before capturing.");
}

export function previewCapture(text: string, configuration: CaptureRules) {
  const original = z.string().trim().min(1).max(8192).parse(text);
  const rule = captureRulesSchema.parse(configuration).rules.find(rule => rule.enabled && (
    rule.match === "starts-with" ? original.slice(0, rule.text.length).toLowerCase() === rule.text.toLowerCase() : original.toLowerCase().includes(rule.text.toLowerCase())
  ));
  const captured = rule?.stripPrefix && rule.match === "starts-with" ? original.slice(rule.text.length).trim() : original;
  if (!captured) throw new Error("The rule removes the entire capture. Add some text after the prefix.");
  return { text: captured, status: rule?.status ?? "Inbox", ruleId: rule?.id };
}

export function captureRecord(document: DataDocument, rules: CaptureRules, text: string, id: string, created: string) {
  validateCaptureSource(document);
  const result = previewCapture(text, rules);
  const statusColumn = document.columns.find(column => column.id === "status")!;
  if (statusColumn.type === "select" && statusColumn.options?.length && !statusColumn.options.includes(result.status)) throw new Error(`Add “${result.status}” to the inbox Status options before capturing.`);
  return dataDocumentSchema.parse({ ...document, records: [...document.records, { id, values: { text: result.text, created, status: result.status } }] });
}

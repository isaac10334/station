/** Portable operation and task contracts. No transport, UI, storage or authority lives here.
 * Schemas describe data; only a host-created invocation can authorize its effects.
 */
import { z } from "zod";
export { z };
export const identity = z.string().min(1).max(200);
export const surfaceSchema = z.enum(["main", "dashboard", "sidebar", "bottom", "toolbar"]);
export const targetSchema = z
  .object({
    surface: surfaceSchema,
    intent: z.enum(["append", "tab", "swap", "left", "right", "top", "bottom"]),
    nodeId: identity.optional(),
    ownerId: identity.optional(),
    index: z.number().int().nonnegative().optional(),
  })
  .strict();
export const versionSchema = z
  .object({ epoch: identity, revision: z.number().int().nonnegative() })
  .strict();
export type StateVersion = z.infer<typeof versionSchema>;
/** Exact virtual path, or a directory ending in '/'. No globs or host paths. */
export const fileAccessRuleSchema = z.string().min(1).max(240).refine(value => !value.startsWith("/") && !value.includes("\\") && !value.includes(":") && !value.includes("*") && value.replace(/\/$/, "").split("/").every(part => part !== "" && part !== "." && part !== ".."), "Use an exact virtual file or directory/ prefix");
/** A task's upper bound, never a permission request supplied in a command body.
 * `created` means identities created by this task, not an asset name prefix.
 */
export const taskScopeSchema = z
  .object({
    operations: z.array(identity).max(64),
    readableAssets: z.array(identity).max(200).default([]),
    editableAssets: z.array(identity).max(200).default([]),
    fileAccess: z.record(identity, z.object({ read: z.array(fileAccessRuleSchema).max(32), write: z.array(fileAccessRuleSchema).max(32) }).strict()).optional(),
    create: z.boolean().default(false),
    surfaces: z.array(surfaceSchema).default([]),
    capabilities: z.array(identity).max(32).default([]),
    componentImports: z.array(identity).max(32).default([]),
    cloudBuild: z.boolean().default(false),
  })
  .strict();
export type TaskScope = z.infer<typeof taskScopeSchema>;
export const requestSchema = z
  .object({
    method: identity,
    params: z.unknown().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    version: versionSchema.optional(),
    requestId: identity.optional(),
  })
  .strict();
export type CommandRequest = z.infer<typeof requestSchema>;
export const metadataPatchSchema = z
  .object({
    name: z.string().trim().min(1, "Title is required.").max(200).optional(),
    description: z.string().trim().max(4000).optional(),
  })
  .strict();
export const filesSchema = z.record(
  z.string().max(240),
  z.string().max(1024 * 1024),
);
export const assetSummarySchema = z
  .object({
    id: identity,
    name: z.string(),
    kind: z.enum([
      "component",
      "web-content",
      "theme",
      "package",
      "widget-definition",
      "desk-template",
      "svg", "decision", "data-source", "script", "custom", "markdown", "note",
    ]),
    revision: z.number(),
    description: z.string(),
  })
  .strict();
export const jsonSchema: z.ZodType<
  null | boolean | number | string | unknown[] | Record<string, unknown>
> = z.json();
export type OperationDescription = {
  method: string;
  version: string;
  description: string;
  effects: readonly string[];
  schema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  available: boolean;
};
export type ControlFailure = {
  code: string;
  message: string;
  details?: unknown;
};
/** Machine-readable failures stay independent of JSON-RPC and MCP error envelopes. */
export class ControlError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

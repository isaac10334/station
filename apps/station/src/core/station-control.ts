import { viewConfigurationSchema } from "./data-sources";
import { actionButtonSchema } from "./action-buttons";
import { noteValueSchema } from "./notes";
import { z } from "zod";
import { slotReferenceSchema } from "./slot-reference";

const finite = z.number().finite();
const surface = z.enum(["main", "dashboard", "sidebar", "bottom", "toolbar"]);
const target = z
  .object({
    surface,
    intent: z.enum(["append", "tab", "swap", "left", "right", "top", "bottom"]),
    nodeId: z.string().optional(),
    ownerId: z.string().optional(),
    index: z.number().int().nonnegative().optional(),
  })
  .strict();
const id = { panelId: z.string().min(1) };
/** Deliberately bounded initial catalog. Transport callers cannot smuggle service
 * approvals, package installs or unvalidated commands through an opaque JSON cast.
 */
export const controlledDockCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("configureNote"), panelId: z.string().min(1), value: noteValueSchema.optional(), sourceAssetId: z.string().min(1).max(200).nullable().optional() }).strict(),
  z.object({ type: z.literal("configureIde"), panelId: z.string().min(1), assetId: z.string().min(1).max(200).nullable() }).strict(),
  z.object({ type: z.literal("configureDataView"), panelId: z.string().min(1), config: viewConfigurationSchema }).strict(),
  z.object({ type: z.literal("configureActionButton"), panelId: z.string().min(1), config: actionButtonSchema }).strict(),
  z.object({ type: z.literal("configureListItem"), panelId: z.string().min(1), mode: z.enum(["inline", "tab"]) }).strict(),
  z.object({ type: z.literal("setWidgetTarget"), panelId: z.string().min(1), reference: slotReferenceSchema.nullable() }).strict(),
  z.object({ type: z.literal("resizeDashboard"), percent: finite.min(40).max(100) }).strict(),
  z
    .object({
      type: z.literal("createWidget"),
      widget: z.enum([
        "clock",
        "note",
        "weather",
        "stack",
        "snake",
        "capabilities",
        "docking-inspector",
        "ai-chat",
        "web-browser",
        "browser-tab",
        "widget-list", "data-view", "action-button", "program", "desk-settings", "ide",
      ]),
      id: z.string().optional(),
      defaults: z.object({ dataView: viewConfigurationSchema }).strict().optional(),
      target,
    })
    .strict(),
  z
    .object({
      type: z.literal("openAsset"),
      assetId: z.string(),
      target: target.optional(),
    })
    .strict(),
  z.object({ type: z.literal("activate"), ...id }).strict(),
  z.object({ type: z.literal("move"), ...id, target }).strict(),
  z
    .object({
      type: z.literal("float"),
      ...id,
      x: finite.optional(),
      y: finite.optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("dockFloat"), ...id, target: target.optional() })
    .strict(),
  z
    .object({
      type: z.literal("presentPanel"),
      ...id,
      mode: z.enum(["window", "peek"]),
      edge: z.enum(["top", "bottom", "left", "right"]).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("peekVisibility"), ...id, hidden: z.boolean() })
    .strict(),
  z
    .object({
      type: z.literal("resizeFloat"),
      ...id,
      width: finite,
      height: finite,
    })
    .strict(),
  z
    .object({ type: z.literal("moveFloat"), ...id, x: finite, y: finite })
    .strict(),
  z
    .object({ type: z.literal("visibility"), surface, hidden: z.boolean() })
    .strict(),
  z
    .object({
      type: z.literal("addSlot"),
      surface,
      ownerId: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("configurePanel"),
      ...id,
      displayName: z.string().max(120).optional(),
      hideDisplayName: z.boolean().optional(),
      chrome: z.enum(["default", "compact", "seamless"]).optional(),
      contentSizing: z.enum(["fill", "scroll", "clip"]).optional(),
    })
    .strict(),
  z.object({ type: z.literal("close"), ...id }).strict(),
  z
    .object({ type: z.literal("maximize"), panelId: z.string().nullable() })
    .strict(),
]);

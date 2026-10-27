import { z } from "zod";
/** A reviewed, data-only command vocabulary. Authored buttons never carry owner
 * dispatch, grants, callbacks, script strings or native endpoints. */
export const actionButtonSchema = z.object({ label: z.string().trim().max(80).default("Action"), tooltip: z.string().trim().max(240).optional(), icon: z.enum(["Plus", "Layers", "Search", "Eye", "PanelLeft", "Play", "Table", "Code"]).default("Plus"),
  /** Legacy input only. Dock migration consumes this once; rendering never uses it. */
  variant: z.enum(["default", "secondary", "outline", "ghost"]).default("outline"),
  fullWidth: z.boolean().default(false), confirmation: z.string().trim().max(300).optional(),
  assetId: z.string().min(1).max(200).optional(),
  inputJson: z.string().max(65536).default("{}").refine(value => { try { JSON.parse(value); return true; } catch { return false; } }, "Enter valid JSON"),
  pinned: z.boolean().optional(), action: z.enum(["panel.activate", "panel.toggle", "panel.focus", "widgets.add", "assets.open", "scripts.run"]).default("panel.activate"), targetId: z.string().min(1).max(200).optional(), iconAsset: z.object({ assetId: z.string().min(1), path: z.string().min(1) }).optional() }).strict();
export type ActionButtonConfiguration = z.infer<typeof actionButtonSchema>;

/** A hidden visual label never removes the control's accessible name. */
export function actionButtonName(config: ActionButtonConfiguration, instanceTitle?: string): string {
  return config.tooltip?.trim() || config.label || instanceTitle?.trim() || {
    "panel.activate": "Open target tab", "panel.toggle": "Toggle target widget",
    "panel.focus": "Focus target widget", "widgets.add": "Add a widget", "assets.open": "Open asset", "scripts.run": "Run script",
  }[config.action];
}

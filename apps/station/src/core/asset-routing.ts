import { scriptAssetLabel } from "./script-assets";
import { z } from "zod";
import type { Asset } from "./asset-state";
import type { Workspace } from "./workspace-state";
import { installedDefinitions } from "./contribution-catalog";

/** Inert, bounded routing policy. A decision chooses among candidates; it cannot
 * authorize capabilities, install code or override host compatibility constraints.
 */
export const editorPolicySchema = z.object({
  version: z.literal(1), purpose: z.literal("asset.editor"),
  rules: z.array(z.object({ kind: z.string().max(80).optional(), nameIncludes: z.string().max(120).optional(), editorId: z.string().max(240) }).strict()).max(64),
  fallback: z.string().max(240).default("station"),
}).strict();
export type EditorPolicy = z.infer<typeof editorPolicySchema>;
export const DEFAULT_EDITOR_POLICY: EditorPolicy = { version: 1, purpose: "asset.editor", rules: [], fallback: "station" };
/** Extension documents may narrow compatible editors without granting execution. */
export function compatibleEditors(workspace: Workspace, asset: Asset) {
  let selected: string[] = [];
  if (asset.kind === 'custom') {
    try {
      const value = JSON.parse(asset.files['extension.json'] ?? '{}').editors;
      if (Array.isArray(value) && value.every(id => typeof id === 'string')) selected = value;
    } catch { /* Recovery source remains available for malformed extension metadata. */ }
  }
  return installedDefinitions(workspace).filter(item => item.contribution.role === 'editor'
    && item.contribution.assetKinds.includes(asset.kind)
    && (!selected.length || selected.includes(item.id)));
}
export function editorChoices(workspace: Workspace, asset: Asset) {
  return [{ id: "station", title: asset.kind === "note" ? "Rich note editor" : asset.kind === "markdown" ? "Markdown editor" : asset.kind === "data-source" ? "Station data editor" : asset.kind === "script" ? `Station ${scriptAssetLabel(asset)}` : asset.kind === "svg" ? "Station SVG editor" : asset.kind === "decision" ? "Station decision editor" : "Station editor" },
    ...(asset.kind === "svg" ? [{ id: "station:vectorcraft", title: "VectorCraft" }] : []),
    ...compatibleEditors(workspace, asset).map(i => ({ id: i.id, title: i.contribution.title }))];
}
/** Precedence: explicit selection, asset policy, workspace policy, desk/workspace
 * defaults, Station editor. Missing/incompatible choices fail to a safe editor.
 * The trace is inert explanatory metadata, never executable policy or authority.
 */
export function resolveEditor(workspace: Workspace, asset: Asset, explicit?: string) {
  const choices = editorChoices(workspace, asset);
  const desk = workspace.desks.find(d => d.id === workspace.activeDeskId)!;
  const policyId = asset.editorPolicyId ?? workspace.editorPolicyId;
  let selected = explicit;
  let reason = explicit ? "Explicit selection" : "Station default";
  if (!selected && policyId) {
    const policy = workspace.assets.find(a => a.id === policyId && a.kind === "decision");
    try {
      const parsed = editorPolicySchema.parse(JSON.parse(policy?.files?.["decision.json"] ?? ""));
      const index = parsed.rules.findIndex(r => (!r.kind || r.kind === asset.kind) && (!r.nameIncludes || asset.name.toLowerCase().includes(r.nameIncludes.toLowerCase())));
      selected = index < 0 ? parsed.fallback : parsed.rules[index].editorId;
      reason = index < 0 ? "Policy fallback" : `Policy rule ${index + 1}`;
    } catch { reason = "Invalid or missing policy; using compatible defaults"; }
  }
  selected ??= desk.editorDefaults[asset.kind] ?? workspace.editorDefaults[asset.kind] ?? "station";
  const choice = choices.find(c => c.id === selected);
  return { editorId: choice?.id ?? "station", reason: choice ? reason : "Selected editor unavailable or incompatible", policyId: policyId ?? null, choices };
}

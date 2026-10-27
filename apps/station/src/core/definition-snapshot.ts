import { z } from "zod";
import { widgetDefaultsSchema, widgetRecipeSchema, type WidgetDefaults } from "./widget-definitions";

/** Immutable provenance. Instances retain source when a definition disappears.
 * This snapshot carries no installation, runtime state, grant or live handle. */
export const definitionSnapshotSchema = z.object({
  assetId: z.string().min(1).max(200), revision: z.number().int().nonnegative(),
  recipe: widgetRecipeSchema,
}).strict();
export type DefinitionSnapshot = z.infer<typeof definitionSnapshotSchema>;

/** Three-way leaf reconciliation. Instance overrides and deletions win; unchanged
 * defaults advance. Arrays are atomic because reordered indices lack identity. */
export function reconcileDefinitionDefaults(baseline: WidgetDefaults, current: WidgetDefaults, next: WidgetDefaults): WidgetDefaults {
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const merge = (old: unknown, live: unknown, incoming: unknown): unknown => {
    if (equal(old, live)) return incoming;
    if (object(old) && object(live) && object(incoming)) {
      const result: Record<string, unknown> = {};
      for (const key of new Set([...Object.keys(old), ...Object.keys(live), ...Object.keys(incoming)])) {
        const value = merge(old[key], live[key], incoming[key]);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    return live;
  };
  return widgetDefaultsSchema.parse(merge(baseline, current, next));
}

/** Authorable settings only, excluding placement, grants and active programs. */
export function instanceDefaults(panel: object, baseline?: WidgetDefaults): WidgetDefaults {
  const values = panel as Record<string, unknown>;
  const current = Object.fromEntries(Object.keys(widgetDefaultsSchema.shape).filter(key => values[key] !== undefined).map(key => [key, values[key]]));
  // Dock migration materializes these implicit values. They are not user
  // overrides when source omitted them, including after serialization/reload.
  const implicit: Record<string, unknown> = { hideDisplayName: false, flippable: false, chrome: "default", stackMode: "tabs", ...(values.widget === "web-browser" ? { childWidget: "browser-tab" } : {}) };
  if (baseline) for (const [key, value] of Object.entries(implicit)) if (!(key in baseline) && current[key] === value) delete current[key];
  return widgetDefaultsSchema.parse(current);
}

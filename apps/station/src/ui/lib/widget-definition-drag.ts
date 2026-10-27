import { WIDGET_IDS, type WidgetId } from "../../core/panel-layout";

/** Source-editor moves are local to one mounted editor. Catalog identities may
 * be copied between editors, but a path must never resolve against another tree.
 * This validates transient UI intent; the source owner still validates commits.
 */
export function parseWidgetDefinitionDrag(source: string, scope: string): {
  widget: WidgetId;
  path?: number[];
  definitionId?: string;
} {
  const data: unknown = JSON.parse(source);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid widget drag");
  const value = data as Record<string, unknown>;
  if (!WIDGET_IDS.includes(value.widget as WidgetId)) throw new Error("Invalid widget drag");
  if (value.definitionId !== undefined && (typeof value.definitionId !== "string" || !value.definitionId.length || value.definitionId.length > 200)) throw new Error("Invalid widget definition");
  if (value.path !== undefined) {
    if (!Array.isArray(value.path) || !value.path.length || value.path.length > 32 || value.path.length % 2 || !value.path.every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("Invalid widget path");
    if (value.scope !== scope) throw new Error("Move children within this editor. Copy a definition from the catalog to use it in another editor.");
  }
  return { widget: value.widget as WidgetId, path: value.path as number[] | undefined, definitionId: value.definitionId as string | undefined };
}

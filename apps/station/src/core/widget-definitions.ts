import { viewConfigurationSchema } from "./data-sources";
import { actionButtonSchema } from "./action-buttons";
import { z } from "zod";
import { authoredSurfaceSchema, BUILTIN_AUTHORED_SURFACES } from "./authored-surface";
import { PROGRAM_RECIPES } from "./program-recipes";
import { noteValueSchema } from "./notes";
import { draftSchema } from "./programs";
import { navigationDefinitionSchema } from './navigation-filter';

import { WIDGET_IDS, type WidgetId } from "./panel-layout";

import type { DataAsset } from "./asset-state";



/** Serializable configuration only. Recipes select an existing trusted renderer;

 * they never contain executable host code, grants, installations or live state. */

export const widgetDefaultsSchema = z.object({
  note: noteValueSchema.optional(),
  contentSizing: z.enum(["fill", "scroll", "clip"]).optional(),
  surface: authoredSurfaceSchema.optional(),
  sourceAssetId: z.string().min(1).max(200).optional(),
  navigation:navigationDefinitionSchema.optional(),
  programDraft: draftSchema.optional(),
  dataView: viewConfigurationSchema.optional(), actionButton: actionButtonSchema.optional(),

  listMode: z.enum(["inline", "tab"]).optional(),
  displayName: z.string().trim().max(120).optional(),

  hideDisplayName: z.boolean().optional(),

  flippable: z.boolean().optional(),

  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),

  chrome: z.enum(["default", "compact", "seamless"]).optional(),

  tone: z.enum(["slate", "blue", "violet", "coral", "mint"]).optional(),

  stackMode: z.enum(["tabs", "sidebar", "carousel"]).optional(),

  childWidget: z.enum(WIDGET_IDS).refine(widget => !["app-shell", "desktop-shell"].includes(widget), { message: "Shells are root widgets" }).optional(),

}).strict();

export type WidgetDefaults = z.infer<typeof widgetDefaultsSchema>;

/** Slot defaults are source, never live instances. Each instantiation allocates

 * fresh identities. Bounded depth/count checks run before touching the graph. */

export interface WidgetSeed { widget: WidgetId; key?: string; targetRef?: { key: string; slot?: number }; defaults?: WidgetDefaults; slots?: WidgetSeed[][] }
const localKey = z.string().regex(/^[\w-]{1,80}$/);
const localTarget = z.object({ key: localKey, slot: z.number().int().min(0).max(31).optional() }).strict();

const widgetSeedSchema: z.ZodType<WidgetSeed> = z.lazy(() => z.object({

  widget: z.enum(WIDGET_IDS), key: localKey.optional(), targetRef: localTarget.optional(), defaults: widgetDefaultsSchema.optional(),

  slots: z.array(z.array(widgetSeedSchema).max(32)).max(32).optional(),

}).strict());

export const widgetRecipeSchema = z.object({

  version: z.literal(1),
  origin: z.object({ assetId: z.string().min(1).max(200), revision: z.number().int().nonnegative() }).strict().optional(),
  forkDefaults: widgetDefaultsSchema.optional(),

  widget: z.enum(WIDGET_IDS),
  key: localKey.optional(), targetRef: localTarget.optional(),

  title: z.string().trim().min(1).max(120),

  description: z.string().max(2000).default(""),

  defaults: widgetDefaultsSchema.default({}),

  slots: z.array(z.array(widgetSeedSchema).max(32)).max(32).optional(),

}).strict().refine(recipe => (!recipe.defaults.childWidget && !recipe.defaults.stackMode) || ["stack", "web-browser", "main-surface"].includes(recipe.widget), { message: "Child configuration requires a Layout renderer" });

export type WidgetRecipe = z.infer<typeof widgetRecipeSchema>;
/** Local keys are resolved after every child has its fresh live identity. */
export const APP_SHELL_SEEDS: WidgetSeed[][] = [[{ widget: "navigation", key: "navigation", targetRef: { key: "main" }, defaults: { chrome: "seamless" } }], [{ widget: "main-surface", key: "main", defaults: { chrome: "seamless" }, slots: [[]] }]];
/** Embed a definition as source defaults, rebasing its local reference namespace.
 * Asset identity stays in the catalog; live instance identity is allocated later. */
export function embedWidgetRecipe(recipe: WidgetRecipe): WidgetSeed {
  const prefix = `w${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}_`;
  const keys = new Map<string, string>();
  const key = (old: string) => { if (!keys.has(old)) keys.set(old, `${prefix}${keys.size}_${old.slice(0, 50)}`); return keys.get(old)!; };
  const copy = (node: WidgetSeed): WidgetSeed => ({ widget: node.widget, defaults: node.defaults ? structuredClone(node.defaults) : undefined, key: node.key ? key(node.key) : undefined, targetRef: node.targetRef ? { ...node.targetRef, key: key(node.targetRef.key) } : undefined, slots: node.slots?.map(slot => slot.map(copy)) });
  return copy(recipe);
}

export function parseWidgetRecipe(source: string): WidgetRecipe {

  // Reject pathological nesting before recursive schema traversal.

  let depth = 0, quoted = false, escaped = false;

  for (const char of source) {

    if (escaped) { escaped = false; continue; }

    if (quoted && char === "\\") { escaped = true; continue; }

    if (char === '"') quoted = !quoted;

    if (!quoted && (char === "[" || char === "{")) { if (++depth > 32) throw new Error("Widget definition nesting exceeds 32 levels"); }

    if (!quoted && (char === "]" || char === "}")) depth--;

  }

  if (source.length > 262144) throw new Error("Widget definition exceeds 256 KiB");

  const recipe = widgetRecipeSchema.parse(JSON.parse(source));
  const inspect = (node: WidgetSeed) => {
    if (node.defaults?.surface && node.defaults.surface.controller !== node.widget) throw new Error("Surface controller must match its widget contract");
    node.slots?.flat().forEach(inspect);
  };
  inspect(recipe);

  if (["app-shell", "desktop-shell"].includes(recipe.widget) && (recipe.slots?.length ?? 0) > 4) throw new Error("Shells have four named slots");

  return recipe;

}



/** Code-registered built-ins are projected as read-only source assets. This is the

 * single metadata registry; React adds icons/renderers without owning definitions.

 * The stable builtin IDs are compatibility references, never workspace copies. */

export const BUILTIN_WIDGET_DEFINITIONS: Record<WidgetId, { title: string; description: string; preview: string; renderer: "react" | "layout" }> = {
  "desk-controls": { title: "Desk controls", description: "Movable desk switching and configuration overlay.", preview: "Switch desk · configure · search", renderer: "react" },
  "quick-capture": { title: "Quick capture", description: "Capture text into your configurable inbox data source.", preview: "Write · save to inbox", renderer: "react" },
  note: { title: "Notes", description: "Rich note or Markdown editing, inline or linked to a shared asset.", preview: "Write · format · reuse a note asset", renderer: "react" },
  ide: { title: "IDE", description: "Retargetable source workspace with movable Files, Code and Problems widgets.", preview: "Target asset · files · code · problems", renderer: "react" },
  "desk-settings": { title: "Desk settings", description: "Dockable settings for the current desk, appearance, packages and services.", preview: "Desk · appearance · packages · services", renderer: "react" },
  program:{title:"Programmable widget",description:"Inline TypeScript and portable JSX with explicitly wired services.",preview:"Source · bindings · Apply · live surface",renderer:"react"},

  "data-view": { title: "Data view", description: "Independent table, board or graph over a shared data-source asset.", renderer: "react", preview: "One source · multiple views · formulas" },
  "action-button": { title: "Action button", description: "Configurable command, optional label and tooltip. Drag into the toolbar to place it there.", renderer: "react", preview: "Icon · label · command · target" },
  "widget-list": { title: "Widget list", description: "Reusable widget entries, embedded inline or opened as tabs in a selected target.", renderer: "layout", preview: "Inline widgets · tab launchers · target slot" },
  "widget-editor": { title: "Widget editor", description: "Visually select and configure instances; open or fork their definitions.", renderer: "react", preview: "Preview � hierarchy � instance settings � definitions" },

  "app-shell": { title: "App shell", description: "Root layout with sidebar, main surface, dock and overlays.", renderer: "layout", preview: "Sidebar · main surface · drawers · dialogs" },

  "desktop-shell": { title: "Desktop shell", description: "Spacious desktop with movable windows and a bottom task dock.", renderer: "layout", preview: "Background · movable windows · task dock" },

  navigation: { title: "Navigation", description: "Workspace navigation and search.", renderer: "react", preview: "Workspace · pinned assets · search" },

  "asset-browser": { title: "Asset browser", description: "Browse and organize shared workspace assets.", renderer: "react", preview: "Groups · assets · source" },

  "main-surface": { title: "Workspace grid", description: "A fresh page with a resizable grid of widgets. Add, arrange and nest your own workspace.", renderer: "layout", preview: "Fresh slate · widget grid · resizable rows" },

  "browser-tab": { title: "Browser tab", description: "A movable browser page with its own session grant.", renderer: "react", preview: "Address · browsing session" },

  "web-browser": { title: "Web browser", description: "A browser composition with movable child pages.", renderer: "layout", preview: "Horizontal or vertical tabs · owned browsing sessions" },

  "ai-chat": { title: "Station agent", description: "Work with notes, files and selected assets. Review drafts and authorize workspace tools.", renderer: "react", preview: "Your key · streaming chat · granted tools" },

  weather: { title: "Weather", description: "A six-hour forecast; location is requested when you choose.", renderer: "react", preview: "Forecast · temperature · next six hours" },

  clock: { title: "Local time", description: "Your time, date and time zone, always in sync.", renderer: "react", preview: "Time · date · local time zone" },

  capabilities: { title: "Capability inspector", description: "Inspect capabilities, providers, scopes and grants.", renderer: "react", preview: "Capabilities · scopes · grants" },

  stack: { title: "Layout", description: "Arrange real child widgets in resizable slots and tabs.", renderer: "layout", preview: "Resizable slots · horizontal or vertical tabs · carousel" },

  "docking-inspector": { title: "Widget inspector", description: "Select widgets, edit their settings and apply bulk actions.", renderer: "react", preview: "Widget tree · selection · placement · diagnostics" },

  snake: { title: "Snake", description: "A keyboard game. Focus the game to play.", renderer: "react", preview: "Arrow keys · score · restart" },

};

export function builtinWidgetAssets(): DataAsset[] {

  return [...WIDGET_IDS.map(widget => {

    const item = BUILTIN_WIDGET_DEFINITIONS[widget];

    return { id: `builtin:${widget}`, instanceId: `builtin:${widget}:v1`, kind: "widget-definition" as const, name: item.title, description: item.description, revision: 0,

      files: { "widget.json": JSON.stringify({ version: 1, widget, title: item.title, description: item.description, defaults: widget in BUILTIN_AUTHORED_SURFACES ? { surface: BUILTIN_AUTHORED_SURFACES[widget as keyof typeof BUILTIN_AUTHORED_SURFACES] } : widget === "web-browser" ? { childWidget: "browser-tab" } : {}, ...(widget === "app-shell" ? { slots: APP_SHELL_SEEDS } : {}) } satisfies WidgetRecipe, null, 2) } };

  }), ...PROGRAM_RECIPES.map(recipe => ({
    id: `builtin:program-${recipe.id}`, instanceId: `builtin:program-${recipe.id}:v1`, kind: "widget-definition" as const,
    name: recipe.title, description: recipe.description, revision: 0,
    files: { "widget.json": JSON.stringify({ version:1, widget:"program", title:recipe.title, description:recipe.description, defaults:{programDraft:recipe.draft} },null,2) },
  }))];

}

export const isBuiltinWidgetAsset = (id: string) => id.startsWith("builtin:") && (WIDGET_IDS.includes(id.slice(8) as WidgetId) || PROGRAM_RECIPES.some(recipe => id === `builtin:program-${recipe.id}`));

/** Retired examples remain readable for saved desks and source references, but
 * are no longer offered as host widgets. Authored definitions remain available. */
export const RETIRED_WIDGETS: readonly WidgetId[] = ["snake", "weather", "clock"];

export function widgetDefinitionAsset(assets: readonly import("./asset-state").Asset[], id: string) {

  return [...builtinWidgetAssets(), ...assets].find((asset): asset is DataAsset => asset.id === id && asset.kind === "widget-definition");

}

/** A source-only fork reuses the renderer's state contract. Editing a recipe

 * affects future instances; existing instances retain their saved configuration. */

export function forkWidgetRecipe(asset: DataAsset): DataAsset {

  if (asset.kind !== "widget-definition") throw new Error("Choose a widget definition");

  const recipe = parseWidgetRecipe(asset.files["widget.json"] ?? "");

  const title = `${recipe.title.slice(0, 110)} copy`;

  return { ...asset, id: `widget-definition-${crypto.randomUUID()}`, instanceId: crypto.randomUUID(), name: title, revision: 0, files: { "widget.json": JSON.stringify({ ...recipe, title, origin: { assetId: asset.id, revision: asset.revision }, forkDefaults: recipe.defaults }, null, 2) } };

}

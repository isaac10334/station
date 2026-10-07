/**
 * Pure, versioned workspace layout. A panel ID identifies one placed instance;
 * widget type is metadata and may occur any number of times.
 *
 * @example
 * const initial = createDockLayout();
 * const result = reduceDock(initial, { type: "createWidget", widget: "stack", target: { surface: "dashboard", intent: "append" } });
 * if (result.ok) save(result.layout);
 */
import { WIDGET_IDS, type BrowserView, type WidgetId, type WidgetSize, type WidgetTone, type StackMode } from "../panel-layout";

export type Surface = "main" | "dashboard" | "sidebar" | "bottom";
export type Intent = "append" | "tab" | "left" | "right" | "top" | "bottom";
export type Target = { surface: Surface; intent: Intent; nodeId?: string; index?: number; allowedTags?: string[] };
/** A host's allowed placements for one surface. `maxLeafStacks` counts stacks after a command commits. */
export type SurfacePolicy = { acceptedTags: readonly string[]; intents: readonly Intent[]; split: boolean; relocateStack: boolean; maxLeafStacks: number };
/** Supply the same policy to the store and `DockHost` so previews match commits. */
export type DockPolicy = Record<Surface, SurfacePolicy>;
/** Host configuration is executable policy, never part of the saved layout. */
export const DEFAULT_DOCK_POLICY: DockPolicy = {
  main: { acceptedTags: ["view"], intents: ["append", "tab", "left", "right", "top", "bottom"], split: true, relocateStack: false, maxLeafStacks: 4 },
  dashboard: { acceptedTags: ["widget"], intents: ["append", "tab"], split: false, relocateStack: false, maxLeafStacks: 100 },
  sidebar: { acceptedTags: ["navigation", "browser", "view", "widget"], intents: ["append", "tab"], split: false, relocateStack: false, maxLeafStacks: 1 },
  bottom: { acceptedTags: ["browser", "view", "widget"], intents: ["append", "tab"], split: false, relocateStack: false, maxLeafStacks: 1 },
};
/** Built-in widget eligibility; double-click does nothing unless a type explicitly opts in. */
export type WidgetPlacement = { docks: readonly Surface[]; floating: boolean; doubleClick?: "float" | "none" };
const ordinaryWidget: WidgetPlacement = { docks: ["dashboard", "sidebar", "bottom"], floating: true, doubleClick: "none" };
export const WIDGET_PLACEMENT = {
  weather: ordinaryWidget, clock: ordinaryWidget, capabilities: ordinaryWidget, stack: ordinaryWidget, snake: ordinaryWidget,
} satisfies Record<WidgetId, WidgetPlacement>;
export type Panel =
  | { id: string; kind: "home" | "browser" | "navigation"; tags: string[] }
  | { id: string; kind: "unit"; unitId: string; tags: string[] }
  | { id: string; kind: "web-widget"; unitId: string; tags: string[] }
  | { id: string; kind: "widget"; widget: WidgetId; size: WidgetSize; tone?: WidgetTone; stackMode?: StackMode; tags: string[] };
export type Stack = { kind: "stack"; id: string; tabs: string[]; active: string };
export type Split = { kind: "split"; id: string; axis: "horizontal" | "vertical"; ratio: number; first: Node; second: Node };
export type Grid = { kind: "grid"; id: string; cells: { id: string; node: Node }[] };
export type Node = Stack | Split | Grid;
export type DockLayout = {
  version: 3;
  panels: Record<string, Panel>;
  surfaces: Record<Surface, Node | null>;
  bottomSize: number;
  browserView: BrowserView;
  maximized: string | null;
  hidden: Partial<Record<Surface, boolean>>;
  sidebarSide: "left" | "right";
  floating: Record<string, { x: number; y: number; width: number; height: number; returnTo: Surface }>;
};
/** Commands are the sole structural mutation boundary; rejected commands leave the input intact. */
export type Command =
  | { type: "createWidget"; widget: WidgetId; target: Target; id?: string }
  | { type: "openUnit"; unitId: string; target?: Target }
  | { type: "createWebWidget"; unitId: string; id?: string }
  | { type: "move"; panelId: string; target: Target }
  | { type: "activate"; panelId: string }
  | { type: "close"; panelId: string }
  | { type: "resizeSplit"; nodeId: string; ratio: number }
  | { type: "resizeBottom"; size: number }
  | { type: "resizeWidget"; panelId: string; size: WidgetSize }
  | { type: "configureWidget"; panelId: string; tone?: WidgetTone; stackMode?: StackMode }
  | { type: "browserView"; view: BrowserView }
  | { type: "maximize"; panelId: string | null }
  | { type: "visibility"; surface: Surface; hidden: boolean }
  | { type: "sidebarSide"; side: "left" | "right" }
  | { type: "float"; panelId: string; x?: number; y?: number }
  | { type: "dockFloat"; panelId: string; target?: Target }
  | { type: "moveFloat"; panelId: string; x: number; y: number };
export type Result = { ok: true; layout: DockLayout; panelId?: string } | { ok: false; layout: DockLayout; reason: string };

const isWidget = (id: unknown): id is WidgetId => typeof id === "string" && WIDGET_IDS.includes(id as WidgetId);
const uid = (prefix: string) => `${prefix}:${crypto.randomUUID()}`;
const stack = (panelId: string, id = uid("stack")): Stack => ({ kind: "stack", id, tabs: [panelId], active: panelId });
export const HOME_ID = "workspace-home";
export const BROWSER_ID = "unit-browser";
export const NAVIGATION_ID = "workspace-navigation";

export function createDockLayout(widgets: WidgetId[] = ["weather", "clock", "stack", "capabilities"]): DockLayout {
  const panels: Record<string, Panel> = {
    [HOME_ID]: { id: HOME_ID, kind: "home", tags: ["view"] },
    [BROWSER_ID]: { id: BROWSER_ID, kind: "browser", tags: ["browser"] },
    [NAVIGATION_ID]: { id: NAVIGATION_ID, kind: "navigation", tags: ["navigation"] },
  };
  const cells = widgets.filter(isWidget).map((widget, index) => {
    const id = `widget:${widget}:legacy-${index}`;
    panels[id] = { id, kind: "widget", widget, size: "standard", tags: ["widget"] };
    return { id: `cell:${id}`, node: stack(id, `stack:${id}`) };
  });
  return { version: 3, panels, surfaces: {
    main: stack(HOME_ID, "stack:main"), dashboard: { kind: "grid", id: "grid:dashboard", cells },
    sidebar: stack(NAVIGATION_ID, "stack:sidebar"), bottom: stack(BROWSER_ID, "stack:bottom"),
  }, bottomSize: 36, browserView: "grid", maximized: null, hidden: {}, sidebarSide: "left", floating: {} };
}

export function visitNode(node: Node | null, visit: (node: Node) => void): void {
  if (!node) return;
  visit(node);
  if (node.kind === "split") { visitNode(node.first, visit); visitNode(node.second, visit); }
  if (node.kind === "grid") node.cells.forEach((cell) => visitNode(cell.node, visit));
}
export function findNode(layout: DockLayout, id: string): Node | null {
  let found: Node | null = null;
  Object.values(layout.surfaces).forEach((root) => visitNode(root, (node) => { if (node.id === id) found = node; }));
  return found;
}
export function surfacePanels(layout: DockLayout, surface: Surface): string[] {
  const result: string[] = [];
  visitNode(layout.surfaces[surface], (node) => { if (node.kind === "stack") result.push(...node.tabs); });
  return result;
}
export function panelSurface(layout: DockLayout, panelId: string): Surface | null {
  for (const surface of ["main", "dashboard", "sidebar", "bottom"] as const)
    if (surfacePanels(layout, surface).includes(panelId)) return surface;
  return null;
}
export function leafStacks(node: Node | null): number {
  let count = 0;
  visitNode(node, (candidate) => { if (candidate.kind === "stack") count++; });
  return count;
}

/** Host-owned placement policy. A rejected target provides a readable reason for UI/debugging. */
export function placementReason(panel: Panel, target: Target, policy: DockPolicy = DEFAULT_DOCK_POLICY): string | null {
  const surface = policy[target.surface];
  if (!surface) return "Unknown surface";
  if (panel.kind === "browser" && !["sidebar", "bottom"].includes(target.surface)) return "Unit browser belongs in a dock";
  if (!surface.intents.includes(target.intent)) return `${target.surface} does not allow ${target.intent} placement`;
  if (!surface.acceptedTags.some((tag) => panel.tags.includes(tag))) return `${target.surface} does not accept this panel type`;
  if (target.allowedTags?.length && !target.allowedTags.some((tag) => panel.tags.includes(tag))) return "This slot does not accept this panel type";
  if (panel.kind === "home" && target.surface !== "main") return "Overview belongs in the main surface";
  if (panel.kind === "navigation" && target.surface !== "sidebar") return "Navigation belongs in the sidebar";
  if (panel.kind === "unit" && !["main", "sidebar", "bottom"].includes(target.surface)) return "Component views cannot occupy widget slots";
  if (panel.kind === "web-widget" && target.surface !== "dashboard") return "Web widgets belong on the dashboard";
  if (panel.kind === "widget" && !WIDGET_PLACEMENT[panel.widget].docks.includes(target.surface)) return "Widget cannot dock in this surface";
  if (target.surface === "dashboard" && !["append", "tab"].includes(target.intent)) return "Widget slots do not split";
  return null;
}
function rewrite(node: Node | null, fn: (node: Node) => Node): Node | null {
  if (!node) return null;
  const nested: Node = node.kind === "split" ? { ...node, first: rewrite(node.first, fn)!, second: rewrite(node.second, fn)! }
    : node.kind === "grid" ? { ...node, cells: node.cells.map((cell) => ({ ...cell, node: rewrite(cell.node, fn)! })) } : node;
  return fn(nested);
}
function without(node: Node | null, panelId: string): Node | null {
  if (!node) return null;
  if (node.kind === "stack") {
    const tabs = node.tabs.filter((id) => id !== panelId);
    return tabs.length ? { ...node, tabs, active: tabs.includes(node.active) ? node.active : tabs[0] } : null;
  }
  if (node.kind === "grid") return { ...node, cells: node.cells.map((cell) => ({ ...cell, node: without(cell.node, panelId) })).filter((cell): cell is { id: string; node: Node } => Boolean(cell.node)) };
  const first = without(node.first, panelId), second = without(node.second, panelId);
  return first && second ? { ...node, first, second } : first ?? second;
}
function insert(root: Node | null, panelId: string, target: Target): Node | null {
  if (target.surface === "dashboard") {
    const grid: Grid = root?.kind === "grid" ? root : { kind: "grid", id: "grid:dashboard", cells: [] };
    if (target.intent === "tab" && target.nodeId) return rewrite(grid, (node) => node.kind === "stack" && node.id === target.nodeId
      ? { ...node, tabs: [...node.tabs, panelId], active: panelId } : node);
    const cells = [...grid.cells];
    cells.splice(Math.max(0, Math.min(cells.length, target.index ?? cells.length)), 0, { id: uid("cell"), node: stack(panelId) });
    return { ...grid, cells };
  }
  if (!root) return stack(panelId);
  if (target.intent === "append" || target.intent === "tab") {
    const nodeId = target.nodeId ?? (root.kind === "stack" ? root.id : null);
    if (!nodeId) return { kind: "split", id: uid("split"), axis: "horizontal", ratio: .5, first: root, second: stack(panelId) };
    return rewrite(root, (node) => node.kind === "stack" && node.id === nodeId
      ? { ...node, tabs: [...node.tabs.slice(0, target.index ?? node.tabs.length), panelId, ...node.tabs.slice(target.index ?? node.tabs.length)], active: panelId } : node);
  }
  const axis = target.intent === "left" || target.intent === "right" ? "horizontal" : "vertical";
  const before = target.intent === "left" || target.intent === "top";
  const nodeId = target.nodeId ?? root.id;
  return rewrite(root, (node) => node.id === nodeId ? { kind: "split", id: uid("split"), axis, ratio: .5,
    first: before ? stack(panelId) : node, second: before ? node : stack(panelId) } : node);
}
function targetReason(layout: DockLayout, target: Target): string | null {
  if (!target.nodeId) return null;
  let inSurface = false;
  visitNode(layout.surfaces[target.surface], (node) => { if (node.id === target.nodeId) inSurface = true; });
  if (!inSurface) return "Target does not exist in this surface";
  if (target.intent === "tab" && findNode(layout, target.nodeId)?.kind !== "stack") return "Tab insertion requires a stack";
  return null;
}

/** Check a candidate against policy and the current tree before painting a drop zone. */
export function dropReason(layout: DockLayout, panel: Panel, target: Target, policy: DockPolicy = DEFAULT_DOCK_POLICY): string | null {
  const reason = placementReason(panel, target, policy) ?? targetReason(layout, target);
  if (reason) return reason;
  const current = panelSurface(layout, panel.id);
  const leaves = leafStacks(layout.surfaces[target.surface]);
  if (target.surface === "dashboard" && target.intent === "append" && leaves >= policy.dashboard.maxLeafStacks) {
    let freesLeaf = false;
    visitNode(layout.surfaces.dashboard, (node) => { if (node.kind === "stack" && node.tabs.length === 1 && node.tabs[0] === panel.id) freesLeaf = true; });
    if (!freesLeaf) return `dashboard allows at most ${policy.dashboard.maxLeafStacks} widget slots`;
  }
  const splits = target.surface !== "dashboard" && (!["append", "tab"].includes(target.intent) || target.intent === "append" && leaves > 0 && layout.surfaces[target.surface]?.kind !== "stack" && !target.nodeId);
  if (splits && !policy[target.surface].split) return `${target.surface} cannot split`;
  if (splits && leaves >= policy[target.surface].maxLeafStacks && current !== target.surface) return `${target.surface} allows at most ${policy[target.surface].maxLeafStacks} stacks`;
  if (splits && leaves >= policy[target.surface].maxLeafStacks && current === target.surface) {
    const source = Object.values(layout.surfaces).some((root) => { let single = false; visitNode(root, (node) => { if (node.kind === "stack" && node.tabs.length === 1 && node.tabs[0] === panel.id) single = true; }); return single; });
    if (!source) return `${target.surface} allows at most ${policy[target.surface].maxLeafStacks} stacks`;
  }
  if (target.nodeId && panelSurface(layout, panel.id)) {
    let remains = false;
    visitNode(without(layout.surfaces[target.surface], panel.id), (node) => { if (node.id === target.nodeId) remains = true; });
    if (!remains) return "Cannot drop onto the panel being moved";
  }
  return null;
}

/** Atomic validated command; rejection returns the original layout reference. */
export function reduceDock(layout: DockLayout, command: Command, policy: DockPolicy = DEFAULT_DOCK_POLICY): Result {
  const reject = (reason: string): Result => ({ ok: false, layout, reason });
  if (command.type === "visibility") return command.surface === "dashboard" ? reject("Dashboard is part of Overview")
    : { ok: true, layout: { ...layout, hidden: { ...layout.hidden, [command.surface]: command.hidden } } };
  if (command.type === "sidebarSide") return { ok: true, layout: { ...layout, sidebarSide: command.side } };
  if (command.type === "moveFloat") {
    const item = layout.floating[command.panelId];
    if (!item || !Number.isFinite(command.x) || !Number.isFinite(command.y)) return reject("Floating panel does not exist");
    return { ok: true, layout: { ...layout, floating: { ...layout.floating, [command.panelId]: { ...item, x: Math.max(0, command.x), y: Math.max(0, command.y) } } } };
  }
  if (command.type === "float") {
    const panel = layout.panels[command.panelId];
    const from = panelSurface(layout, command.panelId);
    if (!panel || !from || panel.kind !== "widget" || !WIDGET_PLACEMENT[panel.widget].floating) return reject("This panel cannot float");
    const surfaces = Object.fromEntries(Object.entries(layout.surfaces).map(([key, root]) => [key, without(root, panel.id)])) as DockLayout["surfaces"];
    return { ok: true, layout: { ...layout, surfaces, floating: { ...layout.floating, [panel.id]: { x: Math.max(0, command.x ?? 80), y: Math.max(0, command.y ?? 80), width: 360, height: 320, returnTo: from } } }, panelId: panel.id };
  }
  if (command.type === "dockFloat") {
    const floated = layout.floating[command.panelId];
    const panel = layout.panels[command.panelId];
    if (!floated || !panel) return reject("Floating panel does not exist");
    const target = command.target ?? { surface: floated.returnTo, intent: "append" };
    const reason = dropReason(layout, panel, target, policy);
    if (reason) return reject(reason);
    const surfaces = { ...layout.surfaces, [target.surface]: insert(layout.surfaces[target.surface], panel.id, target) };
    const floating = { ...layout.floating }; delete floating[panel.id];
    return { ok: true, layout: { ...layout, surfaces, floating }, panelId: panel.id };
  }
  if (command.type === "browserView") return { ok: true, layout: { ...layout, browserView: command.view === "list" ? "list" : "grid" } };
  if (command.type === "resizeBottom") return Number.isFinite(command.size)
    ? { ok: true, layout: { ...layout, bottomSize: Math.max(24, Math.min(60, command.size)) } } : reject("Invalid bottom size");
  if (command.type === "resizeWidget") {
    const panel = layout.panels[command.panelId];
    if (panel?.kind !== "widget" || !["compact", "standard", "wide"].includes(command.size)) return reject("Invalid widget size");
    return { ok: true, layout: { ...layout, panels: { ...layout.panels, [panel.id]: { ...panel, size: command.size } } } };
  }
  if (command.type === "configureWidget") {
    const panel = layout.panels[command.panelId];
    if (panel?.kind !== "widget") return reject("Unknown widget instance");
    if (command.tone && !["blue", "violet", "coral", "mint", "slate"].includes(command.tone)) return reject("Invalid widget color");
    if (command.stackMode && (!["carousel", "tabs"].includes(command.stackMode) || panel.widget !== "stack")) return reject("Invalid stack mode");
    return { ok: true, layout: { ...layout, panels: { ...layout.panels, [panel.id]: { ...panel, tone: command.tone ?? panel.tone, stackMode: command.stackMode ?? panel.stackMode } } } };
  }
  if (command.type === "maximize") return command.panelId === null || panelSurface(layout, command.panelId)
    ? { ok: true, layout: { ...layout, maximized: command.panelId } } : reject("Panel is not placed");
  if (command.type === "resizeSplit") {
    if (!Number.isFinite(command.ratio) || findNode(layout, command.nodeId)?.kind !== "split") return reject("Split does not exist");
    const surfaces = Object.fromEntries(Object.entries(layout.surfaces).map(([key, root]) => [key, rewrite(root, (node) => node.kind === "split" && node.id === command.nodeId
      ? { ...node, ratio: Math.max(.2, Math.min(.8, command.ratio)) } : node)])) as DockLayout["surfaces"];
    return { ok: true, layout: { ...layout, surfaces } };
  }
  if (command.type === "activate") {
    if (!panelSurface(layout, command.panelId)) return reject("Panel is not placed");
    const surfaces = Object.fromEntries(Object.entries(layout.surfaces).map(([key, root]) => [key, rewrite(root, (node) => node.kind === "stack" && node.tabs.includes(command.panelId)
      ? { ...node, active: command.panelId } : node)])) as DockLayout["surfaces"];
    return { ok: true, layout: { ...layout, surfaces } };
  }
  if (command.type === "close") {
    const panel = layout.panels[command.panelId];
    if (!panel || panel.kind === "home" || panel.kind === "browser" || panel.kind === "navigation") return reject("This panel cannot be closed");
    const panels = { ...layout.panels }; delete panels[command.panelId];
    const surfaces = Object.fromEntries(Object.entries(layout.surfaces).map(([key, root]) => [key, without(root, command.panelId)])) as DockLayout["surfaces"];
    const floating = { ...layout.floating }; delete floating[command.panelId];
    return { ok: true, layout: { ...layout, panels, surfaces, floating, maximized: layout.maximized === command.panelId ? null : layout.maximized } };
  }
  let panel: Panel, target: Target;
  if (command.type === "createWebWidget") {
    if (!command.unitId) return reject("Web unit ID is required");
    const id = command.id ?? uid("web-widget");
    if (layout.panels[id]) return reject("Panel ID already exists");
    panel = { id, kind: "web-widget", unitId: command.unitId, tags: ["widget"] };
    target = { surface: "dashboard", intent: "append" };
  } else if (command.type === "createWidget") {
    if (!isWidget(command.widget)) return reject("Unknown widget");
    const id = command.id ?? uid("widget");
    if (layout.panels[id]) return reject("Panel ID already exists");
    panel = { id, kind: "widget", widget: command.widget, size: "standard", tags: ["widget"] };
    target = command.target;
  } else if (command.type === "openUnit") {
    if (!command.unitId) return reject("Unit ID is required");
    const id = `unit-view:${command.unitId}`;
    panel = layout.panels[id] ?? { id, kind: "unit", unitId: command.unitId, tags: ["view"] };
    if (!command.target && panelSurface(layout, id)) return reduceDock(layout, { type: "activate", panelId: id });
    let firstMainStack: Stack | null = null;
    visitNode(layout.surfaces.main, (node) => { if (!firstMainStack && node.kind === "stack") firstMainStack = node; });
    target = command.target ?? { surface: "main", intent: "tab", nodeId: (firstMainStack as Stack | null)?.id };
  } else {
    panel = layout.panels[command.panelId];
    if (!panel || !panelSurface(layout, panel.id)) return reject("Panel is not placed");
    target = command.target;
  }
  const reason = dropReason(layout, panel, target, policy);
  if (reason) return reject(reason);
  // Tab indices describe the visible stack before removal. Moving right within
  // that stack shifts the insertion boundary left once the source is removed.
  if (command.type === "move" && target.intent === "tab" && target.nodeId && target.index !== undefined) {
    const destination = findNode(layout, target.nodeId);
    if (destination?.kind === "stack") {
      const sourceIndex = destination.tabs.indexOf(panel.id);
      if (sourceIndex >= 0) {
        const boundary = Math.max(0, Math.min(destination.tabs.length, target.index));
        const index = boundary - (sourceIndex < boundary ? 1 : 0);
        if (index === sourceIndex) return { ok: true, layout, panelId: panel.id };
        target = { ...target, index };
      }
    }
  }
  const surfaces = Object.fromEntries(Object.entries(layout.surfaces).map(([key, root]) => [key, without(root, panel.id)])) as DockLayout["surfaces"];
  if (target.nodeId) {
    let exists = false;
    visitNode(surfaces[target.surface], (node) => { if (node.id === target.nodeId) exists = true; });
    if (!exists) return reject("Cannot drop onto the panel being moved");
  }
  surfaces[target.surface] = insert(surfaces[target.surface], panel.id, target);
  const next = { ...layout, panels: { ...layout.panels, [panel.id]: panel }, surfaces };
  return panelSurface(next, panel.id) ? { ok: true, layout: next, panelId: panel.id } : reject("Insertion failed");
}

/** Convert saved v1/v2 docks and sanitize v3 trees without touching unit data. */
export function migrateDock(raw: unknown, widgets: WidgetId[] = ["weather", "clock", "stack", "capabilities"], policy: DockPolicy = DEFAULT_DOCK_POLICY): DockLayout {
  if (!raw || typeof raw !== "object") return createDockLayout(widgets);
  const value = raw as Record<string, any>;
  const dockedWidgets: WidgetId[] = value.version === 2 || value.version === 3 ? [] : ["sidebar", "bottom"].flatMap((zone) => Array.isArray(value[zone]) ? value[zone] : [])
    .map((id: unknown) => typeof id === "string" && id.startsWith("widget:") ? id.slice(7) : "").filter(isWidget);
  const base = createDockLayout([...new Set([...widgets, ...dockedWidgets])]);
  if (value.version !== 2 && value.version !== 3) {
    for (const surface of ["sidebar", "bottom"] as const) for (const old of Array.isArray(value[surface]) ? value[surface] : []) {
      const panel = old === BROWSER_ID ? BROWSER_ID : Object.values(base.panels).find((item) => item.kind === "widget" && `widget:${item.widget}` === old)?.id;
      if (!panel || panelSurface(base, panel) === surface) continue;
      const result = reduceDock(base, { type: "move", panelId: panel, target: { surface, intent: "append" } }, policy);
      if (result.ok) Object.assign(base, result.layout);
    }
    for (const panel of Object.values(base.panels)) if (panel.kind === "widget" && ["compact", "standard", "wide"].includes(value.widgetSizes?.[panel.widget])) panel.size = value.widgetSizes[panel.widget];
    base.bottomSize = Number.isFinite(value.bottomSize) ? Math.max(24, Math.min(60, value.bottomSize)) : 36;
    base.browserView = value.browserView === "list" ? "list" : "grid";
    return base;
  }
  const panels: Record<string, Panel> = { [HOME_ID]: base.panels[HOME_ID], [BROWSER_ID]: base.panels[BROWSER_ID], [NAVIGATION_ID]: base.panels[NAVIGATION_ID] };
  for (const [id, panel] of Object.entries(value.panels ?? {})) if (panel && typeof panel === "object" && (panel as Panel).id === id) {
    const typed = panel as Panel;
    if (typed.kind === "widget" && isWidget(typed.widget) || (typed.kind === "unit" || typed.kind === "web-widget") && typeof typed.unitId === "string") panels[id] = typed;
  }
  const seen = new Set<string>();
  const nodeIds = new Set<string>();
  const displaced: string[] = [];
  const clean = (node: any, surface: Surface, depth = 0): Node | null => {
    if (!node || depth > 32 || typeof node.id !== "string") return null;
    const id = nodeIds.has(node.id) ? uid(node.kind === "split" ? "split" : node.kind === "grid" ? "grid" : "stack") : node.id;
    nodeIds.add(id);
    if (node.kind === "stack" && Array.isArray(node.tabs)) {
      const tabs: string[] = node.tabs.filter((panelId: unknown) => {
        if (typeof panelId !== "string" || !panels[panelId] || seen.has(panelId)) return false;
        if (placementReason(panels[panelId], { surface, intent: "append" }, policy)) { displaced.push(panelId); return false; }
        seen.add(panelId); return true;
      });
      return tabs.length ? { kind: "stack", id, tabs, active: tabs.includes(node.active) ? node.active : tabs[0] } : null;
    }
    if (node.kind === "split") {
      const first = clean(node.first, surface, depth + 1), second = clean(node.second, surface, depth + 1);
      return first && second ? { kind: "split", id, axis: node.axis === "vertical" ? "vertical" : "horizontal", ratio: Number.isFinite(node.ratio) ? Math.max(.2, Math.min(.8, node.ratio)) : .5, first, second } : first ?? second;
    }
    if (node.kind === "grid" && Array.isArray(node.cells)) return { kind: "grid", id, cells: node.cells.map((cell: any) => ({ id: cell.id, node: clean(cell.node, surface, depth + 1) })).filter((cell: any) => typeof cell.id === "string" && cell.node) };
    return null;
  };
  const surfaces = Object.fromEntries((["main", "dashboard", "sidebar", "bottom"] as const).map((surface) => [surface, clean(value.surfaces?.[surface], surface)])) as DockLayout["surfaces"];
  // Older layouts could split every surface without a leaf limit. Merge excess
  // leaves into the first stack in traversal order, retaining tab order and IDs.
  for (const surface of ["main", "sidebar", "bottom"] as const) {
    const root = surfaces[surface];
    const leaves: Stack[] = [];
    visitNode(root, (node) => { if (node.kind === "stack") leaves.push(node); });
    const limit = policy[surface].maxLeafStacks;
    if (leaves.length <= limit) continue;
    const keep = leaves.slice(0, limit);
    const overflow = leaves.slice(limit).flatMap((leaf) => leaf.tabs);
    const ids = new Set(keep.map((leaf) => leaf.id));
    const prune = (node: Node): Node | null => node.kind === "stack" ? ids.has(node.id) ? node : null
      : node.kind === "split" ? (() => { const first = prune(node.first), second = prune(node.second); return first && second ? { ...node, first, second } : first ?? second; })() : node;
    const first = keep[0];
    surfaces[surface] = rewrite(prune(root!)!, (node) => node.kind === "stack" && node.id === first.id ? { ...node, tabs: [...node.tabs, ...overflow] } : node);
  }
  if (!seen.has(HOME_ID)) {
    let first: Stack | null = null;
    visitNode(surfaces.main, (node) => { if (!first && node.kind === "stack") first = node; });
    surfaces.main = surfaces.main ? insert(surfaces.main, HOME_ID, { surface: "main", intent: "tab", nodeId: (first as Stack | null)?.id, index: 0 }) : base.surfaces.main;
    seen.add(HOME_ID);
  }
  if (!seen.has(BROWSER_ID)) { surfaces.bottom = surfaces.bottom ? insert(surfaces.bottom, BROWSER_ID, { surface: "bottom", intent: "append" }) : base.surfaces.bottom; seen.add(BROWSER_ID); }
  if (!seen.has(NAVIGATION_ID)) { surfaces.sidebar = surfaces.sidebar ? insert(surfaces.sidebar, NAVIGATION_ID, { surface: "sidebar", intent: "append", index: 0 }) : base.surfaces.sidebar; seen.add(NAVIGATION_ID); }
  if (surfaces.dashboard?.kind !== "grid") surfaces.dashboard = { kind: "grid", id: "grid:dashboard", cells: [] };
  const floating: DockLayout["floating"] = {};
  for (const [id, item] of Object.entries(value.floating ?? {})) {
    const position = item as DockLayout["floating"][string];
    if (panels[id]?.kind !== "widget" || seen.has(id) || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) continue;
    floating[id] = { x: Math.max(0, position.x), y: Math.max(0, position.y), width: 360, height: 320,
      returnTo: WIDGET_PLACEMENT[(panels[id] as Extract<Panel, { kind: "widget" }>).widget].docks.includes(position.returnTo) ? position.returnTo : "dashboard" };
    seen.add(id);
  }
  for (const id of new Set([...displaced, ...Object.keys(panels)])) {
    if (seen.has(id) || floating[id]) continue;
    const panel = panels[id];
    const surface: Surface = panel.kind === "widget" || panel.kind === "web-widget" ? "dashboard" : panel.kind === "browser" ? "bottom" : panel.kind === "navigation" ? "sidebar" : "main";
    if (surfacePanels({ ...base, surfaces }, surface).includes(id)) { seen.add(id); continue; }
    let firstStack: Stack | null = null;
    visitNode(surfaces[surface], (node) => { if (!firstStack && node.kind === "stack") firstStack = node; });
    const target: Target = surface === "dashboard" ? { surface, intent: "append" }
      : { surface, intent: "tab", nodeId: (firstStack as Stack | null)?.id };
    surfaces[surface] = insert(surfaces[surface], id, target);
    seen.add(id);
  }
  let migrated: DockLayout = { version: 3, panels, surfaces, bottomSize: Number.isFinite(value.bottomSize) ? Math.max(24, Math.min(60, value.bottomSize)) : 36,
    browserView: value.browserView === "list" ? "list" : "grid", maximized: typeof value.maximized === "string" && seen.has(value.maximized) ? value.maximized : null,
    hidden: Object.fromEntries((["main", "sidebar", "bottom"] as const).map((surface) => [surface, value.hidden?.[surface] === true])) as DockLayout["hidden"],
    sidebarSide: value.sidebarSide === "right" ? "right" : "left", floating };
  // v2 predates the new starters. The v3 document prevents adding them again if removed.
  if (value.version === 2) {
    for (const widget of ["weather", "clock", "stack"] as const) {
      if (Object.values(migrated.panels).some((panel) => panel.kind === "widget" && panel.widget === widget)) continue;
      const result = reduceDock(migrated, { type: "createWidget", widget, target: { surface: "dashboard", intent: "append" } }, policy);
      if (result.ok) migrated = result.layout;
    }
  }
  return migrated;
}

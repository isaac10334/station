import { viewConfigurationSchema, type DataViewConfiguration } from "./data-sources";
import { noteValueSchema, type NoteValue } from "./notes";
import { actionButtonSchema, type ActionButtonConfiguration } from "./action-buttons";
import { normalizeNavigation,type NavigationFilter } from "./navigation-filter";
import { APP_SHELL_SEEDS, widgetDefaultsSchema } from "./widget-definitions";
import { definitionSnapshotSchema, instanceDefaults, reconcileDefinitionDefaults, type DefinitionSnapshot } from "./definition-snapshot";
/**
 * Pure, versioned workspace layout. A panel ID identifies one placed instance;
 * widget type is metadata and may occur any number of times.
 *
 * @example
 * const initial = createDockLayout();
 * const result = reduceDock(initial, { type: "createWidget", widget: "stack", target: { surface: "dashboard", intent: "append" } });
 * if (result.ok) save(result.layout);
 */
import {
  WIDGET_IDS,
  type BrowserView,
  type WidgetId,
  type WidgetSize,
  type WidgetTone,
  type StackMode,
  type WidgetChrome,
} from "./panel-layout";
import type { BrowserConfiguration } from "@station/capabilities";
import { browserConfiguration, defaultBrowserConfiguration } from "./browser-policy";
import { slotReferenceSchema, type SlotReference } from "./slot-reference";

export const SURFACES = ["main", "dashboard", "sidebar", "bottom", "toolbar"] as const;
export type Surface = (typeof SURFACES)[number];
export type Intent =
  "append" | "tab" | "swap" | "left" | "right" | "top" | "bottom";
export type Target = {
  surface: Surface;
  intent: Intent;
  nodeId?: string;
  ownerId?: string;
  index?: number;
  allowedTags?: string[];
};
/** A host's allowed placements for one surface. `maxLeafStacks` counts stacks after a command commits. */
export type SurfacePolicy = {
  acceptedTags: readonly string[];
  intents: readonly Intent[];
  split: boolean;
  relocateStack: boolean;
  maxLeafStacks: number;
};
/** Supply the same policy to the store and `DockHost` so previews match commits. */
export type DockPolicy = Record<Surface, SurfacePolicy>;
/** Host configuration is executable policy, never part of the saved layout. */
export const DEFAULT_DOCK_POLICY: DockPolicy = {
  toolbar: { acceptedTags: ["widget"], intents: ["append", "tab"], split: false, relocateStack: false, maxLeafStacks: 1 },
  main: {
    acceptedTags: ["browser", "view", "widget"],
    intents: ["append", "tab", "swap", "left", "right", "top", "bottom"],
    split: true,
    relocateStack: false,
    maxLeafStacks: 4,
  },
  dashboard: {
    acceptedTags: ["browser", "widget", "view"],
    intents: ["append", "tab", "swap", "left", "right", "top", "bottom"],
    split: true,
    relocateStack: false,
    maxLeafStacks: 100,
  },
  sidebar: {
    acceptedTags: ["navigation", "browser", "view", "widget"],
    intents: ["append", "tab", "swap", "left", "right", "top", "bottom"],
    split: true,
    relocateStack: false,
    maxLeafStacks: 100,
  },
  bottom: {
    acceptedTags: ["browser", "view", "widget"],
    intents: ["append", "tab"],
    split: false,
    relocateStack: false,
    maxLeafStacks: 1,
  },
};
/** Built-in widget eligibility; double-click does nothing unless a type explicitly opts in. */
export type WidgetPlacement = {
  /** Provides an inline presentation in constrained toolbar slots. */
  compact?: boolean;
  /** Compact floating chrome uses the same placement and drag lifecycle as windows. */
  window?: { width: number; height: number; minHeight: number; chrome: "overlay" };
  docks: readonly Surface[];
  floating: boolean;
  doubleClick?: "float" | "none";
};
const ordinaryWidget: WidgetPlacement = {
  docks: ["main", "dashboard", "sidebar", "bottom"],
  floating: true,
  doubleClick: "none",
};
export const WIDGET_PLACEMENT: Record<WidgetId, WidgetPlacement> = {
  "desk-controls": { ...ordinaryWidget, compact: true, docks: [...ordinaryWidget.docks, "toolbar"], window: { width: 340, height: 48, minHeight: 40, chrome: "overlay" } },
  "quick-capture": ordinaryWidget,
  note: ordinaryWidget,
  ide: ordinaryWidget,
  "desk-settings": ordinaryWidget,
  weather: ordinaryWidget,
  clock: ordinaryWidget,
  capabilities: ordinaryWidget,
  stack: ordinaryWidget,
  snake: ordinaryWidget,
  "docking-inspector": ordinaryWidget,
  "ai-chat": ordinaryWidget,
  "web-browser": ordinaryWidget,
  "browser-tab": ordinaryWidget,
  "app-shell": ordinaryWidget,
  "desktop-shell": { docks: [], floating: false },
  navigation: ordinaryWidget,
  "asset-browser": ordinaryWidget,
  "main-surface": ordinaryWidget,
  "widget-editor": ordinaryWidget,
  "widget-list": ordinaryWidget,
  "data-view": ordinaryWidget,
  "action-button": { ...ordinaryWidget, compact: true, docks: [...ordinaryWidget.docks, "toolbar"] },
  program: { ...ordinaryWidget, compact:true, docks:[...ordinaryWidget.docks,"toolbar"] },
} satisfies Record<WidgetId, WidgetPlacement>;
/** Per-instance chrome is independent of placement and authored content. */
export type PanelAppearance = {
  /** Fill the slot, scroll natural content, or clip it at the slot boundary. */
  contentSizing?: "fill" | "scroll" | "clip";
  displayName?: string;
  hideDisplayName?: boolean;
  flippable?: boolean;
  chrome?: WidgetChrome;
};
export type Panel = PanelAppearance & {
  note?: NoteValue;
  surface?: import("./authored-surface").AuthoredSurface;
  definitionSnapshot?: DefinitionSnapshot;
  compositionOrigin?: { assetId: string; revision: number; key?: string };
  sourceAssetId?: string;
  programDraft?: import("./programs").ProgramDraft;
  programCompact?:boolean;
  /** Resolved live identity; definitions contain local keys instead. */
  targetRef?: SlotReference;
  dataView?: DataViewConfiguration;
  actionButton?: ActionButtonConfiguration;
  navigation?: {filter:NavigationFilter;presentation:'list'|'tree'|'compact';selectedAssetId?:string;areasInitialized?:boolean};
  listMode?: "inline" | "tab";
  instanceShell?: boolean;
  ownerId?: string;
  definitionId?: string;
  slotId?: string;
} & (
  | { id: string; kind: "home" | "browser" | "navigation"; tags: string[] }
  | { id: string; kind: "asset"; assetId: string; tags: string[] }
  | { id: string; kind: "web-widget"; assetId: string; tags: string[] }
  | {
      id: string;
      kind: "widget";
      widget: WidgetId;
      size: WidgetSize;
      tone?: WidgetTone;
      stackMode?: StackMode;
      /** Default definition created by this Layout's add action. */
      childWidget?: WidgetId;
      browser?: BrowserConfiguration;
      background?: string;
      tags: string[];
    }
  | {
      id: string;
      kind: "editor-part";
      assetId: string;
      part: "files" | "code" | "preview" | "problems";
      tags: string[];
    }
  | { id: string; kind: "command-output"; definitionId: string; tags: string[] }
  | {
      id: string;
      kind: "contribution";
      definitionId: string;
      assetId?: string;
      tags: string[];
    }
);
export type Stack = {
  kind: "stack";
  id: string;
  tabs: string[];
  active: string;
  keepEmpty?: boolean;
  /** Legacy preference retained for document/wire compatibility. Empty slots
   * now survive every departure until an explicit removeSlot command. */
  autoClose?: boolean;
  presentation?: "plain" | "tabs" | "carousel";
  allowedDefinitions?: string[];
  slotId?: string;
};
export type Split = {
  kind: "split";
  id: string;
  axis: "horizontal" | "vertical";
  ratio: number;
  first: Node;
  second: Node;
};
export type Grid = {
  kind: "grid";
  id: string;
  cells: { id: string; node: Node; height?: number }[];
};
export type Node = Stack | Split | Grid;
export type DockLayout = {
  version: 5;
  /** A desk owns one root shell instance; its named surfaces use this same graph. */
  rootId?: string;
  panels: Record<string, Panel>;
  /** Layout widget ID -> owned subtree. Same nodes, commands and persistence as surfaces. */
  containers: Record<string, Node>;
  surfaces: Record<Surface, Node | null>;
  bottomSize: number;
  /** Saved desktop side-dock width in CSS pixels. */
  sidebarWidth: number;
  /** Centered dashboard width as a percentage of its available surface. */
  dashboardWidth?: number;
  browserView: BrowserView;
  maximized: string | null;
  hidden: Partial<Record<Surface, boolean>>;
  sidebarSide: "left" | "right";
  floating: Record<
    string,
    { x: number; y: number; width: number; height: number; returnTo: Surface;
      presentation?: "window" | "peek"; edge?: "top" | "bottom" | "left" | "right"; hidden?: boolean }
  >;
};
/** Commands are the sole structural mutation boundary; rejected commands leave the input intact. */
export type Command =
  | { type: "configureNote"; panelId: string; value?: NoteValue; sourceAssetId?: string | null }
  | { type: "configureDataView"; panelId: string; config: DataViewConfiguration }
  | { type: "configureActionButton"; panelId: string; config: ActionButtonConfiguration }
  | {type:'configureProgram';panelId:string;compact:boolean}
  | { type: "configureListItem"; panelId: string; mode: "inline" | "tab" }
  | { type: "setWidgetTarget"; panelId: string; reference: SlotReference | null }
  /** All-or-nothing transaction; one host history entry, no intermediate layout. */
  | { type: "batch"; commands: readonly Command[] }
  | { type: "setRootWidget"; widget: "app-shell" | "desktop-shell"; definitionId?: string; definitionSnapshot?: DefinitionSnapshot; defaults?: import("./widget-definitions").WidgetDefaults; slots?: import("./widget-definitions").WidgetSeed[][]; recipeKey?: string; recipeTarget?: { key: string; slot?: number } }
  | { type: "configureShell"; background: string }
  | { type: "windowVisibility"; panelId: string; hidden: boolean }
  /** Dashboard rows use explicit pixel heights; undefined restores automatic size. */
  | { type: "resizeRow"; cellId: string; height?: number }
  | { type: "resizeDashboard"; percent: number }
  /** Switch a Layout between a resizable row grid and a split tree, retaining
   * every backing slot and widget identity. Undo restores the previous structure. */
  | { type: "setLayoutArrangement"; panelId: string; arrangement: "rows" | "split" }
  | {
      type: "createEditorPart";
      ownerId: string;
      assetId: string;
      part: "files" | "code" | "preview" | "problems";
      slotId: string;
      target: Target;
    }
  | { type: "createCommandOutput"; definitionId: string; target: Target }
  | { type: "setEditor"; panelId: string; definitionId?: string }
  | { type: "configureIde"; panelId: string; assetId: string | null }
  | { type: "compose"; ownerId: string; panels: Panel[]; root: Node }
  | {
      type: "createContribution";
      definitionId: string;
      assetId?: string;
      target: Target;
      id?: string;
      ownerId?: string;
      slotId?: string;
    }
  | { type: "splitSlot"; nodeId: string; axis: "horizontal" | "vertical" }
  | { type: "addSlot"; surface: Surface; ownerId?: string }
  | { type: "removeSlot"; nodeId: string }
  | { type: "configureSlot"; nodeId: string; autoClose: boolean }
  | { type: "closeAndRemoveSlot"; panelId: string }
  | { type: "createWidget"; widget: WidgetId; target: Target; id?: string; chrome?: WidgetChrome; childWidget?: WidgetId; definitionId?: string; definitionSnapshot?: DefinitionSnapshot; defaults?: import("./widget-definitions").WidgetDefaults; slots?: import("./widget-definitions").WidgetSeed[][]; recipeKey?: string; recipeTarget?: { key: string; slot?: number } }
  /** Compatible recipes share a renderer/state contract. Identity, children and
   * runtime state survive; cross-renderer migration is rejected without adapters. */
  | { type: "setWidgetDefinition"; panelId: string; definitionId: string; widget: WidgetId; definitionSnapshot?: DefinitionSnapshot; reconciliation?: "preserve" | "reset"; defaults?: import("./widget-definitions").WidgetDefaults }
  | { type: "createAssetView"; assetId: string; target: Target; id?: string }
  | { type: "openAsset"; assetId: string; target?: Target }
  | { type: "createWebWidget"; assetId: string; id?: string; target?: Target }
  | { type: "move"; panelId: string; target: Target; deferEmptySlot?: boolean }
  | { type: "activate"; panelId: string }
  | { type: "close"; panelId: string }
  | { type: "resizeSplit"; nodeId: string; ratio: number }
  | { type: "resizeBottom"; size: number }
  | { type: "resizeSidebar"; width: number }
  | { type: "resizeWidget"; panelId: string; size: WidgetSize }
  | ({ type: "configurePanel"; panelId: string } & PanelAppearance)
  | { type: "configureBrowser"; panelId: string; config: BrowserConfiguration }
  | {
      type: "configureWidget";
      panelId: string;
      tone?: WidgetTone;
      stackMode?: StackMode;
      childWidget?: WidgetId | null;
      chrome?: WidgetChrome;
      /** Instance display name; empty uses the catalog title. */
      displayName?: string;
      hideDisplayName?: boolean;
      flippable?: boolean;
    }
  | { type: "browserView"; view: BrowserView }
  | { type: "maximize"; panelId: string | null }
  | { type: "visibility"; surface: Surface; hidden: boolean }
  | { type: "sidebarSide"; side: "left" | "right" }
  | { type: "float"; panelId: string; x?: number; y?: number }
  /** A drawer contains one real panel (which can itself be a Layout). Closing hides
   * it; docking restores its saved destination. No duplicated content tree. */
  | { type: "presentPanel"; panelId: string; mode: "window" | "peek"; edge?: "top" | "bottom" | "left" | "right" }
  | { type: "peekVisibility"; panelId: string; hidden: boolean }
  | { type: "dockFloat"; panelId: string; target?: Target }
  | { type: "moveFloat"; panelId: string; x: number; y: number }
  /** One settled resize is one undo step; React owns pointer previews. */
  | { type: "resizeFloat"; panelId: string; width: number; height: number };
/** Layouts accept movable children; package/editor ownership remains restrictive. */
export function isLayoutPanel(panel: Panel | undefined): panel is Extract<Panel, { kind: "widget" }> & { widget: "stack" | "web-browser" | "main-surface" | "app-shell" | "widget-list" } {
  return panel?.kind === "widget" && (["stack", "web-browser", "main-surface", "widget-list"].includes(panel.widget) || (panel.widget === "app-shell" && panel.instanceShell === true));
}

export type Result =
  | { ok: true; layout: DockLayout; panelId?: string }
  | { ok: false; layout: DockLayout; reason: string };

const isWidget = (id: unknown): id is WidgetId =>
  typeof id === "string" && WIDGET_IDS.includes(id as WidgetId);
const uid = (prefix: string) => `${prefix}:${crypto.randomUUID()}`;
const stack = (panelId: string, id = uid("stack")): Stack => ({
  kind: "stack",
  id,
  tabs: [panelId],
  active: panelId,
});
const emptySlot = (): Stack => ({
  kind: "stack",
  id: uid("slot"),
  tabs: [],
  active: "",
  keepEmpty: true,
});
/** Legacy card order becomes backing rows with asymmetric, resizable columns. */
function bentoRows(cells: Grid["cells"]): Grid["cells"] {
  const rows: Grid["cells"] = [];
  for (let index = 0; index < cells.length; index += 2) {
    const first = cells[index],
      second = cells[index + 1];
    rows.push(
      second
        ? {
            id: first.id,
            node: {
              kind: "split",
              id: uid("split"),
              axis: "horizontal",
              ratio: index % 4 === 0 ? 0.6 : 0.4,
              first: first.node,
              second: second.node,
            },
          }
        : first,
    );
  }
  return rows;
}

/** Traverse a container's instance ownership, excluding the owner itself. */
export function descendants(layout: DockLayout, ownerId: string): string[] {
  const ids: string[] = [];
  const collect = (id: string) =>
    visitNode(layout.containers[id] ?? null, (node) => {
      if (node.kind === "stack")
        for (const child of node.tabs)
          if (!ids.includes(child)) {
            ids.push(child);
            collect(child);
          }
    });
  collect(ownerId);
  return ids;
}
/** Policy surface for nested children, including children of a floating Layout. */
export function hostSurface(
  layout: DockLayout,
  panelId: string,
): Surface | null {
  return (
    panelSurface(layout, panelId) ??
    layout.floating[panelId]?.returnTo ??
    Object.entries(layout.floating).find(([id]) =>
      descendants(layout, id).includes(panelId),
    )?.[1].returnTo ??
    null
  );
}
const targetRoot = (layout: DockLayout, target: Target) =>
  target.ownerId
    ? layout.containers[target.ownerId]
    : layout.surfaces[target.surface];
function mapRoots(
  layout: DockLayout,
  fn: (node: Node | null) => Node | null,
): DockLayout {
  return {
    ...layout,
    surfaces: Object.fromEntries(
      Object.entries(layout.surfaces).map(([key, node]) => [key, fn(node)]),
    ) as DockLayout["surfaces"],
    containers: Object.fromEntries(
      Object.entries(layout.containers).map(([key, node]) => [
        key,
        fn(node) ?? emptySlot(),
      ]),
    ),
  };
}
function setTargetRoot(
  layout: DockLayout,
  target: Target,
  root: Node | null,
): DockLayout {
  return target.ownerId
    ? {
        ...layout,
        containers: {
          ...layout.containers,
          [target.ownerId]: root ?? emptySlot(),
        },
      }
    : { ...layout, surfaces: { ...layout.surfaces, [target.surface]: root } };
}
/** Direct slot ownership, used for swaps and chosen-slot actions. */
export function panelSlot(
  layout: DockLayout,
  panelId: string,
): { node: Stack; target: Target } | null {
  let result: { node: Stack; target: Target } | null = null;
  const scan = (root: Node | null, surface: Surface, ownerId?: string) =>
    visitNode(root, (node) => {
      if (node.kind === "stack" && node.tabs.includes(panelId))
        result = {
          node,
          target: { surface, ownerId, nodeId: node.id, intent: "tab" },
        };
    });
  for (const surface of SURFACES)
    scan(layout.surfaces[surface], surface);
  for (const [ownerId, root] of Object.entries(layout.containers))
    scan(root, hostSurface(layout, ownerId) ?? "dashboard", ownerId);
  return result;
}
import { ROOT_ID, HOME_ID, BROWSER_ID, NAVIGATION_ID } from "./dock-identities";
export { ROOT_ID, HOME_ID, BROWSER_ID, NAVIGATION_ID } from "./dock-identities";

export function createDockLayout(
  widgets: WidgetId[] = ["clock", "action-button"],
): DockLayout {
  const panels: Record<string, Panel> = {
    [ROOT_ID]: { id: ROOT_ID, kind: "widget", widget: "app-shell", definitionId: "builtin:app-shell", size: "standard", tags: ["widget"], chrome: "seamless", hideDisplayName: false, stackMode: "tabs" },
    [HOME_ID]: { id: HOME_ID, kind: "home", tags: ["view"] },
    [BROWSER_ID]: { id: BROWSER_ID, kind: "browser", tags: ["browser"] },
    [NAVIGATION_ID]: {
      id: NAVIGATION_ID,
      kind: "navigation",
      tags: ["navigation"],
      navigation:{filter:normalizeNavigation(),presentation:'list'},
    },
  };
  const cells = widgets.filter(isWidget).map((widget, index) => {
    const id = `widget:${widget}:legacy-${index}`;
    panels[id] = {
      id,
      kind: "widget",
      widget,
      ...(widget === "action-button" ? { actionButton: actionButtonSchema.parse({ action: "widgets.add", label: "Add a widget", icon: "Plus", variant: "default", fullWidth: true }) } : {}),
      size: "standard",
      tags: ["widget"],
    };
    return {
      id: `cell:${id}`,
      node: { ...stack(id, `stack:${id}`), keepEmpty: true },
    };
  });
  return {
    version: 5,
    rootId: ROOT_ID,
    panels,
    containers: Object.fromEntries(
      Object.values(panels)
        .filter((p) => isLayoutPanel(p))
        .map((p) => [p.id, emptySlot()]),
    ),
    surfaces: {
      toolbar: { ...emptySlot(), id: "stack:toolbar" },
      main: stack(HOME_ID, "stack:main"),
      dashboard: {
        kind: "grid",
        id: "grid:dashboard",
        cells: bentoRows(cells),
      },
      sidebar: { ...stack(NAVIGATION_ID, "stack:sidebar"), presentation: "plain" },
      bottom: { ...stack(BROWSER_ID, "stack:bottom"), keepEmpty: true },
    },
    sidebarWidth: 310,
    bottomSize: 36,
    browserView: "grid",
    maximized: null,
    hidden: {},
    sidebarSide: "left",
    floating: {},
  };
}

export function visitNode(
  node: Node | null,
  visit: (node: Node) => void,
): void {
  if (!node) return;
  visit(node);
  if (node.kind === "split") {
    visitNode(node.first, visit);
    visitNode(node.second, visit);
  }
  if (node.kind === "grid")
    node.cells.forEach((cell) => visitNode(cell.node, visit));
}
export function findNode(layout: DockLayout, id: string): Node | null {
  let found: Node | null = null;
  [
    ...Object.values(layout.surfaces),
    ...Object.values(layout.containers),
  ].forEach((root) =>
    visitNode(root, (node) => {
      if (node.id === id) found = node;
    }),
  );
  return found;
}
export function surfacePanels(layout: DockLayout, surface: Surface): string[] {
  const result: string[] = [];
  const collect = (root: Node | null) =>
    visitNode(root, (node) => {
      if (node.kind === "stack")
        for (const id of node.tabs) {
          if (result.includes(id)) continue;
          result.push(id);
          if (layout.containers[id]) collect(layout.containers[id]);
        }
    });
  collect(layout.surfaces[surface]);
  return result;
}
export function panelSurface(
  layout: DockLayout,
  panelId: string,
): Surface | null {
  for (const surface of SURFACES)
    if (surfacePanels(layout, surface).includes(panelId)) return surface;
  return null;
}
export function leafStacks(node: Node | null): number {
  let count = 0;
  visitNode(node, (candidate) => {
    if (candidate.kind === "stack") count++;
  });
  return count;
}

/** Host-owned placement policy. A rejected target provides a readable reason for UI/debugging. */
export function placementReason(
  panel: Panel,
  target: Target,
  policy: DockPolicy = DEFAULT_DOCK_POLICY,
): string | null {
  if (target.surface === "toolbar" && (target.ownerId || panel.kind !== "widget" || !WIDGET_PLACEMENT[panel.widget].compact || panel.widget==='program'&&!(panel.programCompact??panel.programDraft?.compact)))
    return "Only compact-capable widgets can enter the toolbar";
  if (panel.ownerId && panel.ownerId !== target.ownerId)
    return "This widget belongs to its owner";
  const surface = target.ownerId ? policy.dashboard : policy[target.surface];
  if (!surface) return "Unknown surface";
  if (!surface.intents.includes(target.intent))
    return `${target.surface} does not allow ${target.intent} placement`;
  if (!surface.acceptedTags.some((tag) => panel.tags.includes(tag)))
    return `${target.surface} does not accept this panel type`;
  if (
    target.allowedTags?.length &&
    !target.allowedTags.some((tag) => panel.tags.includes(tag))
  )
    return "This slot does not accept this panel type";
  if (panel.kind === "home" && target.surface !== "main")
    return "Overview belongs in the main surface";
  if (panel.kind === "navigation" && target.surface !== "sidebar")
    return "Navigation belongs in the sidebar";
  if (
    panel.kind === "widget" &&
    !(WIDGET_PLACEMENT[panel.widget].docks as readonly Surface[]).includes(target.surface)
  )
    return "Widget cannot dock in this surface";
  return null;
}
function rewrite(node: Node | null, fn: (node: Node) => Node): Node | null {
  if (!node) return null;
  const nested: Node =
    node.kind === "split"
      ? {
          ...node,
          first: rewrite(node.first, fn)!,
          second: rewrite(node.second, fn)!,
        }
      : node.kind === "grid"
        ? {
            ...node,
            cells: node.cells.map((cell) => ({
              ...cell,
              node: rewrite(cell.node, fn)!,
            })),
          }
        : node;
  return fn(nested);
}
/** Removing an instance preserves its placement for explicit reuse/removal. */
function without(node: Node | null, panelId: string): Node | null {
  if (!node) return null;
  if (node.kind === "stack") {
    const tabs = node.tabs.filter((id) => id !== panelId);
    const retained = !tabs.length && node.tabs.includes(panelId);
    return tabs.length || node.keepEmpty || node.autoClose === false || retained
      ? {
          ...node,
          ...(retained ? { keepEmpty: true } : {}),
          tabs,
          active: tabs.includes(node.active) ? node.active : (tabs[0] ?? ""),
        }
      : null;
  }
  if (node.kind === "grid")
    return {
      ...node,
      cells: node.cells
        .map((cell) => ({ ...cell, node: without(cell.node, panelId) }))
        .filter((cell): cell is { id: string; node: Node } =>
          Boolean(cell.node),
        ),
    };
  const first = without(node.first, panelId),
    second = without(node.second, panelId);
  return first && second ? { ...node, first, second } : (first ?? second);
}
function insert(
  root: Node | null,
  panelId: string,
  target: Target,
): Node | null {
  if (
    ((target.surface === "dashboard" && !target.ownerId) || root?.kind === "grid") &&
    ((target.intent === "append" && !target.nodeId) ||
      (root?.kind === "grid" && target.intent === "tab"))
  ) {
    const grid: Grid =
      root?.kind === "grid"
        ? root
        : {
            kind: "grid",
            id: root ? uid("grid") : "grid:dashboard",
            cells: root ? [{ id: uid("cell"), node: root }] : [],
          };
    if (target.intent === "tab" && target.nodeId)
      return rewrite(grid, (node) =>
        node.kind === "stack" && node.id === target.nodeId
          ? {
              ...node,
              tabs: [
                ...node.tabs.slice(0, target.index ?? node.tabs.length),
                panelId,
                ...node.tabs.slice(target.index ?? node.tabs.length),
              ],
              active: panelId,
            }
          : node,
      );
    const cells = [...grid.cells];
    cells.splice(
      Math.max(0, Math.min(cells.length, target.index ?? cells.length)),
      0,
      { id: uid("cell"), node: { ...stack(panelId), keepEmpty: true } },
    );
    return { ...grid, cells };
  }
  if (!root)
    return {
      ...stack(panelId),
      keepEmpty: target.surface === "bottom" && !target.ownerId,
    };
  if (target.intent === "append" || target.intent === "tab") {
    const nodeId = target.nodeId ?? (root.kind === "stack" ? root.id : null);
    if (!nodeId)
      return {
        kind: "split",
        id: uid("split"),
        axis: "horizontal",
        ratio: 0.5,
        first: root,
        second: stack(panelId),
      };
    return rewrite(root, (node) =>
      node.kind === "stack" && node.id === nodeId
        ? {
            ...node,
            tabs: [
              ...node.tabs.slice(0, target.index ?? node.tabs.length),
              panelId,
              ...node.tabs.slice(target.index ?? node.tabs.length),
            ],
            active: panelId,
          }
        : node,
    );
  }
  const axis =
    target.intent === "left" || target.intent === "right"
      ? "horizontal"
      : "vertical";
  const before = target.intent === "left" || target.intent === "top";
  const nodeId = target.nodeId ?? root.id;
  return rewrite(root, (node) =>
    node.id === nodeId
      ? {
          kind: "split",
          id: uid("split"),
          axis,
          ratio: 0.5,
          first: before ? stack(panelId) : node,
          second: before ? node : stack(panelId),
        }
      : node,
  );
}
function targetReason(layout: DockLayout, target: Target): string | null {
  if (target.ownerId && !layout.containers[target.ownerId])
    return "Layout container does not exist";
  if (!target.nodeId) return null;
  let inSurface = false;
  visitNode(targetRoot(layout, target), (node) => {
    if (node.id === target.nodeId) inSurface = true;
  });
  if (!inSurface) return "Target does not exist in this surface";
  if (
    target.intent === "tab" &&
    findNode(layout, target.nodeId)?.kind !== "stack"
  )
    return "Tab insertion requires a stack";
  return null;
}

/** Check a candidate against policy and the current tree before painting a drop zone. */
export function dropReason(
  layout: DockLayout,
  panel: Panel,
  target: Target,
  policy: DockPolicy = DEFAULT_DOCK_POLICY,
): string | null {
  const reason =
    placementReason(panel, target, policy) ?? targetReason(layout, target);
  if (reason) return reason;
  if (target.ownerId) {
    const owner = layout.panels[target.ownerId];
    if (
      owner &&
      !isLayoutPanel(owner) && !isNavigationPanel(owner) &&
      panel.ownerId !== target.ownerId
    )
      return "This composition only accepts its owned widgets";
  }
  const slot = target.nodeId ? findNode(layout, target.nodeId) : null;
  if (
    slot?.kind === "stack" &&
    slot.allowedDefinitions &&
    (!panel.definitionId ||
      !slot.allowedDefinitions.includes(panel.definitionId))
  )
    return "Definition not allowed in this slot";
  if (
    target.ownerId &&
    (target.ownerId === panel.id ||
      descendants(layout, panel.id).includes(target.ownerId))
  )
    return "A Layout cannot contain itself or an ancestor";
  if (target.ownerId && ["home", "navigation"].includes(panel.kind))
    return "Required host widgets cannot enter a Layout";
  if (target.ownerId && hostSurface(layout, target.ownerId) !== target.surface)
    return "Container surface changed";
  const sourceSlot = panelSlot(layout, panel.id);
  if (
    target.nodeId &&
    sourceSlot?.node.id === target.nodeId &&
    sourceSlot.node.tabs.length === 1
  )
    return "Cannot drop onto the panel being moved";
  if (target.intent === "swap") {
    const destination = target.nodeId ? findNode(layout, target.nodeId) : null;
    const source = panelSlot(layout, panel.id);
    if (
      destination?.kind !== "stack" ||
      destination.tabs.length !== 1 ||
      !source ||
      source.node.tabs.length !== 1
    )
      return "Swap requires two occupied single-widget slots";
    const other = layout.panels[destination.tabs[0]];
    if (other.id === panel.id) return "Choose another slot";
    if (
      descendants(layout, other.id).includes(panel.id) ||
      descendants(layout, panel.id).includes(other.id)
    )
      return "Cannot swap a Layout with its descendant";
    return placementReason(other, { ...source.target, intent: "tab" }, policy);
  }
  const leaves = leafStacks(targetRoot(layout, target));
  const targetPolicy = target.ownerId
    ? policy.dashboard
    : policy[target.surface];
  let freesLeaf = false;
  visitNode(targetRoot(layout, target), (node) => {
    if (
      node.kind === "stack" &&
      !node.keepEmpty &&
      node.tabs.length === 1 &&
      node.tabs[0] === panel.id
    )
      freesLeaf = true;
  });
  if (
    target.surface === "dashboard" &&
    !target.ownerId &&
    target.intent === "append" &&
    leaves >= targetPolicy.maxLeafStacks &&
    !freesLeaf
  )
    return `dashboard allows at most ${targetPolicy.maxLeafStacks} widget slots`;
  const splits =
    !["append", "tab", "swap"].includes(target.intent) ||
    (target.intent === "append" &&
      target.surface !== "dashboard" &&
      leaves > 0 &&
      targetRoot(layout, target)?.kind !== "stack" &&
      !target.nodeId);
  if (splits && !targetPolicy.split) return `${target.surface} cannot split`;
  if (splits && leaves >= targetPolicy.maxLeafStacks && !freesLeaf)
    return `${target.surface} allows at most ${targetPolicy.maxLeafStacks} stacks`;
  if (target.nodeId && panelSurface(layout, panel.id)) {
    let remains = false;
    visitNode(without(targetRoot(layout, target), panel.id), (node) => {
      if (node.id === target.nodeId) remains = true;
    });
    if (!remains) return "Cannot drop onto the panel being moved";
  }
  return null;
}

/** Atomic validated command; rejection returns the original layout reference. */
function reduceDockCommand(
  layout: DockLayout,
  command: Exclude<Command, { type: "batch" | "resizeRow" | "resizeDashboard" | "setWidgetTarget" | "configureListItem" | "configureDataView" | "configureActionButton" | 'configureProgram' }>,
  policy: DockPolicy = DEFAULT_DOCK_POLICY,
): Result {
  if (command.type === "setRootWidget") {
    if (!["app-shell", "desktop-shell"].includes(command.widget)) return { ok: false, layout, reason: "Choose a shell definition" };
    const parsed = widgetDefaultsSchema.safeParse(command.defaults ?? {});
    if (!parsed.success) return { ok: false, layout, reason: "Invalid shell defaults" };
    const id = layout.rootId ?? ROOT_ID;
    const prior = layout.panels[id];
    return { ok: true, layout: { ...layout, rootId: id, panels: { ...layout.panels, [id]: { ...prior, ...parsed.data, id, kind: "widget", widget: command.widget, definitionId: command.definitionId ?? `builtin:${command.widget}`, definitionSnapshot: command.definitionSnapshot, size: "standard", tags: ["widget"], chrome: "seamless" } } } };
  }
  if (command.type === "configureShell") {
    const root = layout.rootId && layout.panels[layout.rootId];
    if (!root || root.kind !== "widget" || (command.background !== "" && !/^#[0-9a-fA-F]{6}$/.test(command.background))) return { ok: false, layout, reason: "Choose a six-digit background color" };
    return { ok: true, layout: { ...layout, panels: { ...layout.panels, [root.id]: { ...root, background: command.background || undefined } } } };
  }
  if (command.type === "windowVisibility") {
    const position = layout.floating[command.panelId];
    if (!position || typeof command.hidden !== "boolean") return { ok: false, layout, reason: "Choose a floating window" };
    return { ok: true, layout: { ...layout, floating: { ...layout.floating, [command.panelId]: { ...position, hidden: command.hidden } } } };
  }
  if ("panelId" in command && command.panelId === layout.rootId && !["configurePanel", "setWidgetDefinition"].includes(command.type)) return { ok: false, layout, reason: "The root shell cannot be moved or removed" };
  if (command.type === "setLayoutArrangement") {
    const owner = layout.panels[command.panelId], root = layout.containers[command.panelId];
    if (!isLayoutPanel(owner) || !root || !["rows", "split"].includes(command.arrangement)) return { ok: false, layout, reason: "Choose a Layout widget" };
    let node: Node = root;
    if (command.arrangement === "rows" && root.kind !== "grid") node = { kind: "grid", id: uid("rows"), cells: [{ id: uid("row"), node: root }] };
    if (command.arrangement === "split" && root.kind === "grid") node = root.cells.length ? root.cells.map(cell => cell.node).reduce((first, second) => ({ kind: "split", id: uid("split"), axis: "vertical", ratio: 0.5, first, second })) : emptySlot();
    return { ok: true, layout: { ...layout, containers: { ...layout.containers, [owner.id]: node } } };
  }
  if (command.type === "setWidgetDefinition") {
    const panel = layout.panels[command.panelId];
    if (panel?.kind !== "widget" || panel.widget !== command.widget) return { ok: false, layout, reason: "State migration requires the same widget renderer" };
    const defaults = widgetDefaultsSchema.safeParse(command.defaults ?? {});
    if (!defaults.success || ((defaults.data.stackMode || defaults.data.childWidget) && !isLayoutPanel(panel))) return { ok: false, layout, reason: "Invalid definition defaults" };
    const current = instanceDefaults(panel, panel.definitionSnapshot?.recipe.defaults);
    const next = command.reconciliation === "reset" ? defaults.data : reconcileDefinitionDefaults(panel.definitionSnapshot?.recipe.defaults ?? {}, current, defaults.data);
    const retained = { ...panel };
    for (const key of Object.keys(widgetDefaultsSchema.shape)) delete (retained as unknown as Record<string, unknown>)[key];
    return { ok: true, layout: { ...layout, panels: { ...layout.panels, [panel.id]: { ...retained, ...next, definitionId: command.definitionId, definitionSnapshot: command.definitionSnapshot } } } };
  }
  const reject = (reason: string): Result => ({ ok: false, layout, reason });
  if (command.type === "setEditor" || command.type === "configureIde") {
    const owner = layout.panels[command.panelId];
    if (command.type === "setEditor" ? owner?.kind !== "asset" : owner?.kind !== "widget" || owner.widget !== "ide") return reject("Choose a compatible source editor");
    const removed = new Set(descendants(layout, owner.id));
    const nextOwner = { ...owner };
    if (command.type === "setEditor" && nextOwner.kind === "asset") nextOwner.definitionId = command.definitionId;
    if (command.type === "configureIde") nextOwner.sourceAssetId = command.assetId ?? undefined;
    return {
      ok: true,
      layout: {
        ...layout,
        panels: {
          ...Object.fromEntries(
            Object.entries(layout.panels).filter(([id]) => !removed.has(id)),
          ),
          [owner.id]: nextOwner,
        },
        containers: Object.fromEntries(
          Object.entries(layout.containers).filter(([id]) => id !== owner.id && !removed.has(id)),
        ),
        floating: Object.fromEntries(Object.entries(layout.floating).filter(([id]) => !removed.has(id))),
        maximized: removed.has(layout.maximized ?? "") ? null : layout.maximized,
      },
    };
  }
  if (command.type === "compose") {
    if (!layout.panels[command.ownerId] || layout.containers[command.ownerId])
      return reject("Owner missing or already composed");
    if (
      command.panels.length > 32 ||
      command.panels.some(
        (panel) => layout.panels[panel.id] || panel.ownerId !== command.ownerId,
      )
    )
      return reject("Invalid owned widgets");
    return {
      ok: true,
      layout: {
        ...layout,
        panels: {
          ...layout.panels,
          ...Object.fromEntries(
            command.panels.map((panel) => [panel.id, panel]),
          ),
        },
        containers: { ...layout.containers, [command.ownerId]: command.root },
      },
    };
  }
  if (command.type === "splitSlot") {
    const node = findNode(layout, command.nodeId);
    if (!node || node.kind !== "stack") return reject("Choose a slot to split");
    const slotTarget = node.tabs[0]
      ? panelSlot(layout, node.tabs[0])?.target
      : rootLocation(layout, node.id);
    if (
      !slotTarget ||
      (!policy[slotTarget.surface].split && !slotTarget.ownerId)
    )
      return reject("This surface cannot split");
    const root = targetRoot(layout, slotTarget);
    if (
      leafStacks(root) >=
      (slotTarget.ownerId ? policy.dashboard : policy[slotTarget.surface])
        .maxLeafStacks
    )
      return reject("Slot limit reached");
    return {
      ok: true,
      layout: mapRoots(layout, (root) =>
        rewrite(root, (item) =>
          item.id === node.id
            ? {
                kind: "split",
                id: uid("split"),
                axis: command.axis,
                ratio: 0.5,
                first: { ...node, keepEmpty: true },
                second: emptySlot(),
              }
            : item,
        ),
      ),
    };
  }
  if (command.type === "addSlot") {
    const target: Target = {
      surface: command.surface,
      ownerId: command.ownerId,
      intent: "append",
    };
    const root = targetRoot(layout, target);
    if (
      (command.ownerId && !root) ||
      leafStacks(root) >=
        (command.ownerId ? policy.dashboard : policy[command.surface])
          .maxLeafStacks
    )
      return reject("Container missing or slot limit reached");
    const node: Node = !root
      ? {
          kind: "grid",
          id: uid("grid"),
          cells: [{ id: uid("cell"), node: emptySlot() }],
        }
      : root.kind === "grid"
        ? {
            ...root,
            cells: [...root.cells, { id: uid("cell"), node: emptySlot() }],
          }
        : command.surface === "sidebar" && !command.ownerId
          ? { kind: "grid", id: uid("grid"), cells: [{ id: uid("cell"), node: root }, { id: uid("cell"), node: emptySlot() }] }
          : { kind: "split", id: uid("split"), axis: "horizontal", ratio: 0.5, first: root, second: emptySlot() };
    return { ok: true, layout: setTargetRoot(layout, target, node) };
  }
  if (command.type === "closeAndRemoveSlot") {
    const slot = panelSlot(layout, command.panelId);
    if (!slot || slot.node.tabs.length !== 1)
      return reject(
        "Remove instance only: its slot is floating or contains other tabs",
      );
    const closed = reduceDockCommand(
      layout,
      { type: "close", panelId: command.panelId },
      policy,
    );
    if (!closed.ok) return reject(closed.reason);
    if (!findNode(closed.layout, slot.node.id)) return closed;
    const removed = reduceDockCommand(
      closed.layout,
      { type: "removeSlot", nodeId: slot.node.id },
      policy,
    );
    return removed.ok ? removed : reject(removed.reason);
  }
  if (command.type === "configureSlot") {
    if (typeof command.autoClose !== "boolean") return reject("Invalid empty slot behavior");
    const node = findNode(layout, command.nodeId);
    if (node?.kind !== "stack") return reject("Choose a slot");
    return { ok: true, layout: mapRoots(layout, root => rewrite(root, item => item.id === node.id ? { ...node, autoClose: command.autoClose, keepEmpty: true } : item)) };
  }
  if (command.type === "removeSlot") {
    const node = findNode(layout, command.nodeId);
    if (node?.kind !== "stack") return reject("Choose a slot");
    if (node.tabs.length)
      return reject("Move or remove the children before removing this slot");
    const prune = (root: Node | null): Node | null =>
      !root || root.id === node.id
        ? null
        : root.kind === "stack"
          ? root
          : root.kind === "grid"
            ? {
                ...root,
                cells: root.cells
                  .map((cell) => ({ ...cell, node: prune(cell.node) }))
                  .filter(
                    (cell): cell is { id: string; node: Node } => !!cell.node,
                  ),
              }
            : (() => {
                const first = prune(root.first),
                  second = prune(root.second);
                return first && second
                  ? { ...root, first, second }
                  : (first ?? second);
              })();
    return { ok: true, layout: mapRoots(layout, prune) };
  }
  if (command.type === "visibility")
    return ["dashboard", "toolbar"].includes(command.surface)
      ? reject(command.surface === "toolbar" ? "The toolbar cannot be hidden" : "Dashboard is part of Overview")
      : {
          ok: true,
          layout: {
            ...layout,
            hidden: { ...layout.hidden, [command.surface]: command.hidden },
          },
        };
  if (command.type === "sidebarSide")
    return { ok: true, layout: { ...layout, sidebarSide: command.side } };
  if (command.type === "resizeFloat") {
    const item = layout.floating[command.panelId];
    if (!item || !Number.isFinite(command.width) || !Number.isFinite(command.height)) return reject("Invalid floating panel size");
    const width = Math.max(220, Math.min(4096, command.width));
    const panel = layout.panels[command.panelId];
    const minHeight = panel?.kind === "widget" ? WIDGET_PLACEMENT[panel.widget].window?.minHeight ?? 160 : 160;
    const height = Math.max(minHeight, Math.min(4096, command.height));
    if (item.width === width && item.height === height) return { ok: true, layout };
    return { ok: true, layout: { ...layout, floating: { ...layout.floating, [command.panelId]: { ...item, width, height } } } };
  }
  if (command.type === "moveFloat") {
    const item = layout.floating[command.panelId];
    if (!item || !Number.isFinite(command.x) || !Number.isFinite(command.y))
      return reject("Floating panel does not exist");
    if (item.x === Math.max(0, command.x) && item.y === Math.max(0, command.y))
      return { ok: true, layout };
    return {
      ok: true,
      layout: {
        ...layout,
        floating: {
          ...layout.floating,
          [command.panelId]: {
            ...item,
            x: Math.max(0, command.x),
            y: Math.max(0, command.y),
          },
        },
      },
    };
  }
  if (command.type === "peekVisibility") {
    const item = layout.floating[command.panelId];
    if (!item || item.presentation !== "peek") return reject("Panel is not in a side peek");
    return { ok: true, layout: { ...layout, floating: { ...layout.floating, [command.panelId]: { ...item, hidden: command.hidden } } } };
  }
  if (command.type === "presentPanel") {
    if (!["window", "peek"].includes(command.mode) || command.edge && !["top", "bottom", "left", "right"].includes(command.edge)) return reject("Invalid panel presentation");
    const result = layout.floating[command.panelId] ? { ok: true as const, layout } : reduceDock(layout, { type: "float", panelId: command.panelId }, policy);
    if (!result.ok) return result;
    return { ok: true, panelId: command.panelId, layout: { ...result.layout, floating: { ...result.layout.floating, [command.panelId]: { ...result.layout.floating[command.panelId], presentation: command.mode, edge: command.mode === "peek" ? command.edge ?? "right" : undefined, hidden: false } } } };
  }
  if (command.type === "float") {
    const panel = layout.panels[command.panelId];
    const from = hostSurface(layout, command.panelId);
    if (
      !panel ||
      panel.ownerId ||
      !from ||
      ["home", "browser", "navigation"].includes(panel.kind) ||
      (panel.kind === "widget" && !WIDGET_PLACEMENT[panel.widget].floating)
    )
      return reject("This panel cannot float");
    return {
      ok: true,
      layout: {
        ...mapRoots(layout, (root) => without(root, panel.id)),
        floating: {
          ...layout.floating,
          [panel.id]: {
            x: Math.max(0, command.x ?? 80),
            y: Math.max(0, command.y ?? 80),
            width: panel.kind === "widget" ? WIDGET_PLACEMENT[panel.widget].window?.width ?? (panel.widget === "docking-inspector" ? 340 : 420) : 420,
            height: panel.kind === "widget" ? WIDGET_PLACEMENT[panel.widget].window?.height ?? (panel.widget === "docking-inspector" ? 640 : 360) : 360,
            returnTo: from,
          },
        },
      },
      panelId: panel.id,
    };
  }
  if (command.type === "dockFloat") {
    const floated = layout.floating[command.panelId];
    const panel = layout.panels[command.panelId];
    if (!floated || !panel) return reject("Floating panel does not exist");
    const target = command.target ?? {
      surface: floated.returnTo,
      intent: "append",
    };
    const reason = dropReason(layout, panel, target, policy);
    if (reason) return reject(reason);
    return reduceDock(
      layout,
      { type: "move", panelId: panel.id, target },
      policy,
    );
  }
  if (command.type === "browserView")
    return {
      ok: true,
      layout: {
        ...layout,
        browserView: command.view === "list" ? "list" : "grid",
      },
    };
  if (command.type === "resizeSidebar")
    return Number.isFinite(command.width)
      ? {
          ok: true,
          layout: {
            ...layout,
            sidebarWidth: Math.round(
              Math.max(220, Math.min(520, command.width)),
            ),
          },
        }
      : reject("Invalid sidebar width");
  if (command.type === "resizeBottom")
    return Number.isFinite(command.size)
      ? {
          ok: true,
          layout: {
            ...layout,
            bottomSize: Math.max(24, Math.min(60, command.size)),
          },
        }
      : reject("Invalid bottom size");
  if (command.type === "configureBrowser") {
    const panel = layout.panels[command.panelId];
    if (panel?.kind !== "widget" || !["web-browser", "browser-tab"].includes(panel.widget)) return reject("Unknown browser widget.");
    try {
      const browser = browserConfiguration(command.config);
      if (panel.widget === "browser-tab" && browser.tabs.length !== 1) return reject("A browser-tab widget owns one page");
      return { ok: true, layout: { ...layout, panels: { ...layout.panels, [panel.id]: { ...panel, browser } } } };
    } catch { return reject("Invalid browser configuration."); }
  }
  if (command.type === "resizeWidget") {
    const panel = layout.panels[command.panelId];
    if (
      panel?.kind !== "widget" ||
      !["compact", "standard", "wide"].includes(command.size)
    )
      return reject("Invalid widget size");
    return {
      ok: true,
      layout: {
        ...layout,
        panels: {
          ...layout.panels,
          [panel.id]: { ...panel, size: command.size },
        },
      },
    };
  }
  if (command.type === "configureNote") {
    const panel = layout.panels[command.panelId];
    if (panel?.kind !== "widget" || panel.widget !== "note") return reject("Choose a Notes widget");
    if (command.value && !noteValueSchema.safeParse(command.value).success) return reject("Invalid note source");
    if (command.sourceAssetId !== undefined && command.sourceAssetId !== null && (typeof command.sourceAssetId !== "string" || command.sourceAssetId.length > 200)) return reject("Invalid note reference");
    return { ok: true, layout: { ...layout, panels: { ...layout.panels, [panel.id]: { ...panel, note: command.value ?? panel.note, sourceAssetId: command.sourceAssetId === null ? undefined : command.sourceAssetId ?? panel.sourceAssetId } } } };
  }
  if (command.type === "configurePanel" || command.type === "configureWidget") {
    if (command.displayName !== undefined && (typeof command.displayName !== "string" || command.displayName.trim().length > 120))
      return reject("Display name must be at most 120 characters");
    if (command.flippable !== undefined && typeof command.flippable !== "boolean") return reject("Invalid flip behavior");
    if (command.hideDisplayName !== undefined && typeof command.hideDisplayName !== "boolean")
      return reject("Invalid display name visibility");
    if (command.chrome !== undefined && !["default", "compact", "seamless"].includes(command.chrome))
      return reject("Invalid widget chrome");
    if (command.type === "configurePanel" && command.contentSizing !== undefined && !["fill", "scroll", "clip"].includes(command.contentSizing)) return reject("Invalid content sizing");
    if (command.type === "configurePanel") {
      const panel = layout.panels[command.panelId];
      if (!panel || ["home", "browser", "navigation"].includes(panel.kind)) return reject("Choose a user widget");
      return { ok: true, layout: { ...layout, panels: { ...layout.panels, [panel.id]: {
        ...panel,
        contentSizing: command.contentSizing ?? panel.contentSizing,
        displayName: command.displayName === undefined ? panel.displayName : command.displayName.trim() || undefined,
        hideDisplayName: command.hideDisplayName ?? panel.hideDisplayName,
        flippable: command.flippable ?? panel.flippable,
        chrome: command.chrome ?? panel.chrome,
      } } } };
    }
  }
  if (command.type === "configureWidget") {
    const panel = layout.panels[command.panelId];
    if (panel?.kind !== "widget") return reject("Unknown widget instance");
    if (
      command.tone &&
      !["blue", "violet", "coral", "mint", "slate"].includes(command.tone)
    )
      return reject("Invalid widget color");
    if (command.childWidget !== undefined && (!isLayoutPanel(panel) || (command.childWidget !== null && !isWidget(command.childWidget)))) return reject("Invalid default child widget");
    if (
      command.stackMode &&
      (!["carousel", "tabs", "sidebar"].includes(command.stackMode) ||
        !isLayoutPanel(panel))
    )
      return reject("Invalid stack mode");
    return {
      ok: true,
      layout: {
        ...layout,
        panels: {
          ...layout.panels,
          [panel.id]: {
            ...panel,
            displayName: command.displayName === undefined ? panel.displayName : command.displayName.trim() || undefined,
            chrome: command.chrome ?? panel.chrome,
            childWidget: command.childWidget === null ? undefined : command.childWidget ?? panel.childWidget,
            hideDisplayName: command.hideDisplayName ?? panel.hideDisplayName,
            flippable: command.flippable ?? panel.flippable,
            tone: command.tone ?? panel.tone,
            stackMode: command.stackMode ?? panel.stackMode,
          },
        },
      },
    };
  }
  if (command.type === "maximize")
    return command.panelId === null || panelSurface(layout, command.panelId)
      ? { ok: true, layout: { ...layout, maximized: command.panelId } }
      : reject("Panel is not placed");
  if (command.type === "resizeSplit") {
    if (
      !Number.isFinite(command.ratio) ||
      findNode(layout, command.nodeId)?.kind !== "split"
    )
      return reject("Split does not exist");
    return {
      ok: true,
      layout: mapRoots(layout, (root) =>
        rewrite(root, (node) =>
          node.kind === "split" && node.id === command.nodeId
            ? {
                ...node,
                ratio:
                  Math.round(
                    Math.max(0.2, Math.min(0.8, command.ratio)) * 10000,
                  ) / 10000,
              }
            : node,
        ),
      ),
    };
  }
  if (command.type === "activate") {
    if (layout.floating[command.panelId]) return {
      ok: true, panelId: command.panelId,
      layout: { ...layout, floating: { ...layout.floating, [command.panelId]: { ...layout.floating[command.panelId], hidden: false } } },
    };
    if (
      !panelSlot(layout, command.panelId) &&
      !layout.floating[command.panelId]
    )
      return reject("Panel is not placed");
    return {
      ok: true,
      layout: mapRoots(layout, (root) =>
        rewrite(root, (node) =>
          node.kind === "stack" && node.tabs.includes(command.panelId)
            ? { ...node, active: command.panelId }
            : node,
        ),
      ),
    };
  }
  if (command.type === "close") {
    const panel = layout.panels[command.panelId];
    if (
      !panel ||
      panel.kind === "home" ||
      panel.kind === "browser" ||
      panel.kind === "navigation"
    )
      return reject("This panel cannot be closed");
    if (
      layout.containers[panel.id] &&
      !isLayoutPanel(panel)
    ) {
      const removed = new Set([panel.id, ...descendants(layout, panel.id)]);
      return {
        ok: true,
        layout: {
          ...mapRoots(layout, (root) => without(root, panel.id)),
          panels: Object.fromEntries(
            Object.entries(layout.panels).filter(([id]) => !removed.has(id)),
          ),
          containers: Object.fromEntries(
            Object.entries(layout.containers).filter(
              ([id]) => !removed.has(id),
            ),
          ),
          floating: Object.fromEntries(
            Object.entries(layout.floating).filter(([id]) => !removed.has(id)),
          ),
          maximized: removed.has(layout.maximized ?? "")
            ? null
            : layout.maximized,
        },
      };
    }
    const panels = { ...layout.panels };
    delete panels[command.panelId];
    let next = mapRoots(layout, (root) => without(root, command.panelId));
    const children: string[] = [];
    visitNode(layout.containers[command.panelId] ?? null, (node) => {
      if (node.kind === "stack") children.push(...node.tabs);
    });
    const containers = { ...next.containers };
    delete containers[command.panelId];
    next = { ...next, containers };
    for (const id of children)
      next = setTargetRoot(
        next,
        { surface: "dashboard", intent: "append" },
        insert(next.surfaces.dashboard, id, {
          surface: "dashboard",
          intent: "append",
        }),
      );
    const floating = { ...layout.floating };
    delete floating[command.panelId];
    return {
      ok: true,
      layout: {
        ...next,
        panels,
        floating,
        maximized:
          layout.maximized === command.panelId ? null : layout.maximized,
      },
    };
  }
  let panel: Panel, target: Target;
  if (command.type === "createEditorPart") {
    const owner = layout.panels[command.ownerId];
    if (!owner || !("assetId" in owner) || owner.assetId !== command.assetId)
      return reject("Editor panes must use their owner's opened asset");
    panel = {
      id: uid("editor-part"),
      kind: "editor-part",
      ownerId: command.ownerId,
      assetId: command.assetId,
      part: command.part,
      slotId: command.slotId,
      definitionId: `station:editor/${command.part}`,
      tags: ["widget"],
    };
    target = command.target;
  } else if (command.type === "createCommandOutput") {
    panel = {
      id: uid("command-output"),
      kind: "command-output",
      definitionId: command.definitionId,
      tags: ["widget", "view"],
    };
    target = command.target;
  } else if (command.type === "createContribution") {
    const id = command.id ?? uid("contribution");
    if (layout.panels[id]) return reject("Panel ID already exists");
    panel = {
      id,
      kind: "contribution",
      definitionId: command.definitionId,
      assetId: command.assetId,
      ownerId: command.ownerId,
      slotId: command.slotId,
      tags: ["widget", "view"],
    };
    target = command.target;
  } else if (command.type === "createWebWidget") {
    if (!command.assetId) return reject("Web asset ID is required");
    const id = command.id ?? uid("web-widget");
    if (layout.panels[id]) return reject("Panel ID already exists");
    panel = {
      id,
      kind: "web-widget",
      assetId: command.assetId,
      tags: ["widget"],
    };
    target = command.target ?? { surface: "dashboard", intent: "append" };
  } else if (command.type === "createAssetView") {
    if (!command.assetId) return reject("Asset ID is required");
    const id = command.id ?? uid("asset-view");
    if (layout.panels[id]) return reject("Panel ID already exists");
    panel = { id, kind: "asset", assetId: command.assetId, tags: ["view"] };
    target = command.target;
  } else if (command.type === "createWidget") {
    if (!isWidget(command.widget)) return reject("Unknown widget");
    const defaults = widgetDefaultsSchema.safeParse(command.defaults ?? {});
    if (!defaults.success || ((defaults.data.stackMode || defaults.data.childWidget) && !["stack", "web-browser", "main-surface"].includes(command.widget))) return reject("Invalid definition defaults");
    if (command.chrome !== undefined && !["default", "compact", "seamless"].includes(command.chrome)) return reject("Invalid widget chrome");
    if (command.childWidget !== undefined && (!isWidget(command.childWidget) || !["stack", "web-browser", "main-surface"].includes(command.widget))) return reject("Invalid default child widget");
    const id = command.id ?? uid("widget");
    if (layout.panels[id]) return reject("Panel ID already exists");
    panel = {
      id,
      kind: "widget",
      ...defaults.data,
      definitionId: command.definitionId,
      definitionSnapshot: command.definitionSnapshot,
      widget: command.widget,
      instanceShell: command.widget === "app-shell" || undefined,
      chrome: command.chrome ?? defaults.data.chrome,
      childWidget: command.childWidget ?? defaults.data.childWidget ?? (command.widget === "web-browser" ? "browser-tab" : undefined),
      browser: command.widget === "browser-tab" ? defaultBrowserConfiguration() : undefined,
      size: "standard",
      tags: ["widget"],
    };
    target = command.target;
  } else if (command.type === "openAsset") {
    if (!command.assetId) return reject("Asset ID is required");
    const id = `asset-view:${command.assetId}`;
    panel = layout.panels[id] ?? {
      id,
      kind: "asset",
      assetId: command.assetId,
      tags: ["view"],
    };
    if (!command.target && panelSurface(layout, id))
      return reduceDock(layout, { type: "activate", panelId: id });
    let firstMainStack: Stack | null = null;
    visitNode(layout.surfaces.main, (node) => {
      if (!firstMainStack && node.kind === "stack") firstMainStack = node;
    });
    target = command.target ?? {
      surface: "main",
      intent: "tab",
      nodeId: (firstMainStack as Stack | null)?.id,
    };
  } else {
    panel = layout.panels[command.panelId];
    if (!panel || (!panelSlot(layout, panel.id) && !layout.floating[panel.id]))
      return reject("Panel is not placed");
    target = command.target;
  }
  const reason = dropReason(layout, panel, target, policy);
  if (reason) return reject(reason);
  if (target.intent === "swap") {
    const destination = findNode(layout, target.nodeId!) as Stack;
    const other = destination.tabs[0];
    return {
      ok: true,
      layout: mapRoots(layout, (root) =>
        rewrite(root, (node) =>
          node.kind === "stack"
            ? {
                ...node,
                tabs: node.tabs.map((id) =>
                  id === panel.id ? other : id === other ? panel.id : id,
                ),
                active:
                  node.active === panel.id
                    ? other
                    : node.active === other
                      ? panel.id
                      : node.active,
              }
            : node,
        ),
      ),
      panelId: panel.id,
    };
  }
  // Tab indices describe the visible stack before removal. Moving right within
  // that stack shifts the insertion boundary left once the source is removed.
  if (
    command.type === "move" &&
    target.intent === "tab" &&
    target.nodeId &&
    target.index !== undefined
  ) {
    const destination = findNode(layout, target.nodeId);
    if (destination?.kind === "stack") {
      const sourceIndex = destination.tabs.indexOf(panel.id);
      if (sourceIndex >= 0) {
        const boundary = Math.max(
          0,
          Math.min(destination.tabs.length, target.index),
        );
        const index = boundary - (sourceIndex < boundary ? 1 : 0);
        if (index === sourceIndex)
          return { ok: true, layout, panelId: panel.id };
        target = { ...target, index };
      }
    }
  }
  let next = mapRoots(layout, (root) => without(root, panel.id));
  if (target.nodeId) {
    let exists = false;
    visitNode(targetRoot(next, target), (node) => {
      if (node.id === target.nodeId) exists = true;
    });
    if (!exists) return reject("Cannot drop onto the panel being moved");
  }
  next = setTargetRoot(
    next,
    target,
    insert(targetRoot(next, target), panel.id, target),
  );
  const floating = { ...next.floating };
  delete floating[panel.id];
  const containers = { ...next.containers };
  if (isLayoutPanel(panel) && !containers[panel.id]) containers[panel.id] = panel.widget === "main-surface"
    ? { kind: "grid", id: uid("rows"), cells: [] }
    : emptySlot();
  next = {
    ...next,
    panels: { ...layout.panels, [panel.id]: panel },
    floating,
    containers,
  };
  if (command.type === "createWidget" && panel.kind === "widget" && panel.widget === "web-browser") {
    const childId = uid("browser-tab");
    next.panels[childId] = { id: childId, kind: "widget", widget: "browser-tab", size: "standard", chrome: "seamless", browser: defaultBrowserConfiguration(), tags: ["widget"] };
    next.containers[panel.id] = { ...stack(childId), keepEmpty: true };
  }
  return panelSlot(next, panel.id)
    ? { ok: true, layout: next, panelId: panel.id }
    : reject("Insertion failed");
}

/** Validate the complete ownership graph, not only the destination of a move. */
export function validateDock(
  layout: DockLayout,
  policy: DockPolicy = DEFAULT_DOCK_POLICY,
): string | null {
  const seen = new Set<string>(),
    nodes = new Set<string>(),
    owners = new Set<string>();
  let reason: string | null = null;
  const instance = (
    id: string,
    surface: Surface,
    ownerId?: string,
    depth = 0,
  ) => {
    if (reason) return;
    const panel = layout.panels[id];
    if (!panel || seen.has(id)) {
      reason = "Each widget instance must have exactly one placement";
      return;
    }
    if (ownerId && ["home", "navigation"].includes(panel.kind)) {
      reason = "Required host widgets cannot enter a Layout";
      return;
    }
    reason = placementReason(
      panel,
      { surface, ownerId, intent: "tab" },
      policy,
    );
    if (reason) return;
    if (
      ownerId &&
      !(
        isLayoutPanel(layout.panels[ownerId]) || isNavigationPanel(layout.panels[ownerId])
      ) &&
      panel.ownerId !== ownerId
    ) {
      reason = "Composition ownership mismatch";
      return;
    }
    seen.add(id);
    if (
      layout.containers[id] ||
      isLayoutPanel(panel)
    ) {
      if (!layout.containers[id]) {
        reason = "Layout is missing its owned subtree";
        return;
      }
      owners.add(id);
      tree(layout.containers[id], surface, id, depth + 1);
    }
  };
  const tree = (
    node: Node | null,
    surface: Surface,
    ownerId?: string,
    depth = 0,
  ) => {
    if (!node || reason) return;
    if (depth > 32 || nodes.has(node.id)) {
      reason = "Layout contains a cycle, duplicate node, or excessive nesting";
      return;
    }
    nodes.add(node.id);
    if (node.kind === "stack") {
      if (
        node.allowedDefinitions &&
        node.tabs.some(
          (id) =>
            !node.allowedDefinitions!.includes(
              layout.panels[id]?.definitionId ?? "",
            ),
        )
      ) {
        reason = "Definition not allowed in this slot";
        return;
      }
      if (
        (node.tabs.length && !node.tabs.includes(node.active)) ||
        (!node.tabs.length && node.active !== "")
      ) {
        reason = "Active tab must belong to its slot";
        return;
      }
      node.tabs.forEach((id) => instance(id, surface, ownerId, depth));
    } else if (node.kind === "split") {
      if (
        !Number.isFinite(node.ratio) ||
        node.ratio < 0.2 ||
        node.ratio > 0.8
      ) {
        reason = "Split geometry exceeds its minimum sizes";
        return;
      }
      tree(node.first, surface, ownerId, depth + 1);
      tree(node.second, surface, ownerId, depth + 1);
    } else
      node.cells.forEach((cell) =>
        tree(cell.node, surface, ownerId, depth + 1),
      );
  };
  if (layout.rootId) {
    const root = layout.panels[layout.rootId];
    if (root?.kind !== "widget" || !["app-shell", "desktop-shell"].includes(root.widget)) reason = "Invalid root shell widget";
    else seen.add(root.id);
  }
  if (layout.surfaces.toolbar?.kind !== "stack") reason ??= "Toolbar requires one ordered slot";
  for (const surface of SURFACES) {
    tree(layout.surfaces[surface], surface);
    if (leafStacks(layout.surfaces[surface]) > policy[surface].maxLeafStacks)
      reason ??= "Surface slot limit exceeded";
  }
  for (const [id, position] of Object.entries(layout.floating))
    instance(id, position.returnTo);
  if (seen.size !== Object.keys(layout.panels).length)
    reason ??= "Widget instance has no placement";
  if (Object.keys(layout.containers).some((id) => !owners.has(id)))
    reason ??= "Owned subtree has no Layout widget";
  if (
    Object.values(layout.containers).some(
      (node) => leafStacks(node) > policy.dashboard.maxLeafStacks,
    )
  )
    reason ??= "Layout child slot limit exceeded";
  for (const id of [HOME_ID, NAVIGATION_ID, BROWSER_ID])
    if (!seen.has(id)) reason ??= "Required host widget missing";
  return reason;
}

/** All structural results pass the same whole-document invariants before commit. */
export function reduceDock(
  layout: DockLayout,
  input: Command,
  policy: DockPolicy = DEFAULT_DOCK_POLICY,
): Result {
  const command = input.type === "createWidget" && input.widget === "app-shell" && !input.slots ? { ...input, slots: APP_SHELL_SEEDS } : input;
  if (command.type === "batch") {
    // Validate each step so policy never observes an invalid intermediate graph.
    let next = layout;
    for (const action of command.commands) {
      if (!["configurePanel", "configureWidget", "close", "closeAndRemoveSlot", "move", "float", "dockFloat", "resizeWidget", "presentPanel", "peekVisibility", "addSlot", "visibility"].includes(action.type)) return { ok: false, layout, reason: "Batches accept widget appearance, placement and removal commands only" };
      const result = reduceDock(next, action, policy);
      if (!result.ok) return { ...result, layout };
      next = result.layout;
    }
    return { ok: true, layout: next };
  }
  if(command.type==='configureProgram'){const panel=layout.panels[command.panelId];if(panel?.kind!=='widget'||panel.widget!=='program'||typeof command.compact!=='boolean')return {ok:false,layout,reason:'Choose a program widget'};if(!command.compact&&panelSurface(layout,panel.id)==='toolbar')return {ok:false,layout,reason:'Move this widget out of the toolbar before removing compact presentation'};return {ok:true,layout:{...layout,panels:{...layout.panels,[panel.id]:{...panel,programCompact:command.compact}}}};}
  if (command.type === "configureDataView" || command.type === "configureActionButton") {
    const panel = layout.panels[command.panelId];
    const expected = command.type === "configureDataView" ? "data-view" : "action-button";
    if (panel?.kind !== "widget" || panel.widget !== expected) return { ok: false, layout, reason: "Choose a compatible widget instance" };
    const parsed = command.type === "configureDataView" ? viewConfigurationSchema.safeParse(command.config) : actionButtonSchema.safeParse(command.config);
    if (!parsed.success) return { ok: false, layout, reason: "Invalid widget configuration" };
    return { ok: true, layout: { ...layout, panels: { ...layout.panels, [panel.id]: { ...panel, [command.type === "configureDataView" ? "dataView" : "actionButton"]: parsed.data } } } };
  }
  if (command.type === "configureListItem") {
    const panel = layout.panels[command.panelId], owner = panelSlot(layout, command.panelId)?.target.ownerId;
    if (!panel || !owner || layout.panels[owner]?.kind !== "widget" || layout.panels[owner].widget !== "widget-list" || !["inline", "tab"].includes(command.mode)) return { ok: false, layout, reason: "Choose an entry in a Widget list" };
    return { ok: true, layout: { ...layout, panels: { ...layout.panels, [panel.id]: { ...panel, listMode: command.mode } } } };
  }
  if (command.type === "setWidgetTarget") {
    const panel = layout.panels[command.panelId];
    if (!panel || !((panel.kind === "widget" && ["navigation", "widget-list"].includes(panel.widget)) || panel.kind === "navigation")) return { ok: false, layout, reason: "Choose a navigation widget" };
    if (command.reference && (!slotReferenceSchema.safeParse(command.reference).success || !resolveSlotReference(layout, command.reference))) return { ok: false, layout, reason: "Target slot is missing or incompatible" };
    return { ok: true, layout: { ...layout, panels: { ...layout.panels, [panel.id]: { ...panel, targetRef: command.reference ?? undefined } } } };
  }
  if (command.type === "resizeDashboard") {
    if (!Number.isFinite(command.percent) || command.percent < 40 || command.percent > 100) return { ok: false, layout, reason: "Dashboard width must be between 40 and 100 percent" };
    return { ok: true, layout: { ...layout, dashboardWidth: Math.round(command.percent) } };
  }
  if (command.type === "resizeRow") {
    let found = false;
    if (command.height !== undefined && (!Number.isFinite(command.height) || command.height < 160 || command.height > 1600)) return { ok: false, layout, reason: "Row height must be between 160 and 1600 pixels" };
    const next = mapRoots(layout, root => rewrite(root, node => node.kind !== "grid" ? node : { ...node, cells: node.cells.map(cell => {
      if (cell.id !== command.cellId) return cell;
      found = true;
      return { ...cell, height: command.height === undefined ? undefined : Math.round(command.height) };
    }) }));
    return found ? { ok: true, layout: next } : { ok: false, layout, reason: "Row not found" };
  }
  let result = reduceDockCommand(layout, command, policy);
  if (!result.ok) return result;
  if ((command.type === "createWidget" || command.type === "setRootWidget") && command.recipeTarget && !command.slots?.length) return { ok: false, layout, reason: "Definition target is unresolved; include its target Layout in the composition" };
  if ((command.type === "createWidget" || command.type === "setRootWidget") && command.slots?.length) {
    let count = 0;
    const keys = new Map<string, string>();
    const links: { panelId: string; key: string; slot?: number }[] = [];
    const register = (id: string, key?: string, target?: { key: string; slot?: number }) => {
      if (key) { if (keys.has(key)) throw new Error(`Duplicate definition key: ${key}`); keys.set(key, id); }
      if (target) links.push({ panelId: id, ...target });
    };
    const check = (slots: import("./widget-definitions").WidgetSeed[][], depth = 0): boolean => depth <= 12 && slots.length <= 32 && slots.every(slot => slot.length <= 32 && slot.every(seed => ++count <= 128 && (!seed.slots || check(seed.slots, depth + 1))));
    if (!check(command.slots)) return { ok: false, layout, reason: "Slot defaults exceed the nesting or widget limit" };
    try {
      register(result.panelId ?? result.layout.rootId!, command.recipeKey ?? "root", command.recipeTarget);
      const apply = (current: DockLayout, ownerId: string, slots: import("./widget-definitions").WidgetSeed[][]): Result => {
        if (!isLayoutPanel(current.panels[ownerId])) return { ok: false, layout, reason: "Slot defaults require a Layout widget" };
        const removed = descendants(current, ownerId), panels = { ...current.panels }, containers = { ...current.containers };
        for (const id of removed) { delete panels[id]; delete containers[id]; }
        const cells = slots.map(() => ({ id: uid("cell"), node: emptySlot() }));
        current = { ...current, panels, containers: { ...containers, [ownerId]: { kind: "grid", id: uid("grid"), cells } } };
        for (let i = 0; i < slots.length; i++) for (const seed of slots[i]) {
          const created = reduceDock(current, { type: "createWidget", widget: seed.widget, defaults: seed.defaults, target: { surface: hostSurface(current, ownerId) ?? "dashboard", ownerId, nodeId: cells[i].node.id, intent: "tab" } }, policy);
          if (!created.ok) return created;
          current = created.layout; register(created.panelId!, seed.key, seed.targetRef);
          if (seed.slots?.length) { const nested = apply(current, created.panelId!, seed.slots); if (!nested.ok) return nested; current = nested.layout; }
        }
        // A nested app shell uses the same graph with side-by-side named slots.
        const ownedRoot = current.containers[ownerId];
        if (current.panels[ownerId].kind === "widget" && current.panels[ownerId].widget === "app-shell" && ownedRoot.kind === "grid" && ownedRoot.cells.length === 2) current = { ...current, containers: { ...current.containers, [ownerId]: { kind: "split", id: uid("split"), axis: "horizontal", ratio: 0.3, first: ownedRoot.cells[0].node, second: ownedRoot.cells[1].node } } };
        return { ok: true, layout: current };
      };
      let current = result.layout;
      if (command.type === "setRootWidget") {
        if (command.slots.length > 4) throw new Error("Shells have four named surfaces");
        for (const [i, slot] of command.slots.entries()) for (const seed of slot) {
          const surface = (["sidebar", "main", "bottom", "dashboard"] as const)[i];
          const child = reduceDock(current, { type: "createWidget", widget: seed.widget, defaults: seed.defaults, target: { surface, intent: surface === "dashboard" ? "append" : "tab" } }, policy);
          if (!child.ok) return { ...child, layout };
          current = child.layout; register(child.panelId!, seed.key, seed.targetRef);
          if (seed.slots?.length) { const nested = apply(current, child.panelId!, seed.slots); if (!nested.ok) return { ...nested, layout }; current = nested.layout; }
        }
      } else {
        const composed = apply(current, result.panelId!, command.slots);
        if (!composed.ok) return { ...composed, layout }; current = composed.layout;
      }
      for (const link of links) {
        const ownerId = keys.get(link.key); if (!ownerId) throw new Error(`Missing definition target: ${link.key}`);
        const slots: { node: Stack; surface: Surface }[] = [];
        if (ownerId === current.rootId) for (const surface of ["sidebar", "main", "bottom", "dashboard"] as const) visitNode(current.surfaces[surface], node => { if (node.kind === "stack") slots.push({ node, surface }); });
        else visitNode(current.containers[ownerId] ?? null, node => { if (node.kind === "stack") slots.push({ node, surface: hostSurface(current, ownerId) ?? "dashboard" }); });
        const slot = slots[link.slot ?? 0]; if (!slot) throw new Error(`Target has no compatible slot: ${link.key}`);
        const bound = reduceDock(current, { type: "setWidgetTarget", panelId: link.panelId, reference: { surface: slot.surface, nodeId: slot.node.id, ownerId: ownerId === current.rootId ? undefined : ownerId } }, policy);
        if (!bound.ok) return { ...bound, layout }; current = bound.layout;
      }
      if (command.definitionSnapshot) {
        const panels = { ...current.panels };
        for (const [id, panel] of Object.entries(panels)) if (!layout.panels[id] && id !== result.panelId) panels[id] = { ...panel, compositionOrigin: { assetId: command.definitionSnapshot.assetId, revision: command.definitionSnapshot.revision, key: [...keys].find(([, value]) => value === id)?.[0] } };
        current = { ...current, panels };
      }
      result = { ...result, layout: current };
    } catch (error) { return { ok: false, layout, reason: String(error) }; }
  }
  const reason = validateDock(result.layout, policy);
  return reason ? { ok: false, layout, reason } : result;
}

function rootLocation(layout: DockLayout, nodeId: string): Target | null {
  let result: Target | null = null;
  for (const surface of SURFACES)
    visitNode(layout.surfaces[surface], (node) => {
      if (node.id === nodeId) result = { surface, intent: "tab", nodeId };
    });
  for (const [ownerId, root] of Object.entries(layout.containers))
    visitNode(root, (node) => {
      if (node.id === nodeId)
        result = {
          surface: hostSurface(layout, ownerId) ?? "dashboard",
          ownerId,
          intent: "tab",
          nodeId,
        };
    });
  return result;
}

/** Rename persisted asset references without rewriting source, node IDs or configuration. */
function migrateAssetReferences(raw: Record<string, any>): Record<string, any> {
  const panelId = (id: string) =>
    id === "unit-browser"
      ? BROWSER_ID
      : id.startsWith("unit-view:")
        ? `asset-view:${id.slice(10)}`
        : id;
  const node = (value: any, depth = 0): any => {
    if (!value || typeof value !== "object" || depth > 32) return value;
    if (value.kind === "stack")
      return {
        ...value,
        tabs: Array.isArray(value.tabs)
          ? value.tabs.map((id: any) =>
              typeof id === "string" ? panelId(id) : id,
            )
          : value.tabs,
        active:
          typeof value.active === "string"
            ? panelId(value.active)
            : value.active,
      };
    if (value.kind === "split")
      return {
        ...value,
        first: node(value.first, depth + 1),
        second: node(value.second, depth + 1),
      };
    if (value.kind === "grid" && Array.isArray(value.cells))
      return {
        ...value,
        cells: value.cells.map((cell: any) => ({
          ...cell,
          node: node(cell.node, depth + 1),
        })),
      };
    return value;
  };
  const panels = Object.fromEntries(
    Object.entries(raw.panels ?? {}).map(([id, value]: [string, any]) => {
      if (!value || typeof value !== "object") return [panelId(id), value];
      const { unitId, ...rest } = value;
      return [
        panelId(id),
        {
          ...rest,
          id: typeof value.id === "string" ? panelId(value.id) : value.id,
          kind: value.kind === "unit" ? "asset" : value.kind,
          ...((value.assetId ?? unitId) !== undefined
            ? { assetId: value.assetId ?? unitId }
            : {}),
        },
      ];
    }),
  );
  return {
    ...raw,
    panels,
    surfaces: Object.fromEntries(
      Object.entries(raw.surfaces ?? {}).map(([surface, root]) => [
        surface,
        node(root),
      ]),
    ),
    containers: Object.fromEntries(
      Object.entries(raw.containers ?? {}).map(([id, root]) => [
        panelId(id),
        node(root),
      ]),
    ),
    floating: Object.fromEntries(
      Object.entries(raw.floating ?? {}).map(([id, position]) => [
        panelId(id),
        position,
      ]),
    ),
    maximized:
      typeof raw.maximized === "string"
        ? panelId(raw.maximized)
        : raw.maximized,
    ...Object.fromEntries(
      (["sidebar", "bottom"] as const)
        .filter((surface) => Array.isArray(raw[surface]))
        .map((surface) => [
          surface,
          raw[surface].map((id: any) =>
            typeof id === "string" ? panelId(id) : id,
          ),
        ]),
    ),
  };
}

/** Convert saved v1–v4 docks and legacy asset terminology without touching authored data. */
export function migrateDock(
  raw: unknown,
  widgets: WidgetId[] = ["clock", "action-button"],
  policy: DockPolicy = DEFAULT_DOCK_POLICY,
): DockLayout {
  if (!raw || typeof raw !== "object") return createDockLayout(widgets);
  let value = migrateAssetReferences(raw as Record<string, any>);
  const dockedWidgets: WidgetId[] =
    value.version >= 2
      ? []
      : ["sidebar", "bottom"]
          .flatMap((zone) => (Array.isArray(value[zone]) ? value[zone] : []))
          .map((id: unknown) =>
            typeof id === "string" && id.startsWith("widget:")
              ? id.slice(7)
              : "",
          )
          .filter(isWidget);
  const base = createDockLayout([...new Set([...widgets, ...dockedWidgets])]);
  if (![2, 3, 4, 5].includes(value.version)) {
    for (const surface of ["sidebar", "bottom"] as const)
      for (const old of Array.isArray(value[surface]) ? value[surface] : []) {
        const panel =
          old === BROWSER_ID
            ? BROWSER_ID
            : Object.values(base.panels).find(
                (item) =>
                  item.kind === "widget" && `widget:${item.widget}` === old,
              )?.id;
        if (!panel || panelSurface(base, panel) === surface) continue;
        const result = reduceDock(
          base,
          {
            type: "move",
            panelId: panel,
            target: { surface, intent: "append" },
          },
          policy,
        );
        if (result.ok) Object.assign(base, result.layout);
      }
    for (const panel of Object.values(base.panels))
      if (
        panel.kind === "widget" &&
        ["compact", "standard", "wide"].includes(
          value.widgetSizes?.[panel.widget],
        )
      )
        panel.size = value.widgetSizes[panel.widget];
    base.dashboardWidth = Number.isFinite(value.dashboardWidth) ? Math.max(40, Math.min(100, value.dashboardWidth)) : 100;
    base.sidebarWidth = Number.isFinite(value.sidebarWidth)
      ? Math.max(220, Math.min(520, value.sidebarWidth))
      : 310;
    base.bottomSize = Number.isFinite(value.bottomSize)
      ? Math.max(24, Math.min(60, value.bottomSize))
      : 36;
    base.browserView = value.browserView === "list" ? "list" : "grid";
    return base;
  }
  const panels: Record<string, Panel> = {
    ...(value.rootId && value.panels?.[value.rootId] ? { [value.rootId]: value.panels[value.rootId] } : {}),
    [HOME_ID]: base.panels[HOME_ID],
    [BROWSER_ID]: base.panels[BROWSER_ID],
    [NAVIGATION_ID]: base.panels[NAVIGATION_ID],
  };
  for (const [id, panel] of Object.entries(value.panels ?? {}))
    if (panel && typeof panel === "object" && (panel as Panel).id === id) {
      const typed = panel as Panel;
      const appearance: PanelAppearance = {
        contentSizing: ["fill", "scroll", "clip"].includes(typed.contentSizing ?? "") ? typed.contentSizing : undefined,
        displayName: typeof typed.displayName === "string" ? typed.displayName.trim().slice(0, 120) || undefined : undefined,
        hideDisplayName: typed.hideDisplayName === true,
        flippable: typeof typed.flippable === "boolean" ? typed.flippable : undefined,
        chrome: ["default", "compact", "seamless"].includes(typed.chrome ?? "") ? typed.chrome : undefined,
      };
      if(typed.kind==='navigation')panels[id]={...typed,tags:['navigation'],navigation:{...(typed.navigation?.areasInitialized?{areasInitialized:true}:{}),filter:normalizeNavigation(typed.navigation?.filter),presentation:['list','tree','compact'].includes(typed.navigation?.presentation??'')?typed.navigation!.presentation:'list',...(typeof typed.navigation?.selectedAssetId==='string'?{selectedAssetId:typed.navigation.selectedAssetId}:{})}};
      else if (typed.kind === "widget" && isWidget(typed.widget))
        panels[id] = {
          ...typed,
          ...appearance,
          definitionSnapshot: definitionSnapshotSchema.safeParse(typed.definitionSnapshot).data,
          surface: widgetDefaultsSchema.shape.surface.safeParse(typed.surface).data,
          size: ["compact", "standard", "wide"].includes(typed.size)
            ? typed.size
            : "standard",
          tags: ["widget"],
          tone:
            typed.tone &&
            ["blue", "violet", "coral", "mint", "slate"].includes(typed.tone)
              ? typed.tone
              : undefined,
          background: /^#[0-9a-fA-F]{6}$/.test(typed.background ?? "") ? typed.background : undefined,
          childWidget: typed.childWidget && isWidget(typed.childWidget) ? typed.childWidget : undefined,
          stackMode: ["carousel", "sidebar"].includes(typed.stackMode ?? "") ? typed.stackMode : "tabs",
          browser: ["web-browser", "browser-tab"].includes(typed.widget) ? (() => {
            try { return browserConfiguration(typed.browser); } catch { return undefined; }
          })() : undefined,
        };
      else if (
        (typed.kind === "asset" ||
          typed.kind === "web-widget" ||
          typed.kind === "editor-part") &&
        typeof typed.assetId === "string"
      )
        panels[id] = {
          ...typed,
          ...appearance,
          tags: [typed.kind === "asset" ? "view" : "widget"],
        };
      else if (
        (typed.kind === "contribution" || typed.kind === "command-output") &&
        typeof typed.definitionId === "string"
      )
        panels[id] = { ...typed, ...appearance, tags: ["widget", "view"] };
    }
  value = { ...value, containers: { ...value.containers } };
  for (const panel of Object.values(panels)) {
    if (panel.kind !== "widget" || panel.widget !== "web-browser" || value.containers[panel.id]) continue;
    panel.childWidget ??= "browser-tab";
    const config = panel.browser ?? defaultBrowserConfiguration();
    const children = config.tabs.map(tab => {
      let id = `${panel.id}:browser:${tab.id}`;
      if (panels[id]) id = uid("browser-tab");
      panels[id] = { id, kind: "widget", widget: "browser-tab", size: "standard", chrome: "seamless", stackMode: "tabs", hideDisplayName: false, tags: ["widget"], browser: { tabs: [tab], activeTab: tab.id } };
      return id;
    });
    value.containers[panel.id] = { kind: "stack", id: uid("stack"), tabs: children, active: children[config.tabs.findIndex(tab => tab.id === config.activeTab)] ?? children[0], keepEmpty: true };
  }
  const rootId = typeof value.rootId === "string" && panels[value.rootId]?.kind === "widget" && ["app-shell", "desktop-shell"].includes((panels[value.rootId] as Extract<Panel, {kind:"widget"}>).widget) ? value.rootId : ROOT_ID;
  panels[rootId] ??= base.panels[ROOT_ID];
  const seen = new Set<string>([rootId]);
  const nodeIds = new Set<string>();
  const displaced: string[] = [];
  const containers: Record<string, Node> = {};
  const clean = (
    node: any,
    surface: Surface,
    depth = 0,
    ownerId?: string,
  ): Node | null => {
    if (!node || depth > 32 || typeof node.id !== "string") return null;
    const id = nodeIds.has(node.id)
      ? uid(
          node.kind === "split"
            ? "split"
            : node.kind === "grid"
              ? "grid"
              : "stack",
        )
      : node.id;
    nodeIds.add(id);
    if (node.kind === "stack" && Array.isArray(node.tabs)) {
      const tabs: string[] = node.tabs.filter((panelId: unknown) => {
        if (
          typeof panelId !== "string" ||
          !panels[panelId] ||
          seen.has(panelId)
        )
          return false;
        if (
          (ownerId && ["home", "navigation"].includes(panels[panelId].kind)) ||
          placementReason(
            panels[panelId],
            { surface, ownerId, intent: "append" },
            policy,
          )
        ) {
          displaced.push(panelId);
          return false;
        }
        seen.add(panelId);
        const panel = panels[panelId];
        if (
          value.containers?.[panelId] ||
          isLayoutPanel(panel)
        )
          containers[panelId] =
            clean(value.containers?.[panelId], surface, depth + 1, panelId) ??
            emptySlot();
        return true;
      });
      return tabs.length || node.keepEmpty === true || node.autoClose === false
        ? {
            kind: "stack",
            id,
            tabs,
            active: tabs.includes(node.active) ? node.active : (tabs[0] ?? ""),
            keepEmpty: node.keepEmpty === true || surface === "dashboard",
            ...(typeof node.autoClose === "boolean" ? { autoClose: node.autoClose } : {}),
            presentation:
              node.presentation === "carousel" ? "carousel" : node.presentation === "plain" || !node.presentation && surface === "sidebar" ? "plain" : "tabs",
            ...(typeof node.slotId === "string" ? { slotId: node.slotId } : {}),
            ...(Array.isArray(node.allowedDefinitions)
              ? {
                  allowedDefinitions: node.allowedDefinitions.filter(
                    (id: unknown) => typeof id === "string",
                  ),
                }
              : {}),
          }
        : null;
    }
    if (node.kind === "split") {
      const first = clean(node.first, surface, depth + 1, ownerId),
        second = clean(node.second, surface, depth + 1, ownerId);
      return first && second
        ? {
            kind: "split",
            id,
            axis: node.axis === "vertical" ? "vertical" : "horizontal",
            ratio: Number.isFinite(node.ratio)
              ? Math.max(0.2, Math.min(0.8, node.ratio))
              : 0.5,
            first,
            second,
          }
        : (first ?? second);
    }
    if (node.kind === "grid" && Array.isArray(node.cells))
      return {
        kind: "grid",
        id,
        cells: node.cells
          .map((cell: any) => ({
            id: cell.id,
            height: Number.isFinite(cell.height) ? Math.max(160, Math.min(1600, cell.height)) : undefined,
            node: clean(cell.node, surface, depth + 1, ownerId),
          }))
          .filter((cell: any) => typeof cell.id === "string" && cell.node),
      };
    return null;
  };
  const surfaces = Object.fromEntries(
    (SURFACES).map((surface) => [
      surface,
      clean(value.surfaces?.[surface], surface),
    ]),
  ) as DockLayout["surfaces"];
  const toolbarTabs: string[] = [];
  visitNode(surfaces.toolbar, node => { if (node.kind === "stack") toolbarTabs.push(...node.tabs); });
  surfaces.toolbar = { kind: "stack", id: surfaces.toolbar?.id ?? (nodeIds.has("stack:toolbar") ? uid("stack") : "stack:toolbar"), tabs: toolbarTabs, active: surfaces.toolbar?.kind === "stack" && toolbarTabs.includes(surfaces.toolbar.active) ? surfaces.toolbar.active : toolbarTabs[0] ?? "", keepEmpty: true };
  // Older layouts could split every surface without a leaf limit. Merge excess
  // leaves into the first stack in traversal order, retaining tab order and IDs.
  for (const surface of ["main", "sidebar", "bottom", "toolbar"] as const) {
    const root = surfaces[surface];
    const leaves: Stack[] = [];
    visitNode(root, (node) => {
      if (node.kind === "stack") leaves.push(node);
    });
    const limit = policy[surface].maxLeafStacks;
    if (leaves.length <= limit) continue;
    const keep = leaves.slice(0, limit);
    const overflow = leaves.slice(limit).flatMap((leaf) => leaf.tabs);
    const ids = new Set(keep.map((leaf) => leaf.id));
    const prune = (node: Node): Node | null =>
      node.kind === "stack"
        ? ids.has(node.id)
          ? node
          : null
        : node.kind === "split"
          ? (() => {
              const first = prune(node.first),
                second = prune(node.second);
              return first && second
                ? { ...node, first, second }
                : (first ?? second);
            })()
          : node;
    const first = keep[0];
    surfaces[surface] = rewrite(prune(root!)!, (node) =>
      node.kind === "stack" && node.id === first.id
        ? { ...node, tabs: [...node.tabs, ...overflow] }
        : node,
    );
  }
  if (!seen.has(HOME_ID)) {
    let first: Stack | null = null;
    visitNode(surfaces.main, (node) => {
      if (!first && node.kind === "stack") first = node;
    });
    surfaces.main = surfaces.main
      ? insert(surfaces.main, HOME_ID, {
          surface: "main",
          intent: "tab",
          nodeId: (first as Stack | null)?.id,
          index: 0,
        })
      : base.surfaces.main;
    seen.add(HOME_ID);
  }
  if (!seen.has(BROWSER_ID)) {
    surfaces.bottom = surfaces.bottom
      ? insert(surfaces.bottom, BROWSER_ID, {
          surface: "bottom",
          intent: "append",
        })
      : base.surfaces.bottom;
    seen.add(BROWSER_ID);
  }
  // A bottom dock remains an intentional slot after its last panel moves away.
  surfaces.bottom = surfaces.bottom
    ? rewrite(surfaces.bottom, (node) =>
        node.kind === "stack" ? { ...node, keepEmpty: true } : node,
      )
    : emptySlot();
  if (!seen.has(NAVIGATION_ID)) {
    surfaces.sidebar = surfaces.sidebar
      ? insert(surfaces.sidebar, NAVIGATION_ID, {
          surface: "sidebar",
          intent: "append",
          index: 0,
        })
      : base.surfaces.sidebar;
    seen.add(NAVIGATION_ID);
  }
  if (!surfaces.dashboard)
    surfaces.dashboard = { kind: "grid", id: "grid:dashboard", cells: [] };
  if (value.version < 4 && surfaces.dashboard.kind === "grid")
    surfaces.dashboard = {
      ...surfaces.dashboard,
      cells: bentoRows(surfaces.dashboard.cells),
    };
  const floating: DockLayout["floating"] = {};
  for (const [id, item] of Object.entries(value.floating ?? {})) {
    const position = item as DockLayout["floating"][string];
    if (
      !panels[id] ||
      ["home", "navigation", "browser"].includes(panels[id].kind) ||
      seen.has(id) ||
      !Number.isFinite(position?.x) ||
      !Number.isFinite(position?.y)
    )
      continue;
    floating[id] = {
      x: Math.max(0, position.x),
      y: Math.max(0, position.y),
      width: Number.isFinite(position.width) ? Math.max(220, Math.min(4096, position.width)) : 420,
      height: Number.isFinite(position.height) ? Math.max(panels[id].kind === "widget" ? WIDGET_PLACEMENT[panels[id].widget].window?.minHeight ?? 160 : 160, Math.min(4096, position.height)) : 360,
      presentation: position.presentation === "peek" ? "peek" : undefined,
      edge: position.presentation === "peek" && ["top", "bottom", "left", "right"].includes(position.edge!) ? position.edge : undefined,
      hidden: position.hidden === true || undefined,
      returnTo: SURFACES.includes(
        position.returnTo,
      )
        ? position.returnTo
        : panels[id].kind === "asset"
          ? "main"
          : "dashboard",
    };
    seen.add(id);
    if (
      value.containers?.[id] ||
      isLayoutPanel(panels[id])
    )
      containers[id] =
        clean(
          value.containers?.[id],
          position.returnTo ?? "dashboard",
          1,
          id,
        ) ?? emptySlot();
  }
  for (const id of new Set([...displaced, ...Object.keys(panels)])) {
    if (seen.has(id) || floating[id]) continue;
    const panel = panels[id];
    const surface: Surface =
      panel.kind === "widget" || panel.kind === "web-widget"
        ? "dashboard"
        : panel.kind === "browser"
          ? "bottom"
          : panel.kind === "navigation"
            ? "sidebar"
            : "main";
    if (
      surfacePanels({ ...base, surfaces, containers }, surface).includes(id)
    ) {
      seen.add(id);
      continue;
    }
    let firstStack: Stack | null = null;
    visitNode(surfaces[surface], (node) => {
      if (!firstStack && node.kind === "stack") firstStack = node;
    });
    const target: Target =
      surface === "dashboard"
        ? { surface, intent: "append" }
        : { surface, intent: "tab", nodeId: (firstStack as Stack | null)?.id };
    surfaces[surface] = insert(surfaces[surface], id, target);
    if (isLayoutPanel(panel))
      containers[id] ??= emptySlot();
    seen.add(id);
  }
  let migrated: DockLayout = {
    version: 5,
    rootId,
    panels,
    surfaces,
    containers,
    dashboardWidth: Number.isFinite(value.dashboardWidth) ? Math.max(40, Math.min(100, value.dashboardWidth)) : 100,
    sidebarWidth: Number.isFinite(value.sidebarWidth)
      ? Math.max(220, Math.min(520, value.sidebarWidth))
      : 310,
    bottomSize: Number.isFinite(value.bottomSize)
      ? Math.max(24, Math.min(60, value.bottomSize))
      : 36,
    browserView: value.browserView === "list" ? "list" : "grid",
    maximized:
      typeof value.maximized === "string" && seen.has(value.maximized)
        ? value.maximized
        : null,
    hidden: Object.fromEntries(
      (["main", "sidebar", "bottom"] as const).map((surface) => [
        surface,
        value.hidden?.[surface] === true,
      ]),
    ) as DockLayout["hidden"],
    sidebarSide: value.sidebarSide === "right" ? "right" : "left",
    floating,
  };
  // Pins previously projected a second UI for every action. Consume only explicit
  // pins once, moving the same identity into its real destination.
  if ((value.version ?? 0) < 5) for (const panel of Object.values(migrated.panels)) {
    if (panel.kind !== "widget" || panel.widget !== "action-button") continue;
    const pinned = panel.actionButton?.pinned === true;
    if (panel.actionButton) {
      const { pinned: _, ...config } = panel.actionButton;
      migrated.panels[panel.id] = { ...panel, actionButton: config };
    }
    if (pinned) {
      const moved = reduceDock(migrated, { type: "move", panelId: panel.id, target: { surface: "toolbar", intent: "append" } }, policy);
      if (moved.ok) migrated = moved.layout;
    }
  }
  // v2 predates the new starters. The v3 document prevents adding them again if removed.
  if (value.version === 2) {
    for (const widget of ["weather", "clock", "stack"] as const) {
      if (
        Object.values(migrated.panels).some(
          (panel) => panel.kind === "widget" && panel.widget === widget,
        )
      )
        continue;
      const result = reduceDock(
        migrated,
        {
          type: "createWidget",
          widget,
          target: { surface: "dashboard", intent: "append" },
        },
        policy,
      );
      if (result.ok) migrated = result.layout;
    }
  }
  return migrated;
}

export function resolveSlotReference(layout: DockLayout, ref: SlotReference): Stack | undefined {
  if (!slotReferenceSchema.safeParse(ref).success) return;
  const root = ref.ownerId ? layout.containers[ref.ownerId] : layout.surfaces[ref.surface];
  let result: Stack | undefined;
  visitNode(root ?? null, node => { if (node.id === ref.nodeId && node.kind === "stack") result = node; });
  return result;
}

/** Navigation owns ordinary widget areas under the same dock tree and policy. */
export function isNavigationPanel(panel: Panel | undefined): boolean {
  return panel?.kind === "navigation" || (panel?.kind === "widget" && panel.widget === "navigation");
}

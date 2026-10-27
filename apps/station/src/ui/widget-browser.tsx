import { useState } from "react";
import { FileSearch, Plus, SquareDashed } from "lucide-react";
import { IconAction } from "./components/ui/icon-action";
import { Popover, PopoverContent, PopoverTitle, PopoverClose } from "./components/ui/popover";
import { useDockController } from "./docking/react";
import { TreeView, type TreeNode } from "./components/ui/tree-view";
import { dropReason, panelSlot, panelSurface, type Panel, type Command } from "../core/docking";
import { widgetDefinitions, definitionForPanel, type WidgetDefinition } from "./widget-catalog";
import { Input } from "./components/ui/input";
import { Tabs, TabsList, TabsTab, TabsPanel } from "./components/ui/tabs";
import type { Workspace } from "../core/workspace-state";

const categories = ["All", "Layouts", "Apps", "Tools", "Assets"] as const;
function category(item: WidgetDefinition) {
  if (item.provider !== "builtin") return "Assets";
  if (item.renderer === "layout") return "Layouts";
  return ["builtin:capabilities", "builtin:docking-inspector"].includes(item.id) ? "Tools" : "Apps";
}
/** Anchored creation overlay. Definition creation and existing-instance moves share
 * a target; an append target creates its backing slot atomically with the widget.
 * No asset or runtime authority is changed by opening this surface.
 */
export function WidgetBrowser({ workspace, onReveal }: { workspace: Workspace; onReveal: (id: string) => Promise<void> }) {
  const { layout, policy, command, catalogTarget, catalogAnchor, openCatalog, onOpenDefinition } = useDockController();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState("definitions");
  const [group, setGroup] = useState("All");
  const definitions = widgetDefinitions(workspace.assets, workspace);
  const titleOf = (panel: Panel) => panel.displayName || definitionForPanel(panel, definitions)?.title || panel.id;
  const matches = (value: string) => query.trim().toLowerCase().split(/\s+/).every(word => value.toLowerCase().includes(word));
  const visibleDefinitions = definitions.filter(item => item.create && item.creation !== "contextual" && !workspace.desks.find(desk => desk.id === workspace.activeDeskId)?.hiddenDefinitions.includes(item.id) && (group === "All" || category(item) === group) && matches(`${item.title} ${item.description} ${item.preview}`));
  const visibleInstances = Object.values(layout.panels).filter(panel => panel.id !== layout.rootId && !["home", "navigation", "browser"].includes(panel.kind) && matches(titleOf(panel)));
  const close = () => { openCatalog(null); setQuery(""); setMessage(""); setView("definitions"); setGroup("All"); };
  const finish = (action: Command) => {
    const result = command(action);
    if (!result.ok) { setMessage(result.reason); return; }
    close();
    if (result.panelId) void onReveal(result.panelId);
  };
  return <Popover open={!!catalogTarget} onOpenChange={open => { if (!open) close(); }}>
    <PopoverContent anchor={catalogAnchor} finalFocus={() => catalogAnchor} align="start" arrow={false} size="lg" className="max-h-[min(620px,85dvh)] gap-2 overflow-hidden p-2" aria-label="Add a widget" data-native-overlay>
      <div className="flex items-center justify-between gap-2 px-1"><PopoverTitle>Add a widget</PopoverTitle><PopoverClose /></div>
      <Input autoFocus type="search" aria-label="Search widgets" placeholder="Search widgets…" value={query} onChange={event => setQuery(event.target.value)} />
      <Tabs value={view} onValueChange={value => setView(String(value))} className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label="Widget picker"><TabsTab value="definitions">New widgets</TabsTab><TabsTab value="instances">Existing instances</TabsTab></TabsList>
        <TabsPanel value="definitions" className="min-h-0 overflow-auto">
          <nav aria-label="Widget categories" className="mb-2 flex flex-wrap gap-0.5">{categories.map(value => <button type="button" key={value} aria-pressed={group === value} className="rounded-md px-2 py-1 text-xs text-fg-3 hover:bg-hover aria-pressed:bg-selected aria-pressed:text-fg focus-visible:outline-2 focus-visible:outline-focus" onClick={() => setGroup(value)}>{value}</button>)}</nav>
          {catalogTarget?.intent === "append" && (catalogTarget.surface === "dashboard" || catalogTarget.ownerId) && !query && <button type="button" className="widget-create-row" onClick={() => finish({ type: "addSlot", surface: catalogTarget.surface, ownerId: catalogTarget.ownerId })}><SquareDashed size={16} /><span><strong>Empty slot</strong><small>Add a place for widgets</small></span><Plus size={14} /></button>}
          <div className="flex flex-col gap-0.5">{visibleDefinitions.map(item => {
            const create = item.create!, Icon = item.icon;
            const panel: Panel = create.kind === "contribution" ? { id: "preview", kind: "contribution", definitionId: create.definitionId, tags: ["widget"] } : create.kind === "widget" ? { id: "preview", ...create, size: "standard", tags: ["widget"] } : { id: "preview", ...create, tags: [create.kind === "asset" ? "view" : "widget"] };
            const reason = catalogTarget ? dropReason(layout, panel, catalogTarget, policy) : null;
            const sourceAvailable = !!item.assetId && (item.provider === "builtin" || workspace.assets.some(asset => asset.id === item.assetId));
            const provenance = item.provider === "builtin" ? "Built-in" : item.provider === "package" ? "Installed package" : "Workspace asset";
            return <div key={item.id} className="flex items-center gap-1 rounded-md border border-transparent hover:border-line-2">
            <button type="button" className="widget-create-row min-w-0 flex-1" disabled={!!reason} aria-label={`Create ${item.title}`} title={reason ?? item.description} onClick={() => {
              if (!catalogTarget) return;
              finish(create.kind === "contribution" ? { type: "createContribution", definitionId: create.definitionId, target: catalogTarget } : create.kind === "widget" ? { type: "createWidget", widget: create.widget, definitionId: create.definitionId, target: catalogTarget } : { type: create.kind === "asset" ? "createAssetView" : "createWebWidget", assetId: create.assetId, target: catalogTarget });
            }}><Icon size={18} /><span><strong>{item.title}</strong><small>{provenance} · {item.description}</small>{reason && <small>{reason}</small>}</span><Plus size={14} /></button>
            {item.assetId && onOpenDefinition && <IconAction label={`Inspect ${item.title}`} tooltip={sourceAvailable ? `Open ${item.title} source` : "Original source is unavailable; installed instances retain their snapshot"} disabled={!sourceAvailable} className="mr-1 size-8 border-transparent bg-transparent" onClick={() => {
              try { onOpenDefinition(item.assetId!); close(); } catch (error) { setMessage(String(error)); }
            }}><FileSearch size={15} /></IconAction>}
            </div>;
          })}</div>
          {!visibleDefinitions.length && <p className="p-4 text-center text-xs text-fg-3">No widgets match this search.</p>}
        </TabsPanel>
        <TabsPanel value="instances" className="min-h-0 overflow-auto">
          <p className="px-2 py-2 text-xs text-fg-3">Move an instance here with its state intact.</p>
          <TreeView aria-label="Existing widget instances" selectionMode="single" expandOnClick defaultExpanded={["dashboard", "main", "sidebar", "bottom", "toolbar", "floating"].map(id => `folder:${id}`)}
            items={Object.values(visibleInstances.reduce<Record<string, TreeNode>>((groups, panel) => {
              const ownerId = panelSlot(layout, panel.id)?.target.ownerId;
              const key = ownerId ?? panelSurface(layout, panel.id) ?? "floating";
              const group = groups[key] ??= { id: `folder:${key}`, label: ownerId && layout.panels[ownerId] ? titleOf(layout.panels[ownerId]) : key, children: [] };
              group.children!.push({ id: panel.id, label: titleOf(panel), disabled: !!catalogTarget && !!dropReason(layout, panel, catalogTarget, policy) });
              return groups;
            }, {}))}
            onSelectedChange={ids => { const id = ids.at(-1); if (id && layout.panels[id] && catalogTarget) finish({ type: "move", panelId: id, target: catalogTarget }); }}
          />
        </TabsPanel>
      </Tabs>
      {message && <p role="status" className="px-2 text-xs text-danger">{message}</p>}
    </PopoverContent>
  </Popover>;
}

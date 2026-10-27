import { SlotSettings } from "../components/workspace/slot-settings";
import { findNode } from "../../core/docking";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Columns2, Eye, EyeOff, Layers3, ListTree, Lock, Pipette, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { WidgetSettings } from "../components/workspace/widget-settings";
import { Switch } from "../components/ui/switch";
import { IconAction } from "../components/ui/icon-action";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/native-select";
import { StatusBadge } from "../components/ui/status-badge";
import { TreeView, type TreeNode } from "../components/ui/tree-view";
import { Tabs, TabsList, TabsTab, TabsPanel } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";
import { panelSurface, surfacePanels, type Node, type Command, type Surface } from "../../core/docking";
import { independentWidgetSelection, widgetBulkCloseCommand } from "../../core/widget-actions";
import { useDockController } from "./react";
import { revealPresentation } from "./presentations";
import { builtinWidgetDependencies } from "../../core/widget-dependencies";

const surfaceNames = { toolbar: "Toolbar", main: "Main surface", dashboard: "Overview", sidebar: "Side dock", bottom: "Bottom dock" };

/** Fixed chrome surrounds one scrolling pane. The same Stealth tree, settings and
 * command boundary are used for pointer picking, keyboard inspection and bulk actions.
 */
export function DockInspector({ panelId }: { panelId?: string }) {
  const { selectedWidgets, selectWidgets, selectingWidget, setSelectingWidget, focusPanel, layout, command, policy, panelTitle, debugDropZones, debugLayout, editingWidgets, setDebugDropZones, setDebugLayout, setEditingWidgets } = useDockController();
  const [tab, setTab] = useState<string>("hierarchy");
  const [selectedSlot, setSelectedSlot] = useState<string>();
  useEffect(() => { if (selectedWidgets.length) setSelectedSlot(undefined); }, [selectedWidgets.join(",")]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string[]>(["surface:main", "surface:dashboard", "surface:sidebar", "surface:bottom", "surface:floating"]);
  const tree = useRef<HTMLDivElement>(null);
  const ids = independentWidgetSelection(layout, selectedWidgets);
  const selected = selectedWidgets.length === 1 ? layout.panels[selectedWidgets[0]] : undefined;
  const locked = selected && ["home", "browser", "navigation"].includes(selected.kind);
  const dependencies = selected ? builtinWidgetDependencies(selected) : null;
  const keepInspectorVisible = () => { focusPanel(null); if (panelId && !layout.floating[panelId]) command({ type: "float", panelId }); };
  const run = (action: Command) => { const result = command(action); setError(result.ok ? "" : result.reason); return result; };
  const bulk = (action: (id: string) => Command) => run({ type: "batch", commands: ids.map(action) });
  const reveal = async (id: string) => {
    if (!layout.panels[id]) return;
    if (id !== panelId) keepInspectorVisible();
    run({ type: "activate", panelId: id });
    const surface = panelSurface(layout, id);
    if (surface && surface !== "dashboard") run({ type: "visibility", surface, hidden: false });
    await revealPresentation(id);
  };
  const items = useMemo(() => {
    const instance = (id: string): TreeNode => {
      const panel = layout.panels[id];
      const peek = layout.floating[id]?.presentation === "peek" ? layout.floating[id] : undefined;
      return { id, label: panelTitle(panel), icon: <Box size={14} />, meta: peek ? <StatusBadge tone={peek.hidden ? "warning" : "info"}>{peek.hidden ? "Hidden" : `${peek.edge ?? "right"} peek`}</StatusBadge> : ["home", "browser", "navigation"].includes(panel.kind) ? <StatusBadge icon={<Lock />}>Shell</StatusBadge> : panel.ownerId ? <StatusBadge>Owned</StatusBadge> : undefined, actions: peek ? <IconAction className="size-6 border-transparent bg-transparent" label={`${peek.hidden ? "Show" : "Hide"} ${panelTitle(panel)} peek`} onClick={() => run({ type: "peekVisibility", panelId: id, hidden: !peek.hidden })}>{peek.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</IconAction> : undefined, children: layout.containers[id] ? nodes(layout.containers[id]) : undefined };
    };
    const nodes = (node: Node): TreeNode[] => node.kind === "stack" ? [{ id: node.id, label: node.tabs.length ? "Slot" : "Empty slot", icon: <Layers3 size={14} />, meta: <StatusBadge>{node.tabs.length}</StatusBadge>, children: node.tabs.map(instance) }] : node.kind === "grid" ? node.cells.flatMap(cell => nodes(cell.node)) : [{ id: node.id, label: node.axis === "horizontal" ? "Columns" : "Rows", icon: <Columns2 size={14} />, children: [...nodes(node.first), ...nodes(node.second)] }];
    return [ ...(layout.rootId ? [{ id: layout.rootId, label: panelTitle(layout.panels[layout.rootId]), icon: <Layers3 size={14} />, meta: <StatusBadge>Desk root</StatusBadge> }] : []), ...(["main", "dashboard", "sidebar", "bottom", "toolbar"] as const).map(surface => ({
      id: `surface:${surface}`, label: surfaceNames[surface], icon: <Layers3 size={14} />,
      meta: <StatusBadge tone={layout.hidden[surface] ? "warning" : "neutral"}>{layout.hidden[surface] ? "Hidden" : `${surfacePanels(layout, surface).length}`}</StatusBadge>,
      actions: surface === "toolbar" ? undefined : <>{surface !== "dashboard" && <IconAction className="size-6 border-transparent bg-transparent" label={`${layout.hidden[surface] ? "Show" : "Hide"} ${surfaceNames[surface]}`} onClick={() => run({ type: "visibility", surface, hidden: !layout.hidden[surface] })}>{layout.hidden[surface] ? <EyeOff size={13} /> : <Eye size={13} />}</IconAction>}<IconAction className="size-6 border-transparent bg-transparent" label={`Add empty slot to ${surfaceNames[surface]}`} onClick={() => run(surface === "dashboard" ? { type: "addSlot", surface } : { type: "batch", commands: [{ type: "addSlot", surface }, { type: "visibility", surface, hidden: false }] })}><Plus size={13} /></IconAction></>,
      children: layout.surfaces[surface] ? nodes(layout.surfaces[surface]!) : [],
    })), { id: "surface:floating", label: "Windows & peeks", icon: <Layers3 size={14} />, meta: <StatusBadge>{Object.keys(layout.floating).length}</StatusBadge>, children: Object.keys(layout.floating).map(instance) } ];
  }, [layout, panelTitle]);
  const filtered = useMemo(() => {
    const filter = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap(node => {
      if (node.label.toLowerCase().includes(query.toLowerCase())) return [node];
      const children = node.children ? filter(node.children) : undefined;
      return children?.length ? [{ ...node, children }] : [];
    });
    return query ? filter(items) : items;
  }, [items, query]);
  useEffect(() => {
    const ancestors: string[] = [];
    const walk = (nodes: TreeNode[], parents: string[]) => { for (const node of nodes) { if (selectedWidgets.includes(node.id) || query) ancestors.push(...parents); if (node.children) walk(node.children, [...parents, node.id]); } };
    walk(items, []);
    setExpanded(previous => [...new Set([...previous, ...ancestors])]);
    const frame = requestAnimationFrame(() => tree.current?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(selectedWidgets.at(-1) ?? "")}"]`)?.scrollIntoView({ block: "nearest", behavior: "instant" }));
    return () => cancelAnimationFrame(frame);
  }, [selectedWidgets.join(","), query]);
  return <div className="widget-inspector-panel">
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line-2 px-3 py-2">
      <div className="flex items-center gap-2"><ListTree size={15} /><span className="text-xs font-medium">Workspace</span><StatusBadge>{Object.keys(layout.panels).length} instances</StatusBadge></div>
      <IconAction className="size-7 border-transparent bg-transparent" label={selectingWidget ? "Cancel widget picker" : "Pick a widget"} aria-pressed={selectingWidget} onClick={() => { keepInspectorVisible(); setSelectingWidget(!selectingWidget); }}><Pipette size={15} /></IconAction>
    </header>
    {selectingWidget && <p role="status" className="shrink-0 border-b border-line-2 bg-info-soft px-3 py-2 text-xs text-info">Pick a widget. Ctrl/Shift adds; Escape cancels.</p>}
    <Tabs value={tab} onValueChange={value => setTab(String(value))} className="min-h-0 flex-1">
      <TabsList className="shrink-0 px-2"><TabsTab value="hierarchy">Hierarchy</TabsTab><TabsTab value="properties">Properties</TabsTab><TabsTab value="diagnostics" aria-label="Diagnostics" icon={<SlidersHorizontal size={14} />} /></TabsList>
      <TabsPanel value="hierarchy" className="flex min-h-0 flex-1 flex-col p-0">
        <div className="relative shrink-0 px-2 py-2"><Input aria-label="Find widget" placeholder="Find a widget" value={query} onChange={event => setQuery(event.target.value)} className="h-8 text-xs" /></div>
        <div ref={tree} className="flex min-h-0 flex-1 flex-col"><TreeView aria-label="Widget hierarchy" className="min-h-0 flex-1" items={filtered} expanded={expanded} onExpandedChange={setExpanded} selected={selectedSlot ? [selectedSlot] : selectedWidgets} selectionMode="multiple" expandOnClick={false} onSelectedChange={next => { const slotId = next.find(id => findNode(layout, id)); if (slotId) { selectWidgets([]); setSelectedSlot(slotId); setTab("properties"); } else { setSelectedSlot(undefined); selectWidgets(next.filter(id => layout.panels[id])); } }} onAction={node => void reveal(node.id)} /></div>
      </TabsPanel>
      <TabsPanel value="properties" className="min-h-0 flex-1 p-0"><ScrollArea className="h-full" contentClassName="space-y-3 p-3" fade={false}>
        {selectedSlot ? <SlotSettings nodeId={selectedSlot} onInspectWidget={id => { setSelectedSlot(undefined); selectWidgets([id]); }} /> : selected ? <><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{panelTitle(selected)}</strong><StatusBadge>{selected.kind}</StatusBadge>{locked && <StatusBadge icon={<Lock />}>Protected shell</StatusBadge>}</div><WidgetSettings key={selected.id} panelId={selected.id} /></> : ids.length > 1 ? <>
          <StatusBadge>{ids.length} selected</StatusBadge><NativeSelect aria-label="Move selected widgets" value="" onChange={event => { const target = event.target.value; if (target) bulk(id => target === "float" ? { type: "float", panelId: id } : { type: layout.floating[id] ? "dockFloat" : "move", panelId: id, target: { surface: target as Surface, intent: "append" } }); }}><option value="">Move selected to...</option><option value="main">Main surface</option><option value="dashboard">Overview</option><option value="sidebar">Side dock</option><option value="bottom">Bottom dock</option><option value="float">Floating windows</option></NativeSelect><Button size="sm" variant="ghost" onClick={() => run(widgetBulkCloseCommand(layout, ids, {}, policy))}>Remove selected</Button>
        </> : <p className="text-xs text-fg-3">Select a widget in the hierarchy or use the eyedropper.</p>}
      </ScrollArea></TabsPanel>
      <TabsPanel value="diagnostics" className="min-h-0 flex-1 p-0"><ScrollArea className="h-full" contentClassName="space-y-4 p-3" fade={false}>
        {dependencies && <section className="space-y-2"><h3 className="text-sm font-medium">Services and commands</h3><p className="text-xs text-fg-3">{dependencies.note}</p><h4 className="text-xs font-medium">Declared capabilities</h4>{dependencies.capabilities.map(id => <code key={id} className="block break-all text-xs">{id}</code>)}<h4 className="text-xs font-medium">Application commands</h4>{dependencies.commands.map(id => <code key={id} className="block break-all text-xs">{id}</code>)}<p className="text-xs text-fg-3">Open Capability inspector → Timeline to inspect live scope/acquisition history. Declarations grant nothing.</p></section>}
        <Switch label="Drop-zone diagnostics" checked={debugDropZones} onCheckedChange={setDebugDropZones} /><Switch label="Layout IDs" checked={debugLayout} onCheckedChange={setDebugLayout} /><Switch label="Edit widgets" checked={editingWidgets} onCheckedChange={setEditingWidgets} /></ScrollArea></TabsPanel>
    </Tabs>
    <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line-2 px-3 py-2">
      <span className="min-w-0 truncate text-xs text-fg-3">{selected ? panelTitle(selected) : selectedWidgets.length ? `${selectedWidgets.length} selected` : "No selection"}</span>
      {selectedWidgets.length > 0 && <div className="flex items-center gap-1"><Button size="sm" variant="ghost" onClick={() => setTab("properties")}>Inspect</Button><IconAction className="size-6 border-transparent bg-transparent" label="Clear widget selection" onClick={() => selectWidgets([])}><X size={13} /></IconAction></div>}
    </footer>
    {error && <p role="alert" className="shrink-0 px-3 py-2 text-xs text-danger">{error}</p>}
  </div>;
}

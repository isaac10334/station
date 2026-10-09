import { useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog";
import { useDockController } from "./docking/react";
import { dropReason, type Panel } from "./docking/core";
import { widgetDefinitions, definitionForPanel } from "./widget-catalog";
import { Input } from "./components/ui/input";
import { Tabs, TabsList, TabsTab, TabsPanel } from "./components/ui/tabs";
import type { Workspace } from "./model";

/** Definitions create new IDs; the instance list moves the existing ID. */
export function WidgetBrowser({ workspace, onReveal }: { workspace: Workspace; onReveal: (id: string) => Promise<void> }) {
  const { layout, policy, command, catalogTarget, openCatalog } = useDockController();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState("definitions");
  const definitions = widgetDefinitions(workspace.assets);
  const titleOf = (panel: Panel) => definitionForPanel(panel, definitions)?.title ?? panel.id;
  const matches = (value: string) => query.trim().toLowerCase().split(/\s+/).every(word => value.toLowerCase().includes(word));
  const visibleDefinitions = definitions.filter(item => item.create && matches(`${item.title} ${item.description} ${item.preview}`));
  const visibleInstances = Object.values(layout.panels).filter(panel => matches(titleOf(panel)));
  const reset = () => { setQuery(""); setMessage(""); setView("definitions"); };
  const returnFocus = (id?: string) => requestAnimationFrame(() => requestAnimationFrame(async () => { if (id) await onReveal(id); const target = id ? Array.from(document.querySelectorAll<HTMLElement>(`[data-instance-handle="${CSS.escape(id)}"]`)).find((node) => node.getClientRects().length && !node.closest("[inert]")) : null; (target ?? document.querySelector<HTMLElement>('button[aria-label="Add widgets"]'))?.focus({ preventScroll: true }); }));
  const finish = (result: ReturnType<typeof command>) => { if (result.ok) { openCatalog(null); reset(); returnFocus(result.panelId); } else setMessage(result.reason); };
  return <Dialog open={!!catalogTarget} onOpenChange={(open) => { if (!open) { openCatalog(null); reset(); returnFocus(); } }}><DialogContent className="station-widget-browser" size="lg">
    <DialogHeader><DialogTitle>Add a widget</DialogTitle><DialogDescription>Create an instance in the chosen slot, or move an existing instance here.</DialogDescription></DialogHeader>
    <Tabs value={view} onValueChange={value => setView(String(value))} className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 px-5 pt-2">
        <Input autoFocus type="search" aria-label="Search widgets" placeholder="Search widgets…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <TabsList aria-label="Widget picker"><TabsTab value="definitions" count={visibleDefinitions.length}>New widgets</TabsTab><TabsTab value="instances" count={visibleInstances.length}>Existing instances</TabsTab></TabsList>
      </div>
    <DialogBody key={view} className="pb-5">
      <TabsPanel value="definitions"><div className="station-definition-list">{visibleDefinitions.map((item) => {
        const create = item.create!, Icon = item.icon;
        const panel: Panel = create.kind === "widget" ? { id: "preview", ...create, size: "standard", tags: ["widget"] } : { id: "preview", ...create, tags: [create.kind === "asset" ? "view" : "widget"] };
        const reason = catalogTarget ? dropReason(layout, panel, catalogTarget, policy) : null;
        return <button type="button" key={item.id} disabled={!!reason} aria-label={`Create ${item.title}`} title={reason ?? `Create ${item.title}`} onClick={() => {
          if (!catalogTarget) return;
          finish(command(create.kind === "widget" ? { type: "createWidget", widget: create.widget, target: catalogTarget } : { type: create.kind === "asset" ? "createAssetView" : "createWebWidget", assetId: create.assetId, target: catalogTarget }));
        }}>
          <Icon size={20} className="shrink-0" /><span><strong>{item.title}</strong><small>{item.description}</small><em>{reason ?? item.preview}</em></span><span className="shrink-0">Create</span></button>;
      })}
      </div>{!visibleDefinitions.length && <p className="py-8 text-center text-sm text-fg-3">No widgets match “{query.trim()}”. Try another search.</p>}</TabsPanel>
      <TabsPanel value="instances"><p className="mb-3 text-xs text-fg-3">Move an instance here without creating a duplicate.</p><div className="station-instance-list">{visibleInstances.map((panel) => {
        const title = titleOf(panel);
        const reason = catalogTarget ? dropReason(layout, panel, catalogTarget, policy) : null;
        return <button key={panel.id} disabled={!!reason} title={reason ?? "Move this instance"} onClick={() => catalogTarget && finish(command({ type: "move", panelId: panel.id, target: catalogTarget }))}><span><strong>{title}</strong><small>{panel.id}</small></span><span>{reason ?? "Move here"}</span></button>;
      })}</div>{!visibleInstances.length && <p className="py-8 text-center text-sm text-fg-3">No existing instances match “{query.trim()}”.</p>}</TabsPanel>
    </DialogBody></Tabs>{message && <p role="status" className="shrink-0 px-5 pb-3 text-sm text-fg-2">{message}</p>}</DialogContent></Dialog>;
}

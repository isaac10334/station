import { useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog";
import { useDockController } from "./docking/react";
import { revealPresentation } from "./docking/presentations";
import { dropReason, type Panel } from "./docking/core";
import { widgetDefinitions, definitionForPanel } from "./widget-catalog";
import type { Workspace } from "./model";

/** Definitions create new IDs; the instance list moves the existing ID. */
export function WidgetBrowser({ workspace }: { workspace: Workspace }) {
  const { layout, policy, command, catalogTarget, openCatalog } = useDockController();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const definitions = widgetDefinitions(workspace.units);
  const titleOf = (panel: Panel) => definitionForPanel(panel, definitions)?.title ?? panel.id;
  const matches = (value: string) => value.toLowerCase().includes(query.toLowerCase());
  const returnFocus = (id?: string) => requestAnimationFrame(() => requestAnimationFrame(async () => { if (id) await revealPresentation(id); const target = id ? Array.from(document.querySelectorAll<HTMLElement>(`[data-instance-handle="${CSS.escape(id)}"]`)).find((node) => node.getClientRects().length && !node.closest("[inert]")) : null; (target ?? document.querySelector<HTMLElement>('button[aria-label="Add widgets"]'))?.focus({ preventScroll: true }); }));
  const finish = (result: ReturnType<typeof command>) => { if (result.ok) { openCatalog(null); setQuery(""); setMessage(""); returnFocus(result.panelId); } else setMessage(result.reason); };
  return <Dialog open={!!catalogTarget} onOpenChange={(open) => { if (!open) { openCatalog(null); returnFocus(); } }}><DialogContent className="station-widget-browser">
    <DialogHeader><DialogTitle>Add a widget</DialogTitle><DialogDescription>Create an instance in the chosen slot, or move an existing instance here.</DialogDescription></DialogHeader>
    <DialogBody><input autoFocus type="search" aria-label="Search widgets" placeholder="Search definitions and instances" value={query} onChange={(event) => setQuery(event.target.value)} />
      <h3>Widget definitions</h3><div className="station-definition-list">{definitions.filter((item) => item.create && matches(item.title + item.description)).map((item) => {
        const create = item.create!, Icon = item.icon;
        const panel: Panel = create.kind === "widget" ? { id: "preview", ...create, size: "standard", tags: ["widget"] } : { id: "preview", ...create, tags: [create.kind === "unit" ? "view" : "widget"] };
        const reason = catalogTarget ? dropReason(layout, panel, catalogTarget, policy) : null;
        return <button type="button" key={item.id} disabled={!!reason} title={reason ?? `Create ${item.title}`} onClick={() => {
          if (!catalogTarget) return;
          finish(command(create.kind === "widget" ? { type: "createWidget", widget: create.widget, target: catalogTarget } : { type: create.kind === "unit" ? "createUnitView" : "createWebWidget", unitId: create.unitId, target: catalogTarget }));
        }}>
          <Icon size={20} /><span><strong>{item.title}</strong><small>{item.description}</small><em>{item.preview}</em></span><span>Create</span></button>;
      })}
      </div><h3>Existing instances</h3><div className="station-instance-list">{Object.values(layout.panels).filter((panel) => {
        return matches(titleOf(panel));
      }).map((panel) => {
        const title = titleOf(panel);
        const reason = catalogTarget ? dropReason(layout, panel, catalogTarget, policy) : null;
        return <button key={panel.id} disabled={!!reason} title={reason ?? "Move this instance"} onClick={() => catalogTarget && finish(command({ type: "move", panelId: panel.id, target: catalogTarget }))}><span><strong>{title}</strong><small>{panel.id}</small></span><span>{reason ?? "Move here"}</span></button>;
      })}</div><p role="status">{message}</p>
    </DialogBody></DialogContent></Dialog>;
}

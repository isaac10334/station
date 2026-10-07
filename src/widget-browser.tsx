import { useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog";
import { useDockController } from "./docking/react";
import { dropReason, type Panel } from "./docking/core";
import { WIDGET_CATALOG } from "./widget-catalog";
import { WIDGET_IDS } from "./panel-layout";
import type { Workspace } from "./model";

/** Definitions create new IDs; the instance list moves the existing ID. */
export function WidgetBrowser({ workspace }: { workspace: Workspace }) {
  const { layout, policy, command, catalogTarget, openCatalog } = useDockController();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const matches = (value: string) => value.toLowerCase().includes(query.toLowerCase());
  const finish = (result: ReturnType<typeof command>) => { if (result.ok) { openCatalog(null); setQuery(""); setMessage(""); } else setMessage(result.reason); };
  return <Dialog open={!!catalogTarget} onOpenChange={(open) => { if (!open) openCatalog(null); }}><DialogContent className="station-widget-browser">
    <DialogHeader><DialogTitle>Add a widget</DialogTitle><DialogDescription>Create an instance in the chosen slot, or move an existing instance here.</DialogDescription></DialogHeader>
    <DialogBody><input autoFocus type="search" aria-label="Search widgets" placeholder="Search definitions and instances" value={query} onChange={(event) => setQuery(event.target.value)} />
      <h3>Widget definitions</h3><div className="station-definition-list">{WIDGET_IDS.filter((id) => matches(WIDGET_CATALOG[id].title + WIDGET_CATALOG[id].description)).map((id) => {
        const item = WIDGET_CATALOG[id], Icon = item.icon;
        const panel: Panel = { id: "preview", kind: "widget", widget: id, size: "standard", tags: ["widget"] };
        const reason = catalogTarget ? dropReason(layout, panel, catalogTarget, policy) : null;
        return <button type="button" key={id} disabled={!!reason} title={reason ?? `Create ${item.title}`} onClick={() => catalogTarget && finish(command({ type: "createWidget", widget: id, target: catalogTarget }))}>
          <Icon size={20} /><span><strong>{item.title}</strong><small>{item.description}</small><em>{item.preview}</em></span><span>Create</span></button>;
      })}
      {workspace.units.filter((unit) => unit.kind === "web-content" && matches(unit.name)).map((unit) => <button key={unit.id} onClick={() => catalogTarget && finish(command({ type: "createWebWidget", unitId: unit.id, target: catalogTarget }))}><span><strong>{unit.name}</strong><small>Authored web widget · isolated iframe</small></span><span>Create</span></button>)}
      </div><h3>Existing instances</h3><div className="station-instance-list">{Object.values(layout.panels).filter((panel) => {
        const name = panel.kind === "widget" ? WIDGET_CATALOG[panel.widget].title : "unitId" in panel ? workspace.units.find((unit) => unit.id === panel.unitId)?.name ?? panel.unitId : panel.kind;
        return matches(name);
      }).map((panel) => {
        const title = panel.kind === "widget" ? WIDGET_CATALOG[panel.widget].title : "unitId" in panel ? workspace.units.find((unit) => unit.id === panel.unitId)?.name ?? panel.unitId : panel.kind;
        const reason = catalogTarget ? dropReason(layout, panel, catalogTarget, policy) : null;
        return <button key={panel.id} disabled={!!reason} title={reason ?? "Move this instance"} onClick={() => catalogTarget && finish(command({ type: "move", panelId: panel.id, target: catalogTarget }))}><span><strong>{title}</strong><small>{panel.id}</small></span><span>{reason ?? "Move here"}</span></button>;
      })}</div><p role="status">{message}</p>
    </DialogBody></DialogContent></Dialog>;
}

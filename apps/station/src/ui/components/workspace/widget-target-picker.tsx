import { useState } from "react";
import { CircleDot, X } from "lucide-react";
import { SLOT_DRAG_TYPE, type SlotReference } from "../../../core/slot-reference";
import { resolveSlotReference } from "../../../core/docking";
import { widgetTargetSlots } from "../../../core/widget-targets";
import type { DockLayout } from "../../../core/docking";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/** Instance picker: definition assets are deliberately not valid targets. */
export function WidgetTargetPicker({ layout, value, onChange }: { layout: DockLayout; value?: SlotReference; onChange: (value: SlotReference | null) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [error, setError] = useState("");
  const options = widgetTargetSlots(layout);
  const choose = (ref: SlotReference) => { try { if (!resolveSlotReference(layout, ref)) throw new Error("Choose an existing slot in this desk"); onChange(ref); setOpen(false); setError(""); } catch (e) { setError(String(e)); } };
  return <div className="space-y-1" onDragOver={e => { if (e.dataTransfer.types.includes(SLOT_DRAG_TYPE)) { e.preventDefault(); e.stopPropagation(); } }} onDrop={e => { e.preventDefault(); e.stopPropagation(); try { const ref = JSON.parse(e.dataTransfer.getData(SLOT_DRAG_TYPE)); choose(ref); } catch { setError("Drop a slot reference from this desk"); } }}>
    <div className="flex items-center rounded border border-line p-1"><span className="min-w-0 flex-1 truncate text-xs">{value ? options.find(o => o.reference.nodeId === value.nodeId)?.label ?? "Missing target slot" : "Desk main slot"}</span><Popover open={open} onOpenChange={setOpen}><PopoverTrigger size="sm" variant="ghost" aria-label="Choose target slot"><CircleDot size={15} /></PopoverTrigger><PopoverContent className="space-y-2 p-3"><Input aria-label="Search target slots" value={query} onChange={e => setQuery(e.target.value)} /><div className="flex max-h-64 flex-col overflow-auto">{options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())).map(o => <Button key={o.reference.nodeId} draggable onDragStart={e => e.dataTransfer.setData(SLOT_DRAG_TYPE, JSON.stringify(o.reference))} size="sm" variant="ghost" className="justify-start truncate" onClick={() => choose(o.reference)}>{o.label}</Button>)}</div></PopoverContent></Popover><Button size="sm" variant="ghost" aria-label="Clear target slot" disabled={!value} onClick={() => onChange(null)}><X size={14} /></Button></div>
    {(error || (value && !resolveSlotReference(layout, value))) && <p role="alert" className="text-xs text-danger">{error || "Target slot was removed. Choose a new target."}</p>}
  </div>;
}

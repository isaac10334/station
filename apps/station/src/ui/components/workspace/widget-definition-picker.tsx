import type { WidgetDefinition } from "../../widget-catalog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "../ui/dropdown-menu";

/** A folder-aware definition choice, shared by child factories and instance controls.
 * The host resolves definitions; this control only reports the selected identity.
 */
export function WidgetDefinitionPicker({ label, value, items, onValueChange, emptyLabel }: {
  label: string; value: string; items: readonly WidgetDefinition[]; onValueChange: (id: string) => void; emptyLabel?: string;
}) {
  const groups = ["Layouts", "Apps", "Tools", "Assets"];
  const category = (item: WidgetDefinition) => item.provider !== "builtin" ? "Assets" : item.renderer === "layout" ? "Layouts" : ["builtin:capabilities", "builtin:docking-inspector"].includes(item.id) ? "Tools" : "Apps";
  return <DropdownMenu>
    <DropdownMenuTrigger size="sm" chevron aria-label={label} className="max-w-48 truncate">{items.find(item => item.id === value)?.title ?? emptyLabel ?? "Choose widget"}</DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {emptyLabel && <DropdownMenuItem onClick={() => onValueChange("")}>{emptyLabel}</DropdownMenuItem>}
      {groups.map(group => { const children = items.filter(item => category(item) === group); return !!children.length && <DropdownMenuSub key={group}>
        <DropdownMenuSubTrigger>{group}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>{children.map(item => { const Icon = item.icon; return <DropdownMenuItem key={item.id} icon={<Icon size={14} />} onClick={() => onValueChange(item.id)}>{item.title}</DropdownMenuItem>; })}</DropdownMenuSubContent>
      </DropdownMenuSub>; })}
    </DropdownMenuContent>
  </DropdownMenu>;
}

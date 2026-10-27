import { useState } from "react";
import { Check, Plus, Settings, Grip } from "../../lib/icons";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTrigger } from "../ui/popover";
import { numberError, SettledInput } from "../ui/settled-input";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

/** Appearance changes use the existing dock command owner. This control owns only
 * disclosure; presets and exact widths edit the same persisted value. */
export function DashboardControls({ width, editing, onWidth, onEditing, onAdd }: {
  width: number;
  editing: boolean;
  onWidth: (width: number) => void;
  onEditing: (editing: boolean) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <div className="flex shrink-0 flex-wrap items-center gap-2">
    <Button size="sm" variant="outline" onClick={onAdd}><Plus />Add widget</Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger size="md" variant="ghost" aria-label="Customize workspace"><Settings /><span>Customize</span></PopoverTrigger>
        <PopoverContent align="end" arrow={false} size="md">
          <PopoverHeader title="Customize workspace" description="Make room for the way you work." />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs text-fg-2"><span>Content width</span><span className="tabular-nums text-fg-3">{width}%</span></div>
            <ToggleGroup className="flex w-full [&>button]:flex-1" value={[String(width)]} required onValueChange={values => onWidth(Number(values[0]))} aria-label="Workspace content width">
              <ToggleGroupItem value="60">Focused</ToggleGroupItem>
              <ToggleGroupItem value="80">Balanced</ToggleGroupItem>
              <ToggleGroupItem value="100">Full</ToggleGroupItem>
            </ToggleGroup>
            <label className="flex items-center justify-between gap-3 text-xs text-fg-3">
              Exact width (%)
              <SettledInput className="w-20" label="Exact workspace width" value={String(width)} numeric={{ min: 40, max: 100 }} validate={text => numberError(text, 40, 100)} onCommit={text => onWidth(Number(text))} />
            </label>
          </div>
          <div className="border-t border-line pt-3">
            <Button className="w-full justify-start" variant="ghost" size="sm" onClick={() => { setOpen(false); onEditing(!editing); }}>{editing ? <Check /> : <Grip />}{editing ? "Finish arranging" : "Arrange widgets"}</Button>
            <p className="mt-1 px-3 text-xs leading-relaxed text-fg-3">Move widgets by their headings. Adjust a row from its lower edge.</p>
          </div>
        </PopoverContent>
      </Popover>
  </div>;
}

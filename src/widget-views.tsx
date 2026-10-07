import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Clock3, ShieldCheck } from "lucide-react";
import { Snake } from "@/components/games/snake";
import { HOST_CLOCK, HOST_FEED, HOST_LOG, HOST_SURFACE, type ComponentUnit, type WidgetId, type Workspace } from "./model";
import type { StackMode } from "./panel-layout";
import { WeatherWidget } from "./weather-widget";

export { WIDGET_CATALOG } from "./widget-catalog";
export type WidgetActions = {
  onOpenUnit: (id: string) => void;
  onOpenRun: (id: string) => void;
  onOpenBrowser: () => void;
  onNewUnit: () => void;
  onGrant: (id: string, capability: string, granted: boolean) => void;
};

function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  return <div className="clock-widget"><div className="clock-disc"><Clock3 size={29} strokeWidth={1.5} /></div>
    <span className="clock-date">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now)}</span>
    <strong className="clock-time">{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(now)}</strong>
    <span className="clock-zone">{Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ")}</span></div>;
}

/** Built-in React content; dock placement does not grant Component authority. */
export function WidgetView({ id, workspace, actions }: { id: WidgetId; workspace: Workspace; actions: WidgetActions }) {
  if (id === "weather") return <WeatherWidget />;
  if (id === "clock") return <ClockWidget />;
  if (id === "stack") return null; // Layout content is rendered by the shared dock node renderer.
  if (id === "snake") return <div className="snake-widget"><Snake autoFocus={false} captureGlobalKeys={false} persistHighScore={`unit-workspace.snake.${workspace.id}`} /><p>Focus the game to use arrow keys. Built-in React widget.</p></div>;
  const selected = workspace.units.find((unit): unit is ComponentUnit => unit.kind === "component" && unit.id === workspace.selectedUnitId)
    ?? workspace.units.find((unit): unit is ComponentUnit => unit.kind === "component");
  return selected ? <div className="capability-widget"><div className="capability-for"><ShieldCheck size={16} /><span>Grants for <strong>{selected.name}</strong></span></div>
    {[[HOST_LOG, "Host logging", "Append messages to the run log"], [HOST_FEED, "Async feed", "Supply a future and stream"], [HOST_SURFACE, "Text surface", "Write to the bounded text surface"], [HOST_CLOCK, "P3 clock", "Read monotonic time"]].map(([capability, label, detail]) => <label key={capability} className="capability-row"><span><strong>{label}</strong><small>{detail}</small><code>{capability}</code></span><input type="checkbox" checked={Boolean(selected.grants[capability])} onChange={(event) => actions.onGrant(selected.id, capability, event.currentTarget.checked)} /></label>)}
    <button type="button" className="widget-footer-link" onClick={() => actions.onOpenRun(selected.id)}>Test invocation <ArrowRight size={14} /></button></div> : <p className="widget-empty">Create a Component to inspect its grants.</p>;
}

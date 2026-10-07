import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Activity, ArrowLeft, ArrowRight, Clock3, CloudSun, Layers3, ShieldCheck, Sparkles, Check } from "lucide-react";
import { Snake } from "@/components/games/snake";
import { HOST_CLOCK, HOST_FEED, HOST_LOG, HOST_SURFACE, type ComponentUnit, type WidgetId, type Workspace } from "./model";
import type { StackMode } from "./panel-layout";
import { WeatherWidget } from "./weather-widget";

export const WIDGET_CATALOG: Record<WidgetId, { title: string; description: string; icon: typeof Activity }> = {
  weather: { title: "Weather", description: "A six-hour forecast for your location", icon: CloudSun },
  clock: { title: "Local time", description: "The time and date, always in sync", icon: Clock3 },
  capabilities: { title: "Capability inspector", description: "Review explicit Component grants", icon: ShieldCheck },
  stack: { title: "Widget stack", description: "Quick views in a carousel or tabs", icon: Layers3 },
  snake: { title: "Snake", description: "A small keyboard game", icon: Activity },
};
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

const stackPages = ["Overview", "Capabilities", "Create"] as const;
function StackWidget({ workspace, actions, mode }: { workspace: Workspace; actions: WidgetActions; mode: StackMode }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [instant, setInstant] = useState(false);
  const reducedMotion = useReducedMotion();
  const gestureStart = useRef<number | null>(null);
  const move = (step: number, byKeyboard = false) => { setDirection(step); setInstant(byKeyboard); setIndex((current) => (current + step + stackPages.length) % stackPages.length); };
  const selectPage = (next: number, byKeyboard = false) => { setDirection((next - index + stackPages.length) % stackPages.length <= stackPages.length / 2 ? 1 : -1); setInstant(byKeyboard); setIndex(next); };
  const components = workspace.units.filter((unit): unit is ComponentUnit => unit.kind === "component");
  const page = stackPages[index];
  const pageContent = page === "Overview"
    ? <><Sparkles size={23} /><strong>{workspace.units.length} units in {workspace.name}</strong><p>Your built-in widgets and authored units live together on this page.</p><button type="button" onClick={actions.onOpenBrowser}>Browse units <ArrowRight size={14} /></button></>
    : page === "Capabilities"
    ? <><ShieldCheck size={23} /><strong>{components.length} Component{components.length === 1 ? "" : "s"}</strong><p>Grants are held by each Component. Open one to inspect its permissions and run status.</p><button type="button" onClick={actions.onOpenBrowser}>Open unit browser <ArrowRight size={14} /></button></>
    : <><Check size={23} /><strong>Make something new</strong><p>Add a Component, then build and run its current source with explicit grants.</p><button type="button" onClick={actions.onNewUnit}>New Component <ArrowRight size={14} /></button></>;
  return <div className={`stack-widget stack-widget-${mode}`}>
    {mode === "tabs" && <div className="stack-tabs" role="tablist" aria-label="Stack views">{stackPages.map((name, next) => <button type="button" key={name} role="tab" aria-selected={index === next} tabIndex={index === next ? 0 : -1} className={index === next ? "active" : ""} onClick={() => setIndex(next)} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); const target = (index + (event.key === "ArrowRight" ? 1 : stackPages.length - 1)) % stackPages.length; setIndex(target); (event.currentTarget.parentElement?.children[target] as HTMLElement)?.focus(); } }}>{name}</button>)}</div>}
    <div className="stack-viewport" onPointerDown={(event) => { if (mode === "carousel" && !(event.target as HTMLElement).closest("button")) { gestureStart.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerUp={(event) => { if (gestureStart.current !== null && Math.abs(event.clientX - gestureStart.current) > 40) move(event.clientX < gestureStart.current ? 1 : -1); gestureStart.current = null; }} onPointerCancel={() => { gestureStart.current = null; }}>
      <AnimatePresence mode={mode === "carousel" ? "sync" : "wait"} custom={{ direction, instant: reducedMotion || instant }} initial={false}><motion.div key={page} className="stack-page" role={mode === "tabs" ? "tabpanel" : "group"} aria-label={page}
        custom={{ direction, instant: reducedMotion || instant }}
        variants={{ enter: ({ direction: step, instant: skip }: { direction: number; instant: boolean }) => ({ opacity: skip ? 1 : 0.75, x: mode === "carousel" && !skip ? `${step * 100}%` : 0 }), center: { opacity: 1, x: 0 }, exit: ({ direction: step, instant: skip }: { direction: number; instant: boolean }) => ({ opacity: skip ? 1 : 0.75, x: mode === "carousel" && !skip ? `${step * -100}%` : 0 }) }}
        initial="enter" animate="center" exit="exit" transition={{ duration: reducedMotion || instant ? 0 : mode === "carousel" ? .32 : .16, ease: [0.76, 0, 0.24, 1] }}>{pageContent}</motion.div></AnimatePresence>
      {mode === "carousel" && <div className="stack-carousel-controls"><button type="button" aria-label="Previous view" onClick={(event) => move(-1, event.detail === 0)}><ArrowLeft size={17} /></button><button type="button" aria-label="Next view" onClick={(event) => move(1, event.detail === 0)}><ArrowRight size={17} /></button></div>}
    </div>
    {mode === "carousel" && <div className="stack-carousel-footer"><div className="stack-dots" aria-label="Select view">{stackPages.map((name, next) => <button type="button" key={name} aria-label={`Show ${name}`} aria-current={index === next ? "true" : undefined} onClick={(event) => selectPage(next, event.detail === 0)} />)}</div><span aria-live="polite">{String(index + 1).padStart(2, "0")} / {String(stackPages.length).padStart(2, "0")}</span></div>}
  </div>;
}

/** Built-in React content; dock placement does not grant Component authority. */
export function WidgetView({ id, workspace, actions, stackMode = "carousel" }: { id: WidgetId; workspace: Workspace; actions: WidgetActions; stackMode?: StackMode }) {
  if (id === "weather") return <WeatherWidget />;
  if (id === "clock") return <ClockWidget />;
  if (id === "stack") return <StackWidget workspace={workspace} actions={actions} mode={stackMode} />;
  if (id === "snake") return <div className="snake-widget"><Snake autoFocus={false} captureGlobalKeys={false} persistHighScore={`unit-workspace.snake.${workspace.id}`} /><p>Focus the game to use arrow keys. Built-in React widget.</p></div>;
  const selected = workspace.units.find((unit): unit is ComponentUnit => unit.kind === "component" && unit.id === workspace.selectedUnitId)
    ?? workspace.units.find((unit): unit is ComponentUnit => unit.kind === "component");
  return selected ? <div className="capability-widget"><div className="capability-for"><ShieldCheck size={16} /><span>Grants for <strong>{selected.name}</strong></span></div>
    {[[HOST_LOG, "Host logging", "Append messages to the run log"], [HOST_FEED, "Async feed", "Supply a future and stream"], [HOST_SURFACE, "Text surface", "Write to the bounded text surface"], [HOST_CLOCK, "P3 clock", "Read monotonic time"]].map(([capability, label, detail]) => <label key={capability} className="capability-row"><span><strong>{label}</strong><small>{detail}</small><code>{capability}</code></span><input type="checkbox" checked={Boolean(selected.grants[capability])} onChange={(event) => actions.onGrant(selected.id, capability, event.currentTarget.checked)} /></label>)}
    <button type="button" className="widget-footer-link" onClick={() => actions.onOpenRun(selected.id)}>Test invocation <ArrowRight size={14} /></button></div> : <p className="widget-empty">Create a Component to inspect its grants.</p>;
}

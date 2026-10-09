import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { Snake } from "@/components/games/snake";
import { type WidgetId, type Workspace } from "./model";
import { CapabilityInspector } from "./capability-inspector";
import { workspaceClock, type WorkspaceCapabilityRuntime } from "./workspace-capabilities";
import { WeatherWidget } from "./weather-widget";
import { AIChatWidget } from "./ai-chat-widget";

export { WIDGET_CATALOG } from "./widget-catalog";
export type WidgetActions = {
  capabilities: WorkspaceCapabilityRuntime;
  onOpenAsset: (id: string) => void;
  onOpenRun: (id: string) => void;
  onOpenBrowser: () => void;
  onNewAsset: () => void;
  onGrant: (id: string, capability: string, granted: boolean) => void;
};

function ClockWidget({ workspaceId, runtime }: { workspaceId: string; runtime: WorkspaceCapabilityRuntime }) {
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState("");
  useEffect(() => {
    const scope = runtime.openScope(workspaceId, "Widget · Local time");
    let mounted = true;
    setError("");
    void scope.acquire(workspaceClock).then(handle => {
      if (!mounted || handle.signal.aborted) return;
      setNow(new Date(handle.value.now()));
      handle.value.every(1000, time => { if (mounted) setNow(new Date(time)); });
    }).catch(reason => { if (mounted) setError(String(reason)); });
    return () => { mounted = false; void scope.revoke().catch(console.error); };
  }, [workspaceId, runtime]);
  return <div className="clock-widget"><div className="clock-disc"><Clock3 size={29} strokeWidth={1.5} /></div>
    <span className="clock-date">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now)}</span>
    <strong className="clock-time">{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(now)}</strong>
    <span className="clock-zone">{Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ")}</span>{error && <p role="alert">{error}</p>}</div>;
}

/** Built-in React content; dock placement does not grant Component authority. */
export function WidgetView({ id, instanceId, workspace, actions }: { id: WidgetId; instanceId: string; workspace: Workspace; actions: WidgetActions }) {
  if (id === "ai-chat") return <AIChatWidget key={`${workspace.id}:${instanceId}`} workspaceId={workspace.id} instanceId={instanceId} runtime={actions.capabilities} />;
  if (id === "weather") return <WeatherWidget />;
  if (id === "clock") return <ClockWidget workspaceId={workspace.id} runtime={actions.capabilities} />;
  if (id === "stack") return null; // Layout content is rendered by the shared dock node renderer.
  if (id === "snake") return <div className="snake-widget"><Snake autoFocus={false} captureGlobalKeys={false} persistHighScore={`unit-workspace.snake.${workspace.id}`} /><p>Focus the game to use arrow keys. Built-in React widget.</p></div>;
  if (id === "capabilities") return <CapabilityInspector workspace={workspace} actions={actions} runtime={actions.capabilities} />;
  return null;
}

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { BUILTIN_AUTHORED_SURFACES, type AuthoredSurface } from "../../../core/authored-surface";
import { AuthoredSurfaceView } from "./authored-surface";
import { createClockController } from "../../../features/clock/application/controller";
import type { WorkspaceCapabilityRuntime } from "../../../contracts/widget-runtime";
import { AdaptiveWidgetSurface } from "./adaptive-widget-surface";
/** Presentation retains its controller while DockLayout moves the instance. */
export function ClockWidget({ workspaceId, runtime, surface = BUILTIN_AUTHORED_SURFACES.clock }: { workspaceId: string; runtime: WorkspaceCapabilityRuntime; surface?: AuthoredSurface }) {
  const controller = useMemo(() => createClockController(runtime, workspaceId), [runtime, workspaceId]);
  useEffect(() => controller.start(), [controller]);
  const { now, error } = useSyncExternalStore(controller.subscribe, controller.get);
  return <AdaptiveWidgetSurface><AuthoredSurfaceView surface={surface} inputs={{ date: new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now), time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(now), zone: Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " "), error }} /></AdaptiveWidgetSurface>;
}

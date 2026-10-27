import type { Host } from "@loop-kit/host";
import type { LifecycleDiagnostics, LifecycleEvent } from "../contracts/command-ports";
export type { LifecycleEvent } from "../contracts/command-ports";
/** Bounded session history of lifecycle metadata. No service values, arguments,
 * source, credentials or invocation results are retained. Dispose with the host.
 */
export function createLifecycleTelemetry(host: Host) {
  let sequence = 0;
  const events: LifecycleEvent[] = [];
  let previous = new Map<string, { kind: string; label: string; state: string }>();
  const capture = () => {
    const snapshot = host.inspect();
    const current = new Map<string, { kind: string; label: string; state: string }>();
    for (const scope of snapshot.scopes) {
      current.set(scope.id, { kind: "scope", label: scope.name, state: scope.state });
      for (const use of scope.acquisitions) current.set(use.id, { kind: "acquisition", label: use.capabilityId, state: use.state });
    }
    snapshot.providers.forEach((provider, index) => current.set(`provider:${provider.capabilityId}:${provider.version}:${index}`, { kind: "provider", label: provider.name, state: provider.state }));
    for (const [subjectId, item] of current) if (previous.get(subjectId)?.state !== item.state) events.push({ sequence: ++sequence, at: Date.now(), subjectId, ...item });
    for (const [subjectId, item] of previous) if (!current.has(subjectId)) events.push({ sequence: ++sequence, at: Date.now(), subjectId, ...item, state: "disposed" });
    if (events.length > 1000) events.splice(0, events.length - 1000);
    previous = current;
  };
  capture(); const unsubscribe = host.subscribe(capture);
  return {
    inspect(): LifecycleDiagnostics { const snapshot = host.inspect(); return { state: snapshot.state, providers: snapshot.providers.length, scopes: snapshot.scopes.length, acquisitions: snapshot.scopes.reduce((n, s) => n + s.acquisitions.length, 0), events: [...events] }; },
    dispose() { unsubscribe(); events.length = 0; previous.clear(); },
  };
}

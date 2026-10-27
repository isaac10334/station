/** Root-renderer broker adapter. The owner credential never enters SDK bindings,
 * model tools, assets or command results. Application task contexts stay local.
 */
import type { createStationControl } from "../features/commands/application/runtime";
import { ControlError } from "@station/protocol";
import { rootDesktopCredential } from "./root-credential";
let connection: { post: (path: string, body: unknown) => Promise<any> } | null =
  null;
type ConnectionTarget = { origin: string; instanceId: string; rendererId: string; epoch: string };
let target: ConnectionTarget | null = null;
const listeners = new Set<() => void>();
/** Redacted routing identity only. Account credentials and connection secrets never enter UI. */
export const agentControlTarget = { get: () => target, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
export async function connectAgentControl(
  control: ReturnType<typeof createStationControl>,
) {
  const native = await rootDesktopCredential();
  const token =
    native ??
    (await fetch("/api/control-bootstrap")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => v?.token));
  if (!token) return;
  const abort = new AbortController();
  let rendererId: string | undefined;
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`/api/control/owner/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-station-control": token,
        ...(rendererId ? {"x-station-renderer": rendererId} : {}),
      },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "Broker unavailable");
    return value;
  };
  const registered = await post("register", {
    epoch: control.epoch,
    workspaceId: control.inspect().workspace.id,
  });
  rendererId = registered.rendererId;
  target = { origin: location.origin, instanceId: registered.instanceId, rendererId: registered.rendererId, epoch: control.epoch };
  for (const listener of listeners) listener();
  connection = { post };
  const stop = () => {
    void fetch('/api/control/owner/unregister', {method:'POST',keepalive:true,headers:{'Content-Type':'application/json','x-station-control':token,'x-station-renderer':rendererId!},body:'{}'}).catch(()=>{});
    abort.abort();
    connection = null;
    target = null;
    for (const listener of listeners) listener();
  };
  window.addEventListener("pagehide", stop, { once: true });
  void (async () => {
    let replies: { id: string; response: unknown }[] = [];
    while (!abort.signal.aborted) {
      const body = await post("poll", { replies });
      replies = body.jobs.map((job: any) => {
        try {
          if (job.expiresAt <= Date.now()) throw new Error("Command expired");
          return {
            id: job.id,
            response: {
              ok: true,
              ...control.executeFor(
                control.contextForTask(job.taskId),
                job.request,
              ),
            },
          };
        } catch (error) {
          return {
            id: job.id,
            response: {
              ok: false,
              error: {
                code:
                  error instanceof ControlError
                    ? error.code
                    : "invalid_request",
                message:
                  error instanceof Error ? error.message : "Invalid request",
                ...(error instanceof ControlError && error.details
                  ? { details: error.details }
                  : {}),
              },
            },
          };
        }
      });
      if (!replies.length)
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
  })().catch((error) => {
    if (!abort.signal.aborted)
      console.error("Agent control disconnected", error);
    stop();
  });
  return stop;
}
/** Called exclusively by trusted consent UI after issuing an application task. */
export async function pairAgentTask(taskId: string, expiresAt: number) {
  if (!connection)
    throw new Error(
      "Live control unavailable. Start an isolated development server with STATION_AGENT_CONTROL=1 or use the desktop build.",
    );
  return connection.post("pair", { taskId, expiresAt }) as Promise<{
    code: string;
    expiresAt: number;
  }>;
}
export async function revokeAgentTask(taskId: string) {
  if (connection) await connection.post("revoke", { taskId });
}
export async function renewAgentTask(taskId: string) {
  if (connection) await connection.post("renew", { taskId });
}
/** Explicit owner action stores a paired lease under an OS-restricted directory.
 * Only a path is returned to the UI; no reusable credential is rendered.
 */
export async function saveAgentConnection(
  code: string,
): Promise<{ credentialFile: string }> {
  if (!connection) throw new Error("Broker unavailable");
  return connection.post("export", { code });
}

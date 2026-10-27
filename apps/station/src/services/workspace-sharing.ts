import type { Store } from "../features/workspace/application/store";
import {
  sharedSource,
  sharedSourceSchema,
  sameFiles,
  conflictAsset,
  type SharedSource,
  type Participant,
} from "../core/workspace-sharing";
import { assetFiles } from "../core/source-project";

export interface SharingSnapshot {
  status: "offline" | "connecting" | "connected";
  role: Participant["role"] | null;
  memberId: string | null;
  workspaceId: string | null;
  invite: string | null;
  participants: Participant[];
  error: string;
  name: string;
}
/** A room connection owns subscriptions/presence. Transport never grants execution authority.
 * Concurrent local source is forked before accepting a conflicting authoritative update.
 */
export function createWorkspaceSharing(store: Store) {
  let snapshot: SharingSnapshot = {
    status: "offline",
    role: null,
    memberId: null,
    workspaceId: null,
    invite: null,
    participants: [],
    error: "",
    name: "",
  };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<SharingSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((fn) => fn());
  };
  let socket: WebSocket | null = null,
    confirmed = new Map<string, SharedSource>(),
    pending = new Map<string, Record<string, string>>(),
    applying = false,
    unsubscribe: (() => void) | null = null,
    heartbeat: ReturnType<typeof setInterval> | null = null,
    lastPresence = 0,
    resync = false;
  const send = (value: unknown) => {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(value));
  };
  const disconnect = () => {
    if (snapshot.workspaceId) store.setSourceAccess(snapshot.workspaceId, true);
    unsubscribe?.();
    unsubscribe = null;
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    socket?.close();
    socket = null;
    pending.clear();
    confirmed.clear();
    resync = false;
    update({
      status: "offline",
      role: null,
      memberId: null,
      workspaceId: null,
      invite: null,
      participants: [],
    });
  };
  const flush = () => {
    if (
      applying ||
      snapshot.status !== "connected" ||
      snapshot.role === "viewer"
    )
      return;
    const workspace = store
      .get()
      .workspaces.find((workspace) => workspace.id === snapshot.workspaceId);
    if (!workspace) return;
    for (const source of confirmed.values()) {
      const local = workspace.assets.find((asset) => asset.id === source.id);
      if (
        !local ||
        pending.has(source.id) ||
        sameFiles(assetFiles(local), source.files)
      )
        continue;
      const files = { ...assetFiles(local) };
      pending.set(source.id, files);
      send({
        type: "files",
        assetId: source.id,
        expectedRevision: source.revision,
        files,
      });
    }
  };
  const connect = (
    room: string,
    token: string,
    name: string,
    workspaceId: string | null,
    invite: string | null,
  ) => {
    disconnect();
    update({ status: "connecting", workspaceId, invite, error: "", name });
    const current = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/share/connect`,
    );
    socket = current;
    current.onopen = () =>
      send({ type: "join", room, token, name, kind: "human" });
    current.onmessage = (event) => {
      if (socket !== current) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === "joined") {
          update({ role: message.member.role, memberId: message.member.id });
          return;
        }
        if (message.type === "presence") {
          update({ participants: message.participants });
          return;
        }
        if (message.type === "error") {
          resync = true;
          update({ error: message.message });
          return;
        }
        if (message.type !== "snapshot") return;
        const sources: SharedSource[] = message.sources.map((source: unknown) =>
          sharedSourceSchema.parse(source),
        );
        applying = true;
        try {
          let workspaceId = snapshot.workspaceId;
          if (!workspaceId) {
            workspaceId = store.joinSharedWorkspace(message.name, sources);
            update({ workspaceId });
          }
          const workspace = store
            .get()
            .workspaces.find((workspace) => workspace.id === workspaceId)!;
          const accepted: SharedSource[] = [];
          for (const source of sources) {
            const previous = confirmed.get(source.id),
              local = workspace.assets.find((asset) => asset.id === source.id),
              sent = pending.get(source.id);
            const acknowledgement =
              message.origin === snapshot.memberId &&
              sent &&
              sameFiles(source.files, sent);
            const changed = !previous || previous.revision !== source.revision;
            if (
              local &&
              previous &&
              changed &&
              !sameFiles(assetFiles(local), previous.files) &&
              !acknowledgement
            ) {
              const fork = conflictAsset(local);
              store.importAssets([fork]);
              update({
                error: `Concurrent changes: your draft was preserved as ${fork.name}.`,
              });
            }
            if (acknowledgement) {
              pending.delete(source.id);
              if (local && !sameFiles(assetFiles(local), sent!)) {
                confirmed.set(source.id, source);
                continue;
              }
            } else if (sent && resync) {
              pending.delete(source.id);
              if (
                local &&
                !sameFiles(assetFiles(local), source.files) &&
                !changed
              ) {
                const fork = conflictAsset(local);
                store.importAssets([fork]);
              }
            }
            if (changed || (resync && sent)) accepted.push(source);
            confirmed.set(source.id, source);
          }
          if (accepted.length) store.applySharedSources(workspaceId, accepted);
          store.setSourceAccess(
            workspaceId,
            snapshot.role !== "viewer",
            sources.map((source) => source.id),
          );
          resync = false;
          update({ status: "connected", participants: message.participants });
        } finally {
          applying = false;
        }
        flush();
      } catch {
        update({
          error: "The sharing connection sent invalid data. Sharing stopped.",
        });
        disconnect();
      }
    };
    current.onclose = () => {
      if (socket === current) {
        const error =
          snapshot.status === "connected"
            ? "Sharing ended. Your local workspace copy remains available."
            : "Could not connect. The invitation may have expired or the server is unavailable.";
        disconnect();
        update({ error });
      }
    };
    current.onerror = () =>
      update({
        error:
          "Sharing server unavailable. Use Station's Bun development server.",
      });
    unsubscribe = store.subscribe(() => {
      if (store.active().id !== snapshot.workspaceId && snapshot.workspaceId) {
        disconnect();
        return;
      }
      flush();
    });
    heartbeat = setInterval(() => send({ type: "ping" }), 20000);
  };
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => snapshot,
    async host(name: string, role: "viewer" | "editor") {
      const workspace = store.active();
      const response = await fetch("/api/share/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workspace.name,
          sources: workspace.assets.map(sharedSource),
          role,
        }),
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error(
          "Sharing requires Station’s Bun web server. Run bun run dev and open its web address.",
        );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Sharing is unavailable");
      const invite = `${location.origin}${location.pathname}#share=${result.room}.${result.invite}`;
      connect(result.room, result.owner, name, workspace.id, invite);
    },
    join(invitation: string, name: string) {
      const url = new URL(invitation, location.href),
        match = url.hash.match(/^#share=([\w-]+)\.([\w-]+)$/);
      if (!match || url.origin !== location.origin)
        throw new Error("Open this invitation on its Station server");
      connect(match[1], match[2], name, null, null);
      history.replaceState(null, "", location.pathname + location.search);
    },
    presence(x: number, y: number) {
      if (snapshot.status !== "connected" || Date.now() - lastPresence < 80)
        return;
      lastPresence = Date.now();
      send({
        type: "presence",
        value: {
          desk: store.desk().name,
          cursor: {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y)),
            assetId: confirmed.has(store.selected()?.id ?? "")
              ? store.selected()?.id
              : undefined,
          },
        },
      });
    },
    stop() {
      if (snapshot.role === "owner") send({ type: "stop" });
      disconnect();
    },
  };
}

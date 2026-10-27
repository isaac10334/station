import type { VectorCommand, VectorCommandInfo } from "../core/vector-editor";
/** A mounted editor lends a bounded document port, never its Window or vendor API.
 * Keys include workspace/desk/panel identity. Unmount closes the registration;
 * it cannot resurrect a controller after replacement or application disposal. */
export type VectorEditorSession = {
  workspaceId: string; assetId: string; panelId: string; revision: number;
  commands(signal: AbortSignal): Promise<VectorCommandInfo[]>;
  execute(command: VectorCommand, signal: AbortSignal): Promise<unknown>;
  export(signal: AbortSignal): Promise<{ source: string }>;
};
export function createVectorEditorSessions() {
  const sessions = new Map<string, VectorEditorSession>();
  const key = (workspaceId: string, panelId: string) => `${workspaceId}:${panelId}`;
  return {
    register(session: VectorEditorSession) {
      const id = key(session.workspaceId, session.panelId);
      sessions.set(id, session);
      return () => { if (sessions.get(id) === session) sessions.delete(id); };
    },
    get(workspaceId: string, panelId: string, assetId: string, revision: number) {
      const session = sessions.get(key(workspaceId, panelId));
      if (!session || session.assetId !== assetId) throw new Error("Open this asset with VectorCraft first");
      if (session.revision !== revision) throw new Error("Saved source changed. Reload the editor before issuing commands");
      return session;
    },
    dispose() { sessions.clear(); },
  };
}

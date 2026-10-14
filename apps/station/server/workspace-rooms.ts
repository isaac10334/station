import type { Server, ServerWebSocket } from "bun";
import {
  WorkspaceRoom,
  roomSeedSchema,
  type ParticipantRole,
} from "../src/core/workspace-sharing";
import { z } from "zod";
export interface ShareSocketData {
  room?: string;
  member?: string;
  authenticated?: boolean;
  window: number;
  count: number;
  timer?: ReturnType<typeof setTimeout>;
}
/** In-memory, same-origin invitation server. TLS is deployment-owned; this is not E2E encryption. */
export function createWorkspaceRooms() {
  const rooms = new Map<
    string,
    {
      room: WorkspaceRoom;
      owner: string;
      invite: string;
      role: ParticipantRole;
      expires: number;
      sockets: Set<ServerWebSocket<ShareSocketData>>;
    }
  >();
  let connections = 0;
  const send = (socket: ServerWebSocket<ShareSocketData>, value: unknown) =>
    socket.send(JSON.stringify(value));
  const emit = (id: string, origin?: string) => {
    const entry = rooms.get(id);
    if (entry)
      for (const socket of entry.sockets) {
        if (socket.getBufferedAmount() > 4_000_000)
          socket.close(1008, "Connection cannot keep up");
        else
          send(socket, { type: "snapshot", ...entry.room.snapshot(), origin });
      }
  };
  const stop = (id: string) => {
    const entry = rooms.get(id);
    if (!entry) return;
    rooms.delete(id);
    for (const socket of entry.sockets) socket.close(1000, "Sharing ended");
  };
  return {
    async fetch(
      request: Request,
      server: Server<ShareSocketData>,
    ): Promise<Response | undefined> {
      const url = new URL(request.url);
      const expectedOrigin = process.env.STATION_PUBLIC_ORIGIN
        ? new URL(process.env.STATION_PUBLIC_ORIGIN).origin
        : url.origin;
      if (request.headers.get("origin") !== expectedOrigin)
        return new Response("Forbidden", { status: 403 });
      if (url.pathname === "/api/share/connect")
        return connections < 32 &&
          server.upgrade(request, { data: { window: Date.now(), count: 0 } })
          ? undefined
          : new Response("Connection unavailable", { status: 503 });
      if (url.pathname !== "/api/share/create" || request.method !== "POST")
        return new Response("Not found", { status: 404 });
      try {
        for (const [id, entry] of rooms)
          if (entry.expires < Date.now()) stop(id);
        if (rooms.size >= 8) throw new Error("Too many active rooms");
        if (Number(request.headers.get("content-length") ?? 0) > 2_000_000)
          throw new Error("Workspace is too large for this prototype");
        const text = await request.text();
        if (text.length > 2_000_000)
          throw new Error("Workspace is too large for this prototype");
        const seed = roomSeedSchema.parse(JSON.parse(text));
        const id = crypto.randomUUID(),
          owner = crypto.randomUUID() + crypto.randomUUID(),
          invite = crypto.randomUUID() + crypto.randomUUID();
        rooms.set(id, {
          room: new WorkspaceRoom(seed.name, seed.sources),
          owner,
          invite,
          role: seed.role,
          expires: Date.now() + 60 * 60 * 1000,
          sockets: new Set(),
        });
        return Response.json(
          { room: id, owner, invite },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Invalid room" },
          { status: 400 },
        );
      }
    },
    websocket: {
      maxPayloadLength: 2_000_000,
      idleTimeout: 70,
      open(socket: ServerWebSocket<ShareSocketData>) {
        connections++;
        socket.data.timer = setTimeout(() => {
          if (!socket.data.authenticated)
            socket.close(1008, "Invitation required");
        }, 5000);
      },
      message(
        socket: ServerWebSocket<ShareSocketData>,
        message: string | Buffer,
      ) {
        try {
          if (Date.now() - socket.data.window > 1000) {
            socket.data.window = Date.now();
            socket.data.count = 0;
          }
          if (++socket.data.count > 40) {
            socket.close(1008, "Message rate exceeded");
            return;
          }
          const value = JSON.parse(String(message));
          if (!socket.data.authenticated) {
            const join = z
              .object({
                type: z.literal("join"),
                room: z.string(),
                token: z.string(),
                name: z.string().max(48),
                kind: z.enum(["human", "agent"]).default("human"),
              })
              .strict()
              .parse(value);
            const entry = rooms.get(join.room);
            if (
              !entry ||
              entry.expires < Date.now() ||
              (join.token !== entry.owner && join.token !== entry.invite)
            )
              throw new Error("Invitation is invalid or expired");
            const role = join.token === entry.owner ? "owner" : entry.role;
            if (
              role === "owner" &&
              [...entry.room.members.values()].some((m) => m.role === "owner")
            )
              throw new Error("Owner is already connected");
            const member = entry.room.join(role, join.name, join.kind);
            socket.data.room = join.room;
            socket.data.member = member.id;
            socket.data.authenticated = true;
            clearTimeout(socket.data.timer);
            entry.sockets.add(socket);
            send(socket, { type: "joined", member });
            emit(join.room);
            return;
          }
          const id = socket.data.room!,
            entry = rooms.get(id);
          if (entry && entry.expires < Date.now()) stop(id);
          if (
            !entry ||
            entry.expires < Date.now() ||
            !entry.room.members.has(socket.data.member!)
          )
            throw new Error("Room closed");
          if (value.type === "files") {
            const edit = z
              .object({
                type: z.literal("files"),
                assetId: z.string(),
                expectedRevision: z.number().int().nonnegative(),
                files: z.record(z.string(), z.string()),
              })
              .strict()
              .parse(value);
            entry.room.replaceFiles(
              socket.data.member!,
              edit.assetId,
              edit.expectedRevision,
              edit.files,
            );
            emit(id, socket.data.member);
          } else if (value.type === "presence") {
            entry.room.presence(socket.data.member!, value.value);
            for (const peer of entry.sockets)
              if (peer.getBufferedAmount() < 65536)
                send(peer, {
                  type: "presence",
                  participants: [...entry.room.members.values()],
                });
          } else if (
            value.type === "stop" &&
            entry.room.members.get(socket.data.member!)?.role === "owner"
          )
            stop(id);
          else if (value.type !== "ping")
            throw new Error("Operation is not granted");
        } catch (error) {
          send(socket, {
            type: "error",
            message: error instanceof Error ? error.message : "Invalid message",
          });
          if (socket.data.room) emit(socket.data.room);
          else socket.close(1008, "Authorization failed");
        }
      },
      close(socket: ServerWebSocket<ShareSocketData>) {
        connections--;
        clearTimeout(socket.data.timer);
        const entry = rooms.get(socket.data.room!);
        if (!entry) return;
        entry.sockets.delete(socket);
        const owner =
          entry.room.members.get(socket.data.member!)?.role === "owner";
        entry.room.members.delete(socket.data.member!);
        if (owner) stop(socket.data.room!);
        else emit(socket.data.room!);
      },
    },
  };
}

import { z } from "zod";
import { validSourcePath, assetFiles } from "./source-project";
import type { Asset } from "./asset-state";

/** Source-only wire data. Executable artifacts, installations and grants never enter a room. */
export const sharedSourceSchema = z
  .object({
    id: z.string().min(1).max(160),
    kind: z.enum(["component", "web-content", "theme", "package", "widget-definition", "desk-template", "svg", "decision", "data-source", "script", "custom", "markdown", "note"]),
    name: z.string().min(1).max(120),
    description: z.string().max(2000),
    revision: z.number().int().nonnegative(),
    files: z
      .record(z.string().refine(validSourcePath), z.string().max(262144))
      .refine((files) => Object.keys(files).length <= 128),
  })
  .strict();
export type SharedSource = z.infer<typeof sharedSourceSchema>;
export const roomSeedSchema = z
  .object({
    name: z.string().min(1).max(120),
    sources: z.array(sharedSourceSchema).max(64),
    role: z.enum(["viewer", "editor"]),
  })
  .strict();
export type ParticipantRole = "owner" | "editor" | "viewer";
export interface Participant {
  id: string;
  name: string;
  kind: "human" | "agent";
  role: ParticipantRole;
  desk: string;
  cursor: null | { x: number; y: number; assetId?: string };
}
export function sharedSource(asset: Asset): SharedSource {
  return sharedSourceSchema.parse({
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    description: asset.description,
    revision: asset.revision,
    files: assetFiles(asset),
  });
}
export function sourceAsset(source: SharedSource, existing?: Asset): Asset {
  const base = {
    ...source,
    instanceId: existing?.instanceId ?? crypto.randomUUID(),
    // Wire revisions authorize room writes. Local revisions remain monotonic so
    // a delayed acknowledgement cannot resurrect an old Component artifact.
    revision: existing
      ? existing.revision +
        Number(
          existing.kind !== source.kind ||
            !sameFiles(assetFiles(existing), source.files),
        )
      : source.revision,
    name: existing?.name ?? source.name,
    description: existing?.description ?? source.description,
  };
  if (source.kind === "component")
    return {
      ...base,
      kind: "component",
      language: "rust",
      grants: existing?.kind === "component" ? existing.grants : {},
      artifact: existing?.kind === "component" ? existing.artifact : null,
    };
  if (source.kind === "web-content")
    return {
      ...base,
      kind: "web-content",
      html: source.files["index.html"] ?? "",
    };
  return { ...base, kind: source.kind };
}
export const sameFiles = (
  a: Record<string, string>,
  b: Record<string, string>,
) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((path) => a[path] === b[path]);

/** Preserve any local draft independently of narrower transport limits and private authority. */
export function conflictAsset(asset: Asset): Asset {
  return {
    ...structuredClone(asset),
    id: `conflict-${crypto.randomUUID()}`,
    instanceId: crypto.randomUUID(),
    name: `${asset.name.slice(0, 105)} (conflict)`,
    origin: { assetId: asset.id, revision: asset.revision },
    editorPolicyId: undefined,
    revision: 0,
    ...(asset.kind === "component" ? { artifact: null, grants: {} } : {}),
  };
}

/** Authoritative prototype source room. Membership and resource grants precede every mutation.
 * Presence is disposable; file updates require an exact source revision, not last-writer-wins.
 */
export class WorkspaceRoom {
  readonly members = new Map<string, Participant>();
  readonly sources = new Map<string, SharedSource>();
  constructor(
    readonly name: string,
    sources: SharedSource[],
  ) {
    if (JSON.stringify(sources).length > 2_000_000 || sources.length > 64)
      throw new Error("Room source limit exceeded");
    for (const source of sources) {
      const parsed = sharedSourceSchema.parse(source);
      if (this.sources.has(parsed.id))
        throw new Error("Duplicate source identity");
      this.sources.set(parsed.id, parsed);
    }
  }
  join(role: ParticipantRole, name: string, kind: "human" | "agent" = "human") {
    if (this.members.size >= 8) throw new Error("Room is full");
    const member: Participant = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 48) || "Guest",
      kind,
      role,
      desk: role === "owner" ? "Host desk" : "Guest desk",
      cursor: null,
    };
    this.members.set(member.id, member);
    return member;
  }
  replaceFiles(
    memberId: string,
    assetId: string,
    expectedRevision: number,
    files: Record<string, string>,
  ) {
    const member = this.members.get(memberId);
    if (!member || member.role === "viewer")
      throw new Error("Source editing is not granted");
    const source = this.sources.get(assetId);
    if (!source) throw new Error("Asset is outside this room");
    if (source.revision !== expectedRevision)
      throw new Error("Source changed; preserve your draft and retry");
    const next = sharedSourceSchema.parse({
      ...source,
      files,
      revision: source.revision + 1,
    });
    if (
      JSON.stringify(
        [...this.sources.values()].map((source) =>
          source.id === assetId ? next : source,
        ),
      ).length > 2_000_000
    )
      throw new Error("Room source limit exceeded");
    this.sources.set(assetId, next);
    return next;
  }
  presence(memberId: string, value: unknown) {
    const member = this.members.get(memberId);
    if (!member) throw new Error("Membership revoked");
    const parsed = z
      .object({
        desk: z.string().max(80),
        cursor: z
          .object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            assetId: z.string().max(160).optional(),
          })
          .nullable(),
      })
      .strict()
      .parse(value);
    this.members.set(memberId, { ...member, ...parsed });
  }
  snapshot() {
    return {
      name: this.name,
      sources: [...this.sources.values()],
      participants: [...this.members.values()],
    };
  }
}

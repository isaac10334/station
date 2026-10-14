import { z } from "zod";
import { parseTheme } from "./theme-assets";
import type { Asset } from "./model";
import { assetFiles, validSourcePath } from "./source-project";
import type { WebBuild } from "./source-project";

const identity = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(80);
/** Declarative host composition; the guest never supplies DOM coordinates. */
export type CompositionLayout =
  | { slot: string }
  | {
      axis: "horizontal" | "vertical";
      ratio: number;
      first: CompositionLayout;
      second: CompositionLayout;
    };
const layoutSchema: z.ZodType<CompositionLayout> = z.lazy(() =>
  z.union([
    z.object({ slot: z.string() }).strict(),
    z
      .object({
        axis: z.enum(["horizontal", "vertical"]),
        ratio: z.number().min(0.2).max(0.8),
        first: layoutSchema,
        second: layoutSchema,
      })
      .strict(),
  ]),
);
export const contributionSchema = z
  .object({
    id: identity,
    title: z.string().min(1).max(120),
    role: z.enum(["widget", "editor", "command"]),
    assetId: z.string(),
    entry: z.string().default("index.html"),
    creation: z.enum(["menu", "contextual"]).default("menu"),
    assetKinds: z
      .array(z.enum(["web-content", "component", "theme", "package"]))
      .default([]),
    capabilities: z.array(z.string().max(160)).max(16).default([]),
    channels: z
      .array(z.string().regex(/^[\w-]+$/))
      .max(16)
      .default([]),
    slots: z
      .array(
        z
          .object({
            id: identity,
            definitions: z.array(z.string()).max(32),
            initial: z.array(z.string()).max(32).default([]),
          })
          .strict(),
      )
      .max(8)
      .default([]),
    layout: layoutSchema.optional(),
  })
  .strict();
export const manifestSchema = z
  .object({
    version: z.literal(1),
    id: identity,
    name: z.string().min(1).max(120),
    contributions: z.array(contributionSchema).max(32),
    themeAssets: z.array(z.string()).default([]),
  })
  .strict();
export type ContributionManifest = z.infer<typeof manifestSchema>;
export type Contribution = z.infer<typeof contributionSchema>;
/** Installed snapshots are independent of subsequent authoring edits. Grants are reviewed separately. */
export interface PackageInstallation {
  id: string;
  name: string;
  packageAssetId: string;
  revision: number;
  enabled: boolean;
  manifest: ContributionManifest;
  assets: Asset[];
  builds: Record<string, WebBuild>;
  grants: Record<string, string[]>;
}
export function parseManifest(source: string): ContributionManifest {
  const raw = JSON.parse(source);
  for (const item of Array.isArray(raw?.contributions)
    ? raw.contributions
    : []) {
    const pending = item.layout ? [{ node: item.layout, depth: 0 }] : [];
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (depth > 8)
        throw new Error("Composition nesting exceeds eight levels");
      if (node?.first) pending.push({ node: node.first, depth: depth + 1 });
      if (node?.second) pending.push({ node: node.second, depth: depth + 1 });
    }
  }
  const manifest = manifestSchema.parse(raw);
  if (
    new Set(manifest.contributions.map((item) => item.id)).size !==
    manifest.contributions.length
  )
    throw new Error("Contribution IDs must be unique");
  for (const item of manifest.contributions) {
    if (!validSourcePath(item.entry))
      throw new Error("Invalid contribution entrypoint");
    if (new Set(item.slots.map((slot) => slot.id)).size !== item.slots.length)
      throw new Error("Slot IDs must be unique");
    for (const slot of item.slots)
      if (slot.initial.some((id) => !slot.definitions.includes(id)))
        throw new Error("Initial widgets must be allowed in their slot");
    if (
      1 + item.slots.reduce((count, slot) => count + slot.initial.length, 0) >
      32
    )
      throw new Error("Composition exceeds 32 children");
    if (item.layout) {
      const slots: string[] = [];
      const visit = (node: CompositionLayout) => {
        if ("slot" in node) slots.push(node.slot);
        else {
          visit(node.first);
          visit(node.second);
        }
      };
      visit(item.layout);
      const expected = ["body", ...item.slots.map((slot) => slot.id)];
      if (
        slots.length !== expected.length ||
        new Set(slots).size !== slots.length ||
        slots.some((slot) => !expected.includes(slot))
      )
        throw new Error(
          "Layout must contain body and each declared slot exactly once",
        );
    }
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const check = (id: string) => {
    if (visiting.has(id)) throw new Error("Recursive contribution composition");
    if (visited.has(id)) return;
    visiting.add(id);
    const item = manifest.contributions.find((item) => item.id === id);
    for (const child of item?.slots.flatMap((slot) => slot.definitions) ?? [])
      if (!child.startsWith("station:")) check(child);
    visiting.delete(id);
    visited.add(id);
  };
  manifest.contributions.forEach((item) => check(item.id));
  return manifest;
}
export function packageMembers(
  manifest: ContributionManifest,
  assets: readonly Asset[],
): Asset[] {
  const ids = new Set([
    ...manifest.contributions.map((item) => item.assetId),
    ...manifest.themeAssets,
  ]);
  for (const id of manifest.themeAssets) {
    const theme = assets.find(
      (asset) => asset.id === id && asset.kind === "theme",
    );
    if (theme)
      for (const reference of Object.values(
        parseTheme(assetFiles(theme)["theme.json"]!).icons ?? {},
      )) {
        const source = assets.find((asset) => asset.id === reference.assetId);
        if (
          !source ||
          source.kind === "package" ||
          assetFiles(source)[reference.path] === undefined
        )
          throw new Error(
            `Theme icon source missing: ${reference.assetId}/${reference.path}`,
          );
        ids.add(reference.assetId);
      }
  }
  return [...ids].map((id) => {
    const asset = assets.find((item) => item.id === id);
    if (!asset || asset.kind === "package")
      throw new Error(`Package member missing: ${id}`);
    return asset;
  });
}
export function exportPackage(asset: Asset, assets: readonly Asset[]): string {
  if (asset.kind !== "package") throw new Error("Choose a package asset");
  const manifest = parseManifest(asset.files["station.json"]!);
  const members = [asset, ...packageMembers(manifest, assets)].map((item) => {
    const { instanceId, ...source } = item;
    return {
      ...source,
      files: assetFiles(item),
      ...(item.kind === "component" ? { grants: {}, artifact: null } : {}),
    };
  });
  return JSON.stringify(
    { format: "station-package", version: 1, assets: members },
    null,
    2,
  );
}
/** Import creates new source identities. Nothing installs, grants, or executes during parsing. */
export function importPackage(
  source: string,
  existing: readonly Asset[],
): Asset[] {
  if (new TextEncoder().encode(source).byteLength > 10 * 1024 * 1024)
    throw new Error("Package exceeds 10 MiB");
  const bundle = JSON.parse(source);
  if (
    bundle.format !== "station-package" ||
    bundle.version !== 1 ||
    !Array.isArray(bundle.assets) ||
    bundle.assets.length > 64
  )
    throw new Error("Unsupported package bundle");
  const used = new Set(existing.map((asset) => asset.id)),
    map = new Map<string, string>();
  for (const asset of bundle.assets) {
    if (
      !asset ||
      typeof asset.id !== "string" ||
      map.has(asset.id) ||
      !["component", "web-content", "theme", "package"].includes(asset.kind) ||
      typeof asset.name !== "string" ||
      !asset.files ||
      typeof asset.files !== "object" ||
      Array.isArray(asset.files)
    )
      throw new Error("Invalid package asset");
    if (
      Object.entries(asset.files).some(
        ([path, contents]) =>
          !validSourcePath(path) || typeof contents !== "string",
      )
    )
      throw new Error("Invalid source file");
    let id = asset.id,
      suffix = 2;
    while (used.has(id)) id = `${asset.id}-${suffix++}`;
    used.add(id);
    map.set(asset.id, id);
  }
  const imported = bundle.assets.map((asset: Asset) => {
    const files = { ...assetFiles(asset) },
      id = map.get(asset.id)!;
    if (asset.kind === "package") {
      const manifest = parseManifest(files["station.json"]!);
      manifest.contributions.forEach((item) => {
        item.assetId = map.get(item.assetId) ?? item.assetId;
      });
      manifest.themeAssets = manifest.themeAssets.map(
        (id) => map.get(id) ?? id,
      );
      files["station.json"] = JSON.stringify(manifest, null, 2);
    }
    if (asset.kind === "component" && id !== asset.id)
      for (const path of ["Cargo.toml", "Cargo.lock"])
        if (files[path])
          files[path] = files[path].replaceAll(
            `name = "${asset.id}"`,
            `name = "${id}"`,
          );
    if (asset.kind === "theme") {
      const theme = parseTheme(files["theme.json"]!);
      for (const reference of Object.values(theme.icons ?? {})) {
        const remapped = map.get(reference.assetId);
        if (!remapped)
          throw new Error("Theme icon source is missing from the bundle");
        reference.assetId = remapped;
      }
      files["theme.json"] = JSON.stringify(theme, null, 2);
    }
    return {
      kind: asset.kind,
      id,
      name: asset.name,
      description:
        typeof asset.description === "string" ? asset.description : "",
      instanceId: crypto.randomUUID(),
      revision: 0,
      files,
      ...(asset.kind === "component"
        ? { language: "rust", grants: {}, artifact: null }
        : asset.kind === "web-content"
          ? { html: files["index.html"] ?? "" }
          : {}),
    };
  }) as Asset[];
  for (const asset of imported)
    if (asset.kind === "package")
      packageMembers(parseManifest(asset.files["station.json"]!), imported);
  return imported;
}

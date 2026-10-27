/** Pure authored asset values and artifact currency; no store, persistence or runtime ownership. */
import type { BuiltArtifact } from "./build-contract";
export type ComponentAsset = {
  kind: "component";
  id: string;
  instanceId: string;
  name: string;
  description: string;
  language: "rust";
  files: Record<string, string>;
  revision: number;
  metadataRevision?:number;
  artifact: null | BuiltArtifact;
  grants: Record<string, boolean>;
};

/** Authored HTML runs only in the sandboxed web preview, never in the host document. */
export type WebContentAsset = {
  kind: "web-content";
  id: string;
  instanceId: string;
  name: string;
  description: string;
  html: string;
  files?: Record<string, string>;
  revision: number;
  metadataRevision?:number;
};
export type DataAsset = {
  kind: "theme" | "package" | "widget-definition" | "desk-template" | "svg" | "decision" | "data-source" | "script" | "custom" | "markdown" | "note";
  id: string;
  instanceId: string;
  name: string;
  description: string;
  files: Record<string, string>;
  revision: number;
  metadataRevision?:number;
};
export type Asset = (ComponentAsset | WebContentAsset | DataAsset) & {
  /** Source provenance only: no live authority or mutable inheritance. */
  origin?: { assetId: string; revision: number };
  editorPolicyId?: string;
};
export function hasCurrentArtifact(asset: ComponentAsset): boolean {
  return (
    asset.artifact?.schemaVersion === 2 &&
    asset.artifact.profile === "component-model-0.3" &&
    asset.artifact.id === asset.id &&
    asset.artifact.revision === asset.revision
  );
}
export function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "component"
  );
}

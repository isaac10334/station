/** Validate the translated binary's contract before any guest code runs. */
import { requiredImports } from "@polyengine/runtime/embedder";
import type { ComponentArtifacts } from "@polyengine/runtime/embedder";
import { P3_CLOCK_INTERFACE, ASSET_HOST_INTERFACE, ASSET_SURFACE_INTERFACE } from "./component-contract";

const safeP2Interfaces = new Set([
  "wasi:io/poll@0.2.12", "wasi:io/error@0.2.12", "wasi:io/streams@0.2.12",
  "wasi:cli/terminal-input@0.2.12", "wasi:cli/terminal-output@0.2.12",
  "wasi:cli/exit@0.2.12", "wasi:cli/stdin@0.2.12",
  "wasi:cli/stdout@0.2.12", "wasi:cli/stderr@0.2.12",
  "wasi:cli/environment@0.2.12", "wasi:cli/terminal-stdin@0.2.12",
  "wasi:cli/terminal-stdout@0.2.12", "wasi:cli/terminal-stderr@0.2.12",
  "wasi:clocks/monotonic-clock@0.2.12",
]);

export type InspectedComponent = { worldDigest: string; imports: string[] };

export function inspectComponentPlan(plan: ComponentArtifacts["plan"]): InspectedComponent {
  const leaves = requiredImports(plan);
  for (const leaf of leaves) {
    const allowed = safeP2Interfaces.has(leaf.interfaceId) ||
      (leaf.interfaceId === ASSET_HOST_INTERFACE && ["log", "feed"].includes(leaf.jsName)) ||
      (leaf.interfaceId === ASSET_SURFACE_INTERFACE && leaf.jsName === "setText") ||
      (leaf.interfaceId === P3_CLOCK_INTERFACE && leaf.jsName === "now");
    if (!allowed) throw new Error(`Unsupported Component import: ${leaf.interfaceId}.${leaf.jsName}`);
  }
  for (const name of [`${ASSET_HOST_INTERFACE}.log`, `${ASSET_HOST_INTERFACE}.feed`,
    `${ASSET_SURFACE_INTERFACE}.setText`, `${P3_CLOCK_INTERFACE}.now`]) {
    if (!leaves.some((leaf) => `${leaf.interfaceId}.${leaf.jsName}` === name))
      throw new Error(`P3 Component contract is missing ${name}`);
  }
  const run = plan.exports.find((item) => item.kind === "lifted-func" && item.name === "run");
  const type = run?.kind === "lifted-func" ? plan.types[run.type] : undefined;
  if (!type || type.kind !== "func" || !type.async ||
      type.params.length !== 1 || type.params[0].type.kind !== "string" ||
      type.results.length !== 1 || type.results[0].kind !== "string")
    throw new Error("P3 Component must export async run(input: string) -> string.");
  return { worldDigest: plan.worldDigest, imports: [...new Set(leaves.map((leaf) => leaf.interfaceId))].sort() };
}

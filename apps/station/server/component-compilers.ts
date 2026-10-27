import { BuildFailure, type BuildSource } from "../src/core/build-contract";
import type { ComponentBuildPaths } from "./component-build";
import { compileWithVercel } from "./component-compiler-vercel";
import { compileWithOCI } from "./component-compiler-oci";
/** Compiler providers produce untrusted bytes. One common verifier inspects P3
 * imports/world, hashes inputs/translator/output, then publishes artifacts.
 * Provider failure never selects a broader execution environment. */
export interface ComponentCompiler { id: "vercel-sandbox" | "oci-container"; compile(source: BuildSource, paths: ComponentBuildPaths, signal?: AbortSignal): Promise<{ bytes: Uint8Array; toolchain: string; environmentId: string }> }
export function selectComponentCompiler(id = process.env.STATION_BUILD_PROVIDER ?? (process.env.STATION_COMPONENT_BUILDER_IMAGE ? "oci-container" : "vercel-sandbox")): ComponentCompiler {
  if (id === "oci-container") return { id, compile: (source, _, signal) => compileWithOCI(source, signal) };
  if (id === "vercel-sandbox") return { id, compile: compileWithVercel };
  throw new BuildFailure(`Unknown Component compiler provider: ${id}`, 503);
}

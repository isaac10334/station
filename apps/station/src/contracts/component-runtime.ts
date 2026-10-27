/** Invocation-owned Component runner contract. WIT authority is enforced by the provider. */
import { defineCapability } from "@loop-kit/capabilities";
import type { ComponentAsset } from "../core/asset-state";
import type { ComponentWorkerReply } from "./component-worker";
export type RunResult = Extract<ComponentWorkerReply, { ok: true }>;
/** A scoped invocation contract; caller revocation is passed as an AbortSignal and terminates the worker. */
export interface ComponentRunner {
  run(asset: ComponentAsset, input: string, grants: ReadonlySet<string>, signal?: AbortSignal): Promise<RunResult>;
}
export const legacyComponentRunner = defineCapability<ComponentRunner>({id: "unit:workspace/component-runtime-polyengine", version: "1.0.0"});

export const componentRunner = defineCapability<ComponentRunner>({ id: "station:runtime/component-polyengine", version: "1.0.0" });

/** Program lifecycle dependencies; implementations are wired only by composition. */
import type { Host } from "@loop-kit/host";
import type { Asset } from "../../../core/asset-state";
import type { ProgramDraft, ProgramSnapshot } from "../../../core/programs";
import type { EngineRequest, HostCall } from "../contracts/engine";
/** Per-instance policy adapter. The engine never gets raw workspace or owner dispatch. */
export interface ProgramHost {
  readonly profile?: "portable-ui";
  call(value: HostCall): Promise<string | number | null>;
  close(): void;
}
export interface ProgramSession {
  request(request: EngineRequest, timeoutMs?: number): Promise<string>;
  stop(reason?: string): void;
  readonly stats: { stopped: boolean; pending: number };
  readonly logs?: readonly string[];
}
/** Independent named-service lifetime and policy-checked invocation. attach does
 * not authorize callers; the controller validates methods/resources before call.
 */
export interface NamedServices {
  attach(host: Host): void;
  register(id: string, check: () => void): void;
  remove(id: string): void;
  call(id: string, execute: () => Promise<unknown>, signal: AbortSignal): Promise<unknown>;
  dispose(): void;
}
export interface ProgramRuntimePorts {
  open(host: ProgramHost, signal?: AbortSignal, onLog?: () => void): Promise<ProgramSession>;
  resources(): Promise<{ manifest: { sha256: string } }>;
  prepare(draft: ProgramDraft, assets: readonly Asset[], definitionId?: string, revision?: number, signal?: AbortSignal): Promise<ProgramSnapshot>;
}

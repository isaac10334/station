/** Application-owned dependencies of command execution. Implementations are
 * supplied by composition; these ports never grant authority to a caller.
 */
import type { UiEvent } from "@loop-kit/ui";
import type { Asset } from "../core/asset-state";
import type { Workspace } from "../core/workspace-state";
import type { DataSourceProvider } from "../core/data-sources";
import type { PackageInstallation } from "../core/package-assets";
import type { ProgramDraft, ProgramInstance, ServiceBinding } from "../core/programs";
import type { ScriptInput, ScriptOutput } from "./script-runtime";

/** Redacted lifecycle metadata; never includes service values or credentials. */
export interface LifecycleEvent {
  sequence: number;
  at: number;
  kind: string;
  subjectId: string;
  label: string;
  state: string;
}

/** Snapshot exposed to authorized command diagnostics, without runtime handles. */
export interface LifecycleDiagnostics {
  state: string;
  providers: number;
  scopes: number;
  acquisitions: number;
  events: LifecycleEvent[];
}

/** Metadata returned by the program command dependency, excluding source/handles. */
export interface ProgramInspection {
  id: string;
  title: string;
  kind: ProgramInstance["kind"];
  revision: number;
  snapshotId: string | null;
  startup: boolean;
  bindings: ServiceBinding[];
  surfaceAccess: boolean;
  status: "starting" | "running" | "stopped" | "failed";
  error: string;
}

/** Program operations required by command execution. Command policy validates
 * task ownership and grants before calling these methods; the implementation
 * retains its revision, binding and execution checks. The composing owner owns
 * service disposal, which deliberately is not part of this command-facing port.
 */
export interface CommandPrograms {
  inspect(): ProgramInspection[];
  create(id: string, kind: ProgramInstance["kind"], draft?: ProgramDraft, definitionId?: string, taskId?: string): ProgramInstance;
  fromAsset(id: string, assetId: string, kind: ProgramInstance["kind"], taskId?: string): ProgramInstance;
  fromInstallation(id: string, definitionId: string, kind: ProgramInstance["kind"], taskId?: string): { instanceId: string; snapshotId: string };
  update(id: string, revision: number, draft: ProgramDraft): void;
  wire(id: string, revision: number, bindings: ServiceBinding[], startup?: boolean, surfaceAccess?: boolean, authorizationTaskId?: string): void;
  activate(id: string, signal?: AbortSignal): Promise<{ snapshotId: string; sourceSha256: string }>;
  start(id: string, signal?: AbortSignal): Promise<{ status: "starting" | "running" | "stopped" | "failed"; output: unknown }>;
  stop(id: string): void;
  saveDefinition(id: string, name: string): { assetId: string };
  configure(id: string, revision: number, configuration: ProgramInstance["configuration"]): void;
  action(id: string, method: string, input: unknown, signal?: AbortSignal): Promise<unknown>;
  event(id: string, event: UiEvent): Promise<void>;
  createCustom(id: string, name: string): { assetId: string; type: string };
  updateCustom(assetId: string, revision: number, content: unknown): { assetId: string; revision: number };
  revokeTask(taskId: string): void;
}

/** Optional effect ports. Missing dependencies remain unavailable; they never
 * authorize a broader fallback. Async implementations must respect cancellation.
 * @example createStationControl(store, { programs, diagnostics: telemetry.inspect })
 */
export interface CommandPorts {
  vectorEditors?: { get(workspaceId: string, panelId: string, assetId: string, revision: number): {
    commands(signal: AbortSignal): Promise<import("../core/vector-editor").VectorCommandInfo[]>;
    execute(command: import("../core/vector-editor").VectorCommand, signal: AbortSignal): Promise<unknown>;
    export(signal: AbortSignal): Promise<{ source: string }>;
  } };
  programs?: CommandPrograms;
  evaluateScript?(request: ScriptInput, signal: AbortSignal): Promise<ScriptOutput>;
  dataProviders?: readonly DataSourceProvider[];
  diagnostics?(): LifecycleDiagnostics;
  buildWeb?(asset: Asset, signal: AbortSignal): Promise<unknown>;
  preparePackage?(workspace: Workspace, assetId: string, signal: AbortSignal): Promise<PackageInstallation>;
  buildComponent?(workspaceId: string, assetId: string, signal: AbortSignal): Promise<unknown>;
  runComponent?(asset: Asset, input: string, imports: string[], signal: AbortSignal): Promise<unknown>;
}

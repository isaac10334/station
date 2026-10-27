import { z } from "zod";
import type { Scope } from "@loop-kit/host";
import type { RunResult } from "../contracts/component-runtime";
import { hasCurrentArtifact } from "../core/asset-state";
import { type Store } from "../features/workspace/application/store";
import { type Workspace } from "../core/workspace-state";
import {
  packageMembers,
  contributionSource,
  parseManifest,
  type PackageInstallation,
  type Contribution,
} from "../core/package-assets";
import { assetFiles } from "../core/source-project";
import { buildWebProject } from "./web-build";
import { editorSessions } from "./editor-session";
import { assetCatalog, textDigest, workspaceClock, stationAssetCatalog, loopClock, loopTextDigest } from "@station/capabilities";

import type { GuestBindings } from "./guest-bridge";
import type { Json } from "@station/sdk";
import {
  hostSurface,
  descendants,
  findNode,
  visitNode,
  type Stack,
  type Panel,
  type Node,
} from "../core/docking";
import { REQUIRED_GRANTS } from "../core/component-contract";
import { parseProgramAsset } from '../core/programs';
import { prepareProgram } from './program-activation';

export const EDITOR_SESSION = "station:editor/session";
export { installedDefinitions } from "../core/contribution-catalog";
import { installedDefinitions } from "../core/contribution-catalog";
/** Host-instantiated slot tree. All child IDs participate in the same dock validation. */
export function composeContribution(
  panel: Panel,
  contribution: Contribution,
  installation: PackageInstallation,
) {
  const panels: Panel[] = [],
    slots: Node[] = [];
  const add = (definition: string, slotId: string): string => {
    const id = `child:${crypto.randomUUID()}`;
    if (definition.startsWith("station:editor/")) {
      if (!("assetId" in panel) || !panel.assetId)
        throw new Error("Editor parts require an opened asset");
      panels.push({
        id,
        kind: "editor-part",
        ownerId: panel.id,
        definitionId: definition,
        assetId: (panel as Extract<Panel, { kind: "asset" }>).assetId,
        slotId,
        part: definition.split("/")[1] as "files",
        tags: ["widget"],
      });
    } else
      panels.push({
        id,
        kind: "contribution",
        definitionId: `${installation.id}/${definition}`,
        ownerId: panel.id,
        assetId: "assetId" in panel ? panel.assetId : undefined,
        slotId,
        tags: ["widget"],
      });
    return id;
  };
  const body = add(contribution.id, "body");
  slots.push({
    kind: "stack",
    id: `${panel.id}:body`,
    slotId: "body",
    tabs: [body],
    active: body,
    keepEmpty: true,
    allowedDefinitions: [`${installation.id}/${contribution.id}`],
  });
  for (const slot of contribution.slots) {
    const tabs = slot.initial.map((definition) => add(definition, slot.id));
    slots.push({
      kind: "stack",
      id: `${panel.id}:slot:${slot.id}`,
      slotId: slot.id,
      tabs,
      active: tabs[0] ?? "",
      keepEmpty: true,
      allowedDefinitions: slot.definitions.map((id) =>
        id.startsWith("station:") ? id : `${installation.id}/${id}`,
      ),
    });
  }
  let sequence = 0;
  const buildLayout = (layout: NonNullable<Contribution["layout"]>): Node =>
    "slot" in layout
      ? slots.find(
          (node) => node.kind === "stack" && node.slotId === layout.slot,
        )!
      : {
          kind: "split",
          id: `${panel.id}:split:${++sequence}`,
          axis: layout.axis,
          ratio: layout.ratio,
          first: buildLayout(layout.first),
          second: buildLayout(layout.second),
        };
  const root = contribution.layout
    ? buildLayout(contribution.layout)
    : slots.reduce((first, second, index): Node => ({
        kind: "split",
        id: `${panel.id}:split:${index}`,
        axis: index === 1 ? "horizontal" : "vertical",
        ratio: 0.7,
        first,
        second,
      }));
  return { type: "compose" as const, ownerId: panel.id, panels, root };
}

/** Minimal application ports; this service never imports the composition root. */
export interface PackageRuntimeDependencies {
  taskControl?(): ReturnType<typeof import("../features/commands/application/runtime").createStationControl>;
  store: Store;
  openScope(workspaceId: string, name: string): Scope;
  runPackageCommand(packageId: string, contributionId: string, input: string, signal?: AbortSignal): Promise<RunResult>;
}
/** Runtime-local state and effects, supplied by the application's composition root. */
export function createPackageRuntime(deps: PackageRuntimeDependencies) {
/** Build all members before making an install reviewable. Does not register or execute it. */
async function prepareInstallation(
  workspace: Workspace,
  assetId: string,
  signal?: AbortSignal,
): Promise<PackageInstallation> {
  const asset = workspace.assets.find((asset) => asset.id === assetId);
  if (asset?.kind !== "package") throw new Error("Package source missing");
  const manifest = parseManifest(asset.files["station.json"]!);
  const members = packageMembers(manifest, workspace.assets),
    builds: PackageInstallation["builds"] = {}, programs:NonNullable<PackageInstallation['programs']>={};
  for (const contribution of manifest.contributions) contributionSource(contribution, members.find(member => member.id === contribution.assetId)!);
  for (const contribution of manifest.contributions) {
    const member = members.find((asset) => asset.id === contribution.assetId)!;
    if(contributionSource(contribution, member) === "program") {
      const draft=parseProgramAsset(assetFiles(member));
      programs[contribution.id]=await prepareProgram(draft,members,`${manifest.id}/${contribution.id}`,member.revision,signal);
    } else if (contribution.role === "command") {
      if (member.kind !== "component")
        throw new Error("Commands require Component source");
    } else {
      if (member.kind !== "web-content")
        throw new Error("Widgets and editors require web content");
      builds[contribution.id] = await buildWebProject(
        { ...member, files: assetFiles(member) },
        contribution.entry,
        signal,
      );
    }
    for (const slot of contribution.slots)
      for (const id of slot.definitions)
        if (
          !/^station:editor\/(files|code|preview|problems)$/.test(id) &&
          !manifest.contributions.some(
            (item) => item.id === id && item.role !== "command",
          )
        )
          throw new Error(`Unknown slot definition: ${id}`);
    if (
      contribution.slots.some((slot) =>
        slot.definitions.includes(contribution.id),
      )
    )
      throw new Error("A contribution cannot contain itself");
  }
  const current = deps.store.active();
  signal?.throwIfAborted();
  if (
    current.id !== workspace.id ||
    current.assets.find((item) => item.instanceId === asset.instanceId)
      ?.revision !== asset.revision ||
    members.some(
      (member) =>
        current.assets.find((item) => item.instanceId === member.instanceId)
          ?.revision !== member.revision,
    )
  )
    throw new Error("Package source changed during preparation");
  return {
    id: manifest.id,
    name: manifest.name,
    packageAssetId: assetId,
    revision: asset.revision,
    manifest,
    enabled: true,
    assets: structuredClone(members).map((member) =>
      member.kind === "component" ? { ...member, grants: {} } : member,
    ),
    builds,
    programs,
    grants: {},
  };
}

const ownerState = new Map<
  string,
  {
    values: Map<string, Json>;
    listeners: Set<(key: string, value: Json) => void>;
    users: number;
  }
>();
/** Resource and desk bindings come from host placement, never guest-provided identities. */
function contributionBindings(
  workspace: Workspace,
  panel: Panel,
  installation: PackageInstallation,
  contribution: Contribution,
) {
  const deskId = workspace.activeDeskId,
    ownerId = panel.ownerId ?? panel.id,
    owner = workspace.dock.panels[ownerId]!;
  const stateId = `${workspace.id}:${deskId}:${ownerId}`;
  const state = ownerState.get(stateId) ?? {
    values: new Map(),
    listeners: new Set(),
    users: 0,
  };
  state.users++;
  ownerState.set(stateId, state);
  const controller = new AbortController(),
    scope = deps.openScope(workspace.id, `Web widget · ${panel.id}`);
  const grants = (installation.grants[contribution.id] ?? []).filter((id) =>
    contribution.capabilities.includes(id),
  );
  const check = () => {
    if (installation.authorizationTaskId) deps.taskControl?.().contextForTask(installation.authorizationTaskId);
    const current = deps.store.active();
    if (
      controller.signal.aborted ||
      current.id !== workspace.id ||
      current.activeDeskId !== deskId ||
      !current.dock.panels[panel.id] ||
      !installedDefinitions(current).some(
        (item) =>
          item.installation === installation &&
          item.contribution.id === contribution.id,
      )
    )
      throw new Error("Contribution session revoked");
  };
  const checkKey = (key: string) => {
    check();
    if (!contribution.channels.includes(key))
      throw new Error("Owner channel not declared");
  };
  const bindings: GuestBindings = {
    grants,
    signal: controller.signal,
    async acquire(id, version): ReturnType<GuestBindings["acquire"]> {
      check();
      if (version !== "1.0.0" || !grants.includes(id))
        throw new Error("Capability denied");
      let released = false;
      const live = () => {
        check();
        if (installation.authorizationTaskId) {
          const control = deps.taskControl?.();
          if (!control) throw new Error("Task policy unavailable");
          control.assertCapability(control.contextForTask(installation.authorizationTaskId), id);
        }
        if (released) throw new Error("Capability released");
      };
      if (id === "station:assets/metadata") {
        const control = deps.taskControl?.();
        if (!control || !installation.authorizationTaskId) throw new Error("Metadata editing requires a resource-bound task authorization");
        const context = control.contextForTask(installation.authorizationTaskId);
        const target = (value: unknown) => {
          live(); const assetId = z.string().parse(value);
          if (!installation.metadataTargets?.includes(assetId)) throw new Error("Metadata target is outside this installation");
          return assetId;
        };
        return {
          methods: {
            get: (assetId: unknown) => { const response = control.executeFor(context, { method: "asset.metadata.read", params: { assetId: target(assetId) } }); return { ...response.result, version: response.version }; },
            version: () => { live(); return control.version(); },
            patch: (assetId: unknown, patch: unknown, version: unknown) => { control.executeFor(context, { method: "asset.metadata", params: { assetId: target(assetId), patch }, version }); },
          },
          subscribe: listener => deps.store.subscribe(() => { try { live(); listener({ version: control.version() }); } catch {} }),
          release: async () => { released = true; },
        };
      }
      let editorOwner: Panel | undefined = owner;
      let session = editorSessions.get(ownerId);
      for (
        let depth = 0;
        !session && editorOwner?.ownerId && depth < 32;
        depth++
      ) {
        editorOwner = workspace.dock.panels[editorOwner.ownerId];
        if (editorOwner) session = editorSessions.get(editorOwner.id);
      }
      if (id === EDITOR_SESSION) {
        if (
          !session ||
          !owner ||
          !("assetId" in owner) ||
          session.asset.id !== owner.assetId
        )
          throw new Error("Opened-asset binding unavailable");
        return {
          methods: {
            files: () => {
              live();
              if (installation.authorizationTaskId) {
                const control = deps.taskControl!();
                return control.executeFor(control.contextForTask(installation.authorizationTaskId), { method: "asset.read", params: { assetId: session.asset.id } }).result.files;
              }
              const asset = deps.store
                .active()
                .assets.find((asset) => asset.id === session.asset.id);
              if (!asset) throw new Error("Opened asset missing");
              return { ...assetFiles(asset) };
            },
            edit: (path: unknown, source: unknown) => {
              live();
              if (installation.authorizationTaskId) {
                const control = deps.taskControl!(), context = control.contextForTask(installation.authorizationTaskId);
                const current = deps.store.active().assets.find(a => a.id === session.asset.id)!;
                control.executeFor(context, { method: "asset.files.patch", version: control.version(), params: { assetId: current.id, expectedAssetRevision: current.revision, patch: { [z.string().parse(path)]: z.string().max(1024 * 1024).parse(source) } } }); return;
              }
              deps.store.editFile(
                session.asset.id,
                z.string().parse(path),
                z
                  .string()
                  .max(1024 * 1024)
                  .parse(source),
              );
            },
            remove: (path: unknown) => {
              live();
              if (installation.authorizationTaskId) {
                const control = deps.taskControl!(), current = deps.store.active().assets.find(a => a.id === session.asset.id)!;
                control.executeFor(control.contextForTask(installation.authorizationTaskId), { method: "asset.files.patch", version: control.version(), params: { assetId: current.id, expectedAssetRevision: current.revision, patch: { [z.string().parse(path)]: null } } }); return;
              }
              deps.store.removeFile(session.asset.id, z.string().parse(path));
            },
            rename: (from: unknown, to: unknown) => {
              live();
              if (installation.authorizationTaskId) {
                const control = deps.taskControl!(), current = deps.store.active().assets.find(a => a.id === session.asset.id)!, files = assetFiles(current), source = z.string().parse(from), destination = z.string().parse(to);
                if (files[destination] !== undefined || files[source] === undefined) throw new Error("Invalid rename");
                control.executeFor(control.contextForTask(installation.authorizationTaskId), { method: "asset.files.patch", version: control.version(), params: { assetId: current.id, expectedAssetRevision: current.revision, patch: { [source]: null, [destination]: files[source] } } }); return;
              }
              deps.store.renameFile(
                session.asset.id,
                z.string().parse(from),
                z.string().parse(to),
              );
            },
            select: (path: unknown) => {
              live();
              session.select(z.string().parse(path));
            },
            diagnostics: () => {
              live();
              return session.problems;
            },
          },
          subscribe: (listener) =>
            session.subscribe(() => {
              live();
              listener({
                revision: session.asset.revision,
                selected: session.selected,
              });
            }),
          release: async () => {
            released = true;
          },
        };
      }
      if (id === "station:commands/invoke") {
        const commandController = new AbortController();
        const abortCommand = () => commandController.abort();
        controller.signal.addEventListener("abort", abortCommand, {
          once: true,
        });
        return {
          methods: {
            invoke: (definition: unknown, input: unknown) => {
              live();
              const commandId = z.string().parse(definition);
              if (installation.authorizationTaskId) {
                // Until a delegated command adapter can intersect every callee effect,
                // a task-owned package cannot borrow another command's authority.
                throw new Error("Delegated package command invocation is unavailable; use the scoped Component command");
              }
              if (!contribution.capabilities.includes(`command:${commandId}`))
                throw new Error("Command not declared");
              return invokeInstalledCommand(
                deps.store.active(),
                commandId,
                z.string().max(65536).parse(input),
                commandController.signal,
              );
            },
          },
          release: async () => {
            released = true;
            commandController.abort();
            controller.signal.removeEventListener("abort", abortCommand);
          },
        };
      }
      const capability = [workspaceClock, textDigest, assetCatalog, stationAssetCatalog, loopClock, loopTextDigest].find(capability => capability.id === id);
      if (!capability) throw new Error("Unsupported guest contract");
      const handle = await scope.acquire(capability as typeof workspaceClock);
      live();
      const value = handle.value as any;
      const methods: Record<string, (...args: any[]) => unknown> =
          id === workspaceClock.id || id === loopClock.id
          ? {
              now: () => {
                live();
                return value.now();
              },
            }
          : id === textDigest.id || id === loopTextDigest.id
            ? {
                sha256: (text: unknown) => {
                  live();
                  return value.sha256(z.string().parse(text));
                },
              }
            : {
                list: () => {
                  live();
                  if (installation.authorizationTaskId) {
                    const control = deps.taskControl?.();
                    if (!control) throw new Error("Task policy unavailable");
                    return control.executeFor(control.contextForTask(installation.authorizationTaskId), { method: "assets.list" }).result;
                  }
                  return value.list();
                },
              };
      return {
        methods,
        release: async () => {
          released = true;
          await handle.release();
        },
      };
    },
    state(key, value) {
      checkKey(key);
      if (value !== undefined) {
        if (JSON.stringify(value).length > 64 * 1024)
          throw new Error("State exceeds 64 KiB");
        state.values.set(key, value);
        state.listeners.forEach((listener) => listener(key, value));
      }
      return state.values.get(key) ?? null;
    },
    subscribe(listener) {
      const filtered = (key: string, value: Json) => {
        if (contribution.channels.includes(key)) listener(key, value);
      };
      state.listeners.add(filtered);
      return () => {
        state.listeners.delete(filtered);
      };
    },
    slotOpen(slotId, definition) {
      check();
      const ownerContribution =
        installation.manifest.contributions.find(
          (item) => `${installation.id}/${item.id}` === owner.definitionId,
        ) ?? contribution;
      const slot = ownerContribution.slots.find((slot) => slot.id === slotId);
      if (!slot?.definitions.includes(definition))
        throw new Error("Child definition not allowed in slot");
      const current = deps.store.active().dock;
      if (descendants(current, ownerId).length >= 32)
        throw new Error("Owner child limit reached");
      let destination: Stack | null = null;
      visitNode(current.containers[ownerId] ?? null, (node) => {
        if (node.kind === "stack" && node.slotId === slotId) destination = node;
      });
      const target = {
        surface: hostSurface(current, ownerId)!,
        ownerId,
        nodeId: (destination as Stack | null)?.id,
        intent: "tab" as const,
      };
      if (!target.nodeId || !findNode(current, target.nodeId))
        throw new Error("Slot was removed");
      const assetId = "assetId" in owner ? owner.assetId : undefined;
      if (definition.startsWith("station:editor/") && !assetId)
        throw new Error("Editor parts need an opened asset");
      const result = deps.store.dispatchDock(
        definition.startsWith("station:editor/")
          ? {
              type: "createEditorPart",
              ownerId,
              assetId: assetId!,
              part: definition.slice("station:editor/".length) as
                "files" | "code" | "preview" | "problems",
              slotId,
              target,
            }
          : {
              type: "createContribution",
              definitionId: `${installation.id}/${definition}`,
              ownerId,
              slotId,
              assetId: "assetId" in owner ? owner.assetId : undefined,
              target,
            },
      );
      if (!result.ok) throw new Error(result.reason);
      return result.panelId!;
    },
    slotClose(id) {
      check();
      if (deps.store.active().dock.panels[id]?.ownerId !== ownerId)
        throw new Error("Instance belongs to another owner");
      const result = deps.store.dispatchDock({ type: "close", panelId: id });
      if (!result.ok) throw new Error(result.reason);
    },
  };
  let disposed = false;
  const unsubscribe = deps.store.subscribe(() => {
    try {
      check();
    } catch {
      dispose();
    }
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    controller.abort();
    void scope.revoke();
    if (--state.users === 0) ownerState.delete(stateId);
  }
  return { bindings, dispose };
}
/** On-demand commands reuse the verified worker and existing WIT grants. */
async function invokeInstalledCommand(
  workspace: Workspace,
  definitionId: string,
  input: string,
  signal: AbortSignal,
) {
  const definition = installedDefinitions(workspace).find(
    (item) => item.id === definitionId && item.contribution.role === "command",
  );
  const asset = definition?.installation.assets.find(
    (asset) => asset.id === definition.contribution.assetId,
  );
  if (asset?.kind !== "component" || !hasCurrentArtifact(asset))
    throw new Error("Command needs a verified Component build");
  const grants =
    definition!.installation.grants[definition!.contribution.id] ?? [];
  if (REQUIRED_GRANTS.some((id) => !grants.includes(id)))
    throw new Error("Command WIT grants have not been approved");
  return deps.runPackageCommand(
    definition!.installation.id,
    definition!.contribution.id,
    input,
    signal,
  );
}

return { prepareInstallation, contributionBindings, invokeInstalledCommand };
}

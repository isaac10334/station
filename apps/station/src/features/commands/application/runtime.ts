import { builtinIconAssets, builtinIconAsset } from "../../../core/builtin-icons";
import { captureRecord, captureRulesSchema, readCaptureRules, type CaptureRule } from "../../../core/capture-rules";
import { dataDocumentSchema, dataSnapshotSchema, queryDataSource, viewConfigurationSchema, recordSchema, columnSchema, type DataSourceProvider } from "../../../core/data-sources";
import { scriptEvaluator, scriptOutputSchema } from "../../../contracts/script-runtime";
import type { CommandPorts } from "../../../contracts/command-ports";
export type { CommandPorts } from "../../../contracts/command-ports";
/** Shared command authority and lifecycle. The store remains the only workspace
 * owner. Contexts are opaque host-created objects; transport JSON cannot mint one.
 * Every async effect must recheck its context before publishing a result.
 */
import {
  z,
  ControlError,
  requestSchema,
  taskScopeSchema,
  metadataPatchSchema,
  assetSummarySchema,
  filesSchema,
  identity,
  targetSchema,
  type TaskScope,
  type StateVersion,
} from "@station/protocol";
import type { Store } from "../../workspace/application/store";
import type { Asset } from "../../../core/asset-state";
import type { PackageInstallation } from "../../../core/package-assets";
import { packageMembers, parseManifest } from "../../../core/package-assets";
import {
  assetFiles,
  validSourcePath,
  WEB_PROJECT_STARTER,
} from "../../../core/source-project";
import { controlledDockCommand } from "../../../core/station-control";
import { hostSurface } from "../../../core/docking";
import { resolveEditor } from "../../../core/asset-routing";
import { widgetDefinitionAsset, builtinWidgetAssets, parseWidgetRecipe } from "../../../core/widget-definitions";
import { bindingSchema, draftSchema } from "../../../core/programs";
import { normalizeNavigation } from "../../../core/navigation-filter";
import { availableDeskTemplates } from "../../../core/desk-templates";
import { allowedVectorCommand, vectorCommandInfoSchema, vectorCommandSchema } from "../../../core/vector-editor";

export type InvocationContext = Readonly<{
  principalId: string;
  taskId: string;
  workspaceId: string;
  epoch: string;
}>;
type Task = {
  id: string;
  name: string;
  workspaceId: string;
  expiresAt: number;
  scope: TaskScope;
  created: Set<string>;
  packages: Set<string>;
  controller: AbortController;
  context: InvocationContext;
  revoked: boolean;
  source: "external" | "internal" | "fixture";
};
type Operation = {
  id: string;
  taskId: string;
  method: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  startedAt: number;
  result?: unknown;
  error?: { code: string; message: string };
  controller: AbortController;
};
type Requirement = {
  asset?: string;
  write?: boolean;
  surface?: string;
  capability?: string;
};
type Definition = {
  schema: z.ZodType;
  output: z.ZodType;
  description: string;
  effects: string[];
  available?: () => boolean;
  requirements?: (p: any) => Requirement[];
  run: (p: any, c: InvocationContext, signal: AbortSignal) => unknown;
};
const empty = z.object({}).strict(),
  json = z.json();
const summary = (asset: Asset) =>
  assetSummarySchema.parse({
    id: asset.id,
    name: asset.name,
    description: asset.description,
    kind: asset.kind,
    revision: asset.revision,
  });
/** A Component's virtual Cargo identity follows its asset identity on create/fork. */
function rebaseComponent(asset: Extract<Asset, { kind: "component" }>) {
  const previous = asset.files["Cargo.toml"]?.match(
    /\[package\][\s\S]*?\bname\s*=\s*"([a-z][a-z0-9-]*)"/,
  )?.[1];
  if (!previous) return;
  for (const path of ["Cargo.toml", "Cargo.lock"])
    if (asset.files[path])
      asset.files[path] = asset.files[path].replaceAll(
        `name = "${previous}"`,
        `name = "${asset.id}"`,
      );
}
function fail(code: string, message: string, details?: unknown): never {
  throw new ControlError(code, message, details);
}

export function createStationControl(store: Store, ports: CommandPorts = {}) {
  const epoch = crypto.randomUUID();
  let revision = 0,
    disposed = false,
    change = 0;
  const listeners = new Set<
    (event: {
      type: "state.changed" | "control.changed";
      revision: number;
    }) => void
  >();
  const contexts = new WeakSet<object>(),
    tasks = new Map<string, Task>(),
    operations = new Map<string, Operation>();
  const preparations = new Map<
    string,
    {
      installation: PackageInstallation;
      taskId: string;
      revisions: Record<string, number>;
    }
  >();
  const dedup = new Map<string, { input: string; response: unknown }>();
  const audit: {
    sequence: number;
    taskId: string;
    method: string;
    at: number;
    outcome: string;
    operationId?: string;
  }[] = [];
  const requests: {
    id: string;
    taskId: string;
    scope: TaskScope;
    reason: string;
    status: "pending" | "approved" | "denied";
  }[] = [];
  const owner: InvocationContext = Object.freeze({
    principalId: "owner-ui",
    taskId: "owner",
    workspaceId: "",
    epoch,
  });
  contexts.add(owner);
  const publish = () => {
    change++;
    for (const listener of listeners) {
      try {
        listener({ type: "control.changed", revision });
      } catch {}
    }
  };
  const unsubscribe = store.subscribe(() => {
    revision++;
    for (const listener of listeners) {
      try {
        listener({ type: "state.changed", revision });
      } catch {}
    }
  });
  const record = (
    taskId: string,
    method: string,
    outcome: string,
    operationId?: string,
  ) => {
    audit.push({
      sequence: change + 1,
      taskId,
      method,
      at: Date.now(),
      outcome,
      operationId,
    });
    if (audit.length > 1000) audit.shift();
    publish();
  };
  function taskFor(context: InvocationContext): Task | undefined {
    if (disposed) fail("closed", "Station control is disposed");
    if (!contexts.has(context) || context.epoch !== epoch)
      fail("unauthenticated", "Host-created invocation context required");
    if (context === owner) return;
    const task = tasks.get(context.taskId);
    if (!task || task.revoked || task.expiresAt <= Date.now()) {
      if (task) revoke(task.id);
      fail("revoked", "Task authorization expired or was revoked");
    }
    if (store.active().id !== task.workspaceId)
      fail("workspace_changed", "Authorized workspace is not active");
    return task;
  }
  function asset(id: string) {
    return (
      store.active().assets.find((a) => a.id === id) ?? widgetDefinitionAsset([], id) ?? builtinIconAsset(id) ?? availableDeskTemplates([]).find(a => a.id === id) ??
      fail("unavailable", "Asset is unavailable")
    );
  }
  function permits(task: Task, id: string, write = false) {
    return (
      task.created.has(id) ||
      (write
        ? task.scope.editableAssets
        : [...task.scope.readableAssets, ...task.scope.editableAssets]
      ).includes(id)
    );
  }
  function requireResource(
    context: InvocationContext,
    requirement: Requirement,
  ) {
    const task = taskFor(context);
    if (!task) return;
    if (
      requirement.asset &&
      !permits(task, requirement.asset, requirement.write)
    )
      fail(
        "permission_required",
        `Asset ${requirement.write ? "editing" : "reading"} is outside this task`,
        requirement,
      );
    if (
      requirement.surface &&
      !task.scope.surfaces.includes(requirement.surface as any)
    )
      fail(
        "permission_required",
        "Layout destination is outside this task",
        requirement,
      );
    if (
      requirement.capability &&
      !task.scope.capabilities.includes(requirement.capability)
    )
      fail(
        "permission_required",
        "Capability is outside this task",
        requirement,
      );
  }
  function revoke(id: string) {
    const task = tasks.get(id);
    if (!task || task.revoked) return;
    task.revoked = true;
    task.controller.abort();
    for (const op of operations.values())
      if (op.taskId === id && op.status === "running") {
        op.controller.abort();
        op.status = "cancelled";
      }
    store.revokeTaskInstallations(id);
    ports.programs?.revokeTask(id);
    record(id, "permissions.revoke", "revoked");
  }
  const registry = new Map<string, Definition>();
  function define(method: string, definition: Definition) {
    registry.set(method, definition);
  }
  const readable = (p: { assetId: string }): Requirement[] => [
    { asset: p.assetId },
  ];
  const writable = (p: { assetId: string }): Requirement[] => [
    { asset: p.assetId, write: true },
  ];
  function permitsFile(task: Task | undefined, assetId: string, path: string, write = false) {
    const rules = task?.scope.fileAccess?.[assetId];
    if (!rules) return true;
    return (write ? rules.write : [...rules.read, ...rules.write]).some(rule => rule.endsWith("/") ? path.startsWith(rule) : path === rule);
  }
  const describe = () =>
    [...registry].map(([method, d]) => ({
      method,
      version: "1.0.0",
      description: d.description,
      effects: d.effects,
      schema: z.toJSONSchema(d.schema,{io:'input'}),
      outputSchema: z.toJSONSchema(d.output),
      available: d.available?.() ?? true,
    }));
  define("commands.list", {
    schema: empty,
    output: json,
    effects: [],
    description: "Discover typed operations; discovery never grants authority",
    run: (_, c) => { const t = taskFor(c); return describe().filter(d => !t || ["commands.list", "permissions.inspect", "permissions.request", "operations.inspect", "operations.cancel", "events.read"].includes(d.method) || t.scope.operations.includes(d.method)); },
  });
  define("state.inspect", {
    schema: empty,
    output: json,
    effects: [],
    description:
      "Read scoped metadata and placement without source, settings or credentials",
    run: (_, c) => {
      const w = store.active(),
        task = taskFor(c);
      if (!task)
        return {
          revision,
          version: { epoch, revision },
          workspace: {
            id: w.id,
            name: w.name,
            activeDeskId: w.activeDeskId,
            assets: w.assets.map(summary),
            assetGroups: w.assetGroups ?? [],
            dock: w.dock,
          },
          history: store.layoutHistory(),
        };
      return {
        version: { epoch, revision },
        workspace: {
          id: w.id,
          name: w.name,
          activeDeskId: w.activeDeskId,
          assets: w.assets.filter((a) => permits(task, a.id)).map(summary),
          panels: Object.values(w.dock.panels)
            .filter((p) =>
              task.scope.surfaces.includes(hostSurface(w.dock, p.id) as any),
            )
            .map((p) => ({
              id: p.id,
              kind: p.kind,
              ...(p.definitionId ? { definitionId: p.definitionId } : {}),
            })),
        },
      };
    },
  });
  define("assets.group.move", {
    schema: z.object({ assetIds: z.array(z.string().min(1)).min(1).max(200), groupId: z.string().min(1).nullable() }).strict(),
    output: z.object({ moved: z.number() }), effects: ["asset.metadata.write"],
    description: "Move authorized authored assets into an editable visual group; virtual groups reject writes",
    requirements: p => p.assetIds.map((asset: string) => ({ asset, write: true })),
    run: p => { store.moveAssetGroupMembers(p.assetIds, p.groupId); return { moved: new Set(p.assetIds).size }; },
  });
  const dataDocument = (id: string) => { const a = asset(id); if (a.kind !== "data-source") fail("invalid_source", "Choose a data-source asset"); return { asset: a, document: dataDocumentSchema.parse(JSON.parse(a.files!["data.json"] ?? "")) }; };
  define("data.query", {
    schema: z.object({ assetId: identity, view: viewConfigurationSchema.default(() => viewConfigurationSchema.parse({})) }).strict(), output: dataSnapshotSchema, effects: [],
    description: "Read one data source through an explicit provider; formulas use a bounded WASM VM, no ambient IO",
    requirements: p => { const result: Requirement[] = [{ asset: p.assetId }]; const document = dataDocument(p.assetId).document; if (document.provider === "script" && document.scriptId) result.push({ asset: document.scriptId }); if (document.provider === "script" || document.columns.some(c => c.type === "formula")) result.push({ capability: scriptEvaluator.id }); return result; },
    run: async (p, c, signal) => {
      const { asset: source, document } = dataDocument(p.assetId), revision = source.revision;
      const t = taskFor(c);
      const catalog: DataSourceProvider = { id: "station.assets", readOnly: true, query: () => ({ columns: [{ id: "name", label: "Name", type: "text" }, { id: "kind", label: "Type", type: "text" }, { id: "revision", label: "Revision", type: "number" }], records: store.active().assets.filter(a => !t || permits(t, a.id)).slice(0,500).map(a => ({ id: a.id, values: { name: a.name, kind: a.kind, revision: a.revision } })) }) };
      const runtime: DataSourceProvider = { id: "station.activity", readOnly: true, query: () => ({ columns: [{ id: "method", label: "Command", type: "text" }, { id: "outcome", label: "Outcome", type: "text" }, { id: "task", label: "Task", type: "text" }], records: audit.filter(e => !t || e.taskId === t.id).slice(-200).map(e => ({ id: String(e.sequence), values: { method: e.method, outcome: e.outcome, task: e.taskId } })) }) };
      const providers: DataSourceProvider[] = [{ id: "local.table", readOnly: false, query: d => ({ columns: d.columns, records: d.records }) }, catalog, runtime, ...(ports.dataProviders ?? [])];
      let scriptRevision: number | undefined;
      let raw: ReturnType<typeof queryDataSource>;
      if (document.provider === "script") {
        if (!document.scriptId) fail("invalid_source", "Choose a JavaScript calculation for this data source");
        requireResource(c, { asset: document.scriptId! });
        requireResource(c, { capability: scriptEvaluator.id });
        const script = asset(document.scriptId!);
        if (script.kind !== "script" || !script.files?.["main.js"] || script.files?.["program.json"]) fail("invalid_source", "Choose a JavaScript calculation with main.js");
        if (!ports.evaluateScript) fail("provider_unavailable", "Script provider unavailable");
        scriptRevision = script.revision;
        const output = await ports.evaluateScript!({ code: script.files!["main.js"]!, input: { columns: document.columns, records: document.records } }, signal);
        const result = dataDocumentSchema.parse({ version: 1, provider: "script", ...z.object({ columns: z.array(columnSchema).max(32), records: z.array(recordSchema).max(500) }).strict().parse(output.value) });
        raw = { provider: "script", readOnly: true, columns: result.columns, records: result.records };
      } else raw = queryDataSource(document, providers, viewConfigurationSchema.parse({ ...p.view, search: "", sortBy: undefined }));
      const formulas = raw.columns.filter(c => c.type === "formula" && c.formula);
      if (formulas.length) {
          requireResource(c, { capability: scriptEvaluator.id });
        if (!ports.evaluateScript) fail("provider_unavailable", "Script provider unavailable");
        const evaluated = await ports.evaluateScript!({ code: `return input.map(record => { const row = {...record.values}; ${formulas.map(c => `row[${JSON.stringify(c.id)}] = (${c.formula});`).join("\n")} return {id:record.id,values:row}; });`, input: raw.records }, signal);
        raw.records = z.array(recordSchema).max(500).parse(evaluated.value);
      }
      signal.throwIfAborted(); if (asset(p.assetId).revision !== revision) fail("conflict", "Data source changed during query");
      if (scriptRevision !== undefined && asset(document.scriptId!).revision !== scriptRevision) fail("conflict", "Provider script changed during query");
      const filtered = queryDataSource({ ...document, provider: "result", columns: raw.columns, records: raw.records }, [{ id: "result", readOnly: raw.readOnly, query: d => d }], p.view);
      return { ...filtered, provider: raw.provider, sourceId: p.assetId, revision };
    },
  });
  define("capture.configure", {
    schema: z.object({ assetId: identity, expectedAssetRevision: z.number().int().nonnegative(), configuration: captureRulesSchema }).strict(),
    output: assetSummarySchema, effects: ["asset.write"], requirements: writable,
    description: "Save inert first-match capture rules on a writable Inbox source; no execution or retroactive processing",
    run: p => {
      const { asset: source, document } = dataDocument(p.assetId);
      if (document.provider !== "local.table") fail("read_only", "Capture rules need a writable local table");
      const status = document.columns.find(column => column.id === "status");
      if (!status || !["text", "select"].includes(status.type)) fail("invalid_source", "Inbox needs a Status column");
      if (status.type === "select" && status.options?.length && p.configuration.rules.some((rule: CaptureRule) => rule.enabled && !status.options!.includes(rule.status))) fail("invalid_input", "Choose a status from this inbox's Status options");
      store.patchFiles(source.id, p.expectedAssetRevision, { "capture.json": JSON.stringify(p.configuration, null, 2) });
      return summary(asset(source.id));
    },
  });
  define("capture.create", {
    schema: z.object({ assetId: identity, expectedAssetRevision: z.number().int().nonnegative(), text: z.string().trim().min(1).max(8192) }).strict(),
    output: assetSummarySchema, effects: ["asset.write"], requirements: writable,
    description: "Capture one text item and apply the destination's first matching rule in one revision-checked local record write",
    run: p => {
      const { asset: source, document } = dataDocument(p.assetId);
      const next = captureRecord(document, readCaptureRules(source.files?.["capture.json"]), p.text, crypto.randomUUID(), new Date().toISOString());
      store.patchFiles(source.id, p.expectedAssetRevision, { "data.json": JSON.stringify(next, null, 2) });
      return summary(asset(source.id));
    },
  });
  define("data.mutate", {
    schema: z.object({ assetId: identity, expectedAssetRevision: z.number().int().nonnegative(), record: recordSchema.optional(), removeId: identity.optional(), column: columnSchema.optional() }).strict(), output: assetSummarySchema, effects: ["asset.write"], requirements: writable,
    description: "Revision-checked local data upsert/delete/schema edits; read-only integrations reject writes",
    run: p => { const { asset: source, document } = dataDocument(p.assetId); if (document.provider !== "local.table") fail("read_only", "This data provider is read-only");
      if ([p.record, p.removeId, p.column].filter(x => x !== undefined).length !== 1) fail("invalid_input", "Choose one data mutation");
      if (p.record) { const next = { ...p.record, values: Object.fromEntries(Object.entries(p.record.values).filter(([id]) => document.columns.find(c => c.id === id)?.type !== "formula")) }; document.records = document.records.some(r => r.id === next.id) ? document.records.map(r => r.id === next.id ? next : r) : [...document.records, next]; }
      if (p.removeId) document.records = document.records.filter(r => r.id !== p.removeId);
      if (p.column) document.columns = [...document.columns.filter(col => col.id !== p.column.id), p.column];
      const next = dataDocumentSchema.parse(document); store.patchFiles(source.id, p.expectedAssetRevision, { "data.json": JSON.stringify(next, null, 2) }); return summary(asset(source.id));
    },
  });
  define("scripts.run", {
    schema: z.object({ assetId: identity, input: z.json() }).strict(), output: scriptOutputSchema, effects: ["execute.script"], requirements: p => [{ asset: p.assetId }, { capability: scriptEvaluator.id }], available: () => !!ports.evaluateScript,
    description: "Evaluate current script source in a resource-bounded WASM VM with JSON input/output only; cancel to terminate",
    run: async (p, _, signal) => { const source = asset(p.assetId); if (source.kind !== "script" || source.files?.["program.json"] || !source.files?.["main.js"]) fail("invalid_source", "Choose a JavaScript calculation with main.js; TypeScript programs use Build and Run"); const revision = source.revision; const result = await ports.evaluateScript!({ code: source.files!["main.js"] ?? "", input: p.input }, signal); signal.throwIfAborted(); if (asset(p.assetId).revision !== revision) fail("conflict", "Script changed during execution"); return result; },
  });
  const programRequirements=(p:{instanceId:string}):Requirement[]=>{
    const instance=store.active().programming?.instances.find(item=>item.id===p.instanceId);
    const panel=store.active().dock.panels[p.instanceId];
    const sourceId=instance?.installationId?store.active().installations.find(installation=>installation.installationId===instance.installationId)?.packageAssetId:instance?.definitionId;
    return [...(sourceId?[{asset:sourceId}]:[]),...(panel?[{surface:hostSurface(store.active().dock,p.instanceId)??'main'}]:[]),{capability:'station:programs/execute'}];
  };
  function programOwner(p:{instanceId:string},c:InvocationContext){const task=taskFor(c);const instance=store.active().programming?.instances.find(item=>item.id===p.instanceId);if(task&&instance&&instance.taskId!==task.id)fail('permission_required','Program instance belongs to another principal');return task;}
  const programAvailable=()=>!!ports.programs;
  define('assets.custom.update',{schema:z.object({assetId:identity,expectedAssetRevision:z.number().int().nonnegative(),content:z.json()}).strict(),output:z.object({assetId:identity,revision:z.number().int().nonnegative()}),effects:['asset.data.write'],available:programAvailable,requirements:p=>[{asset:p.assetId,write:true}],description:'Validate a custom document against its available activated type and commit one exact revision',run:p=>ports.programs!.updateCustom(p.assetId,p.expectedAssetRevision,p.content)});
  define('navigation.saveDefinition',{schema:z.object({panelId:identity,name:z.string().trim().min(1).max(120)}).strict(),output:z.object({assetId:identity}),effects:['asset.create','source.write'],requirements:p=>[{surface:hostSurface(store.active().dock,p.panelId)??'sidebar'}],description:'Fork one Navigation configuration as reusable source without selection or grants',run:(p,c)=>{const task=taskFor(c);if(task&&!task.scope.create)fail('permission_required','Definition creation denied');const panel=store.active().dock.panels[p.panelId];if(!panel||!(panel.kind==='navigation'||panel.kind==='widget'&&panel.widget==='navigation'))fail('invalid_target','Choose Navigation');const assetId=store.createWidgetDefinition(p.name),asset=store.active().assets.find(asset=>asset.id===assetId)!;const config=panel.navigation??{filter:normalizeNavigation(store.active().navigation),presentation:'list' as const};store.patchFiles(assetId,asset.revision,{'widget.json':JSON.stringify({version:1,widget:'navigation',title:p.name,description:'Navigation variant',defaults:{navigation:{filter:config.filter,presentation:config.presentation}}})});task?.created.add(assetId);return {assetId};}});
  define('programs.fromDefinition',{schema:z.object({instanceId:identity,definitionId:identity}).strict(),output:json,effects:['instance.activate'],available:programAvailable,requirements:p=>[...programRequirements(p),{capability:'station:programs/execute'}],description:'Explicitly select a prepared package snapshot; starts stopped with no borrowed grants',run:(p,c)=>{const task=programOwner(p,c);if(task&&!task.scope.create)fail('permission_required','Instance creation denied');if(task&&Object.keys(task.scope.fileAccess??{}).length)fail('permission_required','Package snapshots require whole-source access');const installation=store.active().installations.find(item=>item.manifest.contributions.some(def=>`${item.id}/${def.id}`===p.definitionId));if(!installation)fail('not_found','Package unavailable');requireResource(c,{asset:installation.packageAssetId});const contribution=installation.manifest.contributions.find(def=>`${installation.id}/${def.id}`===p.definitionId)!;const kind=contribution.role==='widget'||contribution.role==='editor'?'widget':contribution.role==='command'?'action':'service';if(kind==='widget'&&!store.active().dock.panels[p.instanceId])fail('invalid_target','Place a widget first');return ports.programs!.fromInstallation(p.instanceId,p.definitionId,kind,task?.id);}});
  define('navigation.initialize',{schema:z.object({panelId:identity}).strict(),output:z.object({saved:z.boolean()}),effects:['layout.write'],requirements:p=>[{surface:hostSurface(store.active().dock,p.panelId)??'sidebar'}],description:'Initialize one Navigation widget with an owned Pages view atomically; never re-create removed areas',run:p=>{store.initializeNavigation(p.panelId);return {saved:true};}});
  define('navigation.configure',{schema:z.object({panelId:identity,filter:z.object({query:z.string().max(2000),kinds:z.array(z.enum(['assets','panels'])).max(2),assetKinds:z.array(z.string().max(80)).max(32),sort:z.enum(['name','workspace']),pinned:z.array(identity).max(128),excluded:z.array(identity).max(128)}).strict().optional(),presentation:z.enum(['list','tree','compact']).optional(),selectedAssetId:identity.nullable().optional()}).strict(),output:z.object({saved:z.boolean()}),effects:['layout.write'],requirements:p=>[{surface:hostSurface(store.active().dock,p.panelId)??'sidebar'},...(p.selectedAssetId?[{asset:p.selectedAssetId}]:[])],description:'Configure one Navigation instance and its independent selection',run:p=>{const panel=store.active().dock.panels[p.panelId];if(!panel)fail('not_found','Navigation unavailable');const previous=panel.navigation??{filter:normalizeNavigation(store.active().navigation),presentation:'list' as const};store.configureNavigation(p.panelId,{...previous,...(p.filter?{filter:normalizeNavigation(p.filter as any)}:{}),...(p.presentation?{presentation:p.presentation}:{}),...(p.selectedAssetId!==undefined?{selectedAssetId:p.selectedAssetId??undefined}:{})});return {saved:true};}});
  define('programs.inspect',{schema:empty,output:json,effects:[],available:programAvailable,description:'Inspect scoped program/service lifecycle and binding metadata; no source or runtime handles',run:(_,c)=>{const task=taskFor(c);return ports.programs!.inspect().filter(item=>!task||store.active().programming?.instances.find(instance=>instance.id===item.id)?.taskId===task.id);}});
  define('programs.create',{schema:z.object({instanceId:identity,kind:z.enum(['widget','service','action']),draft:draftSchema.optional(),assetId:identity.optional()}).strict(),output:json,effects:['instance.create'],available:programAvailable,description:'Create a stopped program instance without grants or activation',requirements:p=>[...(p.assetId?[{asset:p.assetId}]:[]),...(store.active().dock.panels[p.instanceId]?[{surface:hostSurface(store.active().dock,p.instanceId)??'main'}]:[]),{capability:'station:programs/execute'}],run:(p,c)=>{const task=taskFor(c);if(task&&!task.scope.create)fail('permission_required','Instance creation is outside this task');if(store.active().programming?.instances.some(item=>item.id===p.instanceId)){programOwner(p,c);return {instanceId:p.instanceId};}if(p.kind==='widget'&&!store.active().dock.panels[p.instanceId])fail('invalid_target','Create a widget placement first');if(p.assetId)ports.programs!.fromAsset(p.instanceId,p.assetId,p.kind,task?.id);else ports.programs!.create(p.instanceId,p.kind,p.draft,undefined,task?.id);return {instanceId:p.instanceId};}});
  define('programs.draft',{schema:z.object({instanceId:identity,expectedInstanceRevision:z.number().int().nonnegative(),draft:draftSchema}).strict(),output:json,effects:['instance.write'],available:programAvailable,description:'Save an inert draft; running snapshots do not change',requirements:programRequirements,run:(p,c)=>{programOwner(p,c);ports.programs!.update(p.instanceId,p.expectedInstanceRevision,p.draft);return {saved:true};}});
  define('programs.wire',{schema:z.object({instanceId:identity,expectedInstanceRevision:z.number().int().nonnegative(),bindings:z.array(bindingSchema).max(16),startup:z.boolean().default(false),surfaceAccess:z.boolean().default(false)}).strict(),output:json,effects:['instance.bind'],available:programAvailable,description:'Wire exact named operations/resources within previously approved principal authority',requirements:p=>[...programRequirements(p),...(p.surfaceAccess?[{capability:'station:ui/compose'}]:[]),...p.bindings.flatMap((binding:any)=>[{capability:binding.serviceId==='builtin:metadata'?'station:assets/metadata':'station:services/read'},...binding.resources.flatMap((id:string)=>store.active().assets.some(asset=>asset.id===id)?[{asset:id,write:binding.serviceId==='builtin:metadata'}]:store.active().dock.panels[id]?[{surface:hostSurface(store.active().dock,id)??'main'}]:[])])],run:(p,c)=>{const task=programOwner(p,c);if(task&&p.startup)fail('permission_required','Task-owned instances cannot opt into restart');if(task)for(const binding of p.bindings){const target=store.active().programming?.instances.find(item=>item.id===binding.serviceId);if(target&&target.taskId!==task.id)requireResource(c,{capability:'station:services/'+target.id});if(target){const record=store.active().programming?.snapshots.find(record=>record.id===target.snapshotId);for(const method of record?.draft.methods.filter(method=>binding.operations.includes(method.name))??[])for(const effect of method.effects){if(effect.operation==='activity.read')requireResource(c,{capability:'station:services/activity'});if(effect.operation==='selection.read')requireResource(c,{capability:'station:services/selection'});if(effect.operation==='metadata.write'){requireResource(c,{capability:'station:assets/metadata'});for(const resource of effect.resource?[effect.resource]:binding.resources){if(!binding.resources.includes(resource))fail('permission_required','Effect resource outside binding');requireResource(c,{asset:resource,write:true});}}}}if(binding.serviceId==='builtin:activity')requireResource(c,{capability:'station:services/activity'});if(binding.serviceId==='builtin:selection')requireResource(c,{capability:'station:services/selection'});}ports.programs!.wire(p.instanceId,p.expectedInstanceRevision,p.bindings,p.startup,p.surfaceAccess,task?.id);return {wired:true};}});
  define('programs.apply',{schema:z.object({instanceId:identity}).strict(),output:json,effects:['source.read','instance.activate'],available:programAvailable,description:'Compile local TypeScript and pin an immutable snapshot; invalid drafts retain the prior snapshot',requirements:p=>[...programRequirements(p),...(store.active().programming?.instances.find(item=>item.id===p.instanceId)?.draft.dependencies??[]).map(asset=>({asset}))],run:(p,c,signal)=>{const task=programOwner(p,c);const dependencies=store.active().programming?.instances.find(item=>item.id===p.instanceId)?.draft.dependencies??[];if(task&&dependencies.some(id=>task.scope.fileAccess?.[id]))fail('permission_required','Activation requires whole-source dependency access');return ports.programs!.activate(p.instanceId,signal);}});
  define('programs.start',{schema:z.object({instanceId:identity}).strict(),output:json,effects:['execute.script'],available:programAvailable,description:'Start a retained service/widget session or run an action within explicit bindings',requirements:programRequirements,run:(p,c,signal)=>{programOwner(p,c);return ports.programs!.start(p.instanceId,signal);}});
  define('programs.stop',{schema:z.object({instanceId:identity}).strict(),output:json,effects:['instance.stop'],available:programAvailable,description:'Terminate owned work and revoke pending effects/handles',requirements:programRequirements,run:(p,c)=>{programOwner(p,c);ports.programs!.stop(p.instanceId);return {stopped:true};}});
  define('programs.saveDefinition',{schema:z.object({instanceId:identity,name:z.string().trim().min(1).max(120)}).strict(),output:json,effects:['asset.create','source.write'],available:programAvailable,description:'Extract reusable source/configuration without grants or live state',requirements:programRequirements,run:(p,c)=>{const task=programOwner(p,c);if(task&&!task.scope.create)fail('permission_required','Source creation denied');const result=ports.programs!.saveDefinition(p.instanceId,p.name);task?.created.add(result.assetId);return result;}});
  define('programs.configure',{schema:z.object({instanceId:identity,expectedInstanceRevision:z.number().int().nonnegative(),configuration:z.record(z.string().max(80),z.union([z.string().max(4096),z.boolean()]))}).strict(),output:z.object({saved:z.boolean()}),effects:['instance.write'],available:programAvailable,requirements:programRequirements,description:'Set declared host-rendered settings without granting authority',run:(p,c)=>{programOwner(p,c);ports.programs!.configure(p.instanceId,p.expectedInstanceRevision,p.configuration);return {saved:true};}});
  define('programs.action',{schema:z.object({instanceId:identity,method:z.string().max(80),input:z.json()}).strict(),output:json,effects:['execute.script'],available:programAvailable,requirements:programRequirements,description:'Invoke a declared settings action within the instance existing bindings',run:(p,c,signal)=>{programOwner(p,c);return ports.programs!.action(p.instanceId,p.method,p.input,signal);}});
  define('programs.event',{schema:z.object({instanceId:identity,event:z.object({revision:z.number().int().nonnegative(),sequence:z.number().int().positive(),key:z.string().max(120),type:z.enum(['activate','change','select']),value:z.union([z.string().max(4096),z.boolean()]).optional()}).strict()}).strict(),output:z.object({delivered:z.boolean()}),effects:['surface.event'],available:programAvailable,requirements:programRequirements,description:'Deliver a revision-checked interaction to its owning surface',run:async(p,c)=>{programOwner(p,c);await ports.programs!.event(p.instanceId,p.event);return {delivered:true};}});
  define('programs.createAsset',{schema:z.object({instanceId:identity,name:z.string().trim().min(1).max(120)}).strict(),output:z.object({assetId:identity,type:z.string()}),effects:['asset.create'],available:programAvailable,requirements:programRequirements,description:'Create document data from an activated namespaced asset type; no runtime or grants',run:(p,c)=>{const task=programOwner(p,c);if(task&&!task.scope.create)fail('permission_required','Asset creation denied');const result=ports.programs!.createCustom(p.instanceId,p.name);task?.created.add(result.assetId);return result;}});
  define("assets.list", {
    schema: empty,
    output: z.array(assetSummarySchema),
    effects: [],
    description: "List only authorized asset metadata",
    run: (_, c) => {
      const t = taskFor(c);
      return store
        .active()
        .assets.filter((a) => !t || permits(t, a.id))
        .map(summary);
    },
  });
  define("assets.catalog", {
    schema: empty, output: z.array(assetSummarySchema), effects: [], description: "List authorized asset metadata and read-only built-in definitions",
    run: (_, c) => { const t = taskFor(c); return [...store.active().assets, ...builtinWidgetAssets(), ...builtinIconAssets(), ...availableDeskTemplates([])].filter(a => !t || permits(t, a.id)).map(summary); },
  });
  define("asset.read", {
    schema: z.object({ assetId: identity }).strict(),
    output: json,
    effects: [],
    description: "Read one authorized virtual source project",
    requirements: readable,
    run: (p, c) => ({
      ...summary(asset(p.assetId)),
      files: Object.fromEntries(Object.entries(assetFiles(asset(p.assetId))).filter(([path]) => permitsFile(taskFor(c), p.assetId, path))),
    }),
  });
  define("asset.metadata.read", {
    schema: z.object({ assetId: identity }).strict(),
    output: assetSummarySchema,
    effects: [],
    description: "Read metadata without authored source",
    requirements: readable,
    run: (p) => summary(asset(p.assetId)),
  });
  define("asset.metadata", {
    schema: z
      .object({ assetId: identity, patch: metadataPatchSchema })
      .strict(),
    output: json,
    effects: ["asset.write"],
    description: "Edit asset title/description through shared validation",
    requirements: writable,
    run: (p) => {
      store.patchAssetMetadata(p.assetId, p.patch);
      return { assetId: p.assetId };
    },
  });
  define("asset.files.patch", {
    schema: z
      .object({
        assetId: identity,
        expectedAssetRevision: z.number().int().nonnegative(),
        patch: z.record(
          z.string().max(240),
          z
            .string()
            .max(1024 * 1024)
            .nullable(),
        ),
      })
      .strict(),
    output: assetSummarySchema,
    effects: ["asset.write"],
    description:
      "Atomically patch virtual files, invalidate builds and reject stale source",
    requirements: writable,
    run: (p, c) => {
      if (Object.keys(p.patch).some(path => !permitsFile(taskFor(c), p.assetId, path, true))) fail("permission_required", "Virtual file is outside this task's write policy");
      store.patchFiles(p.assetId, p.expectedAssetRevision, p.patch);
      return summary(asset(p.assetId));
    },
  });
  define("asset.create", {
    schema: z
      .object({
        name: z.string().trim().min(1).max(120),
        kind: z.enum(["web-content", "component", "theme", "package", "svg", "decision", "data-source", "script", "custom", "markdown", "note"]),
        files: filesSchema.optional(),
      })
      .strict(),
    output: assetSummarySchema,
    effects: ["asset.create"],
    description: "Create inert authored source; does not execute or install",
    run: (p, c) => {
      const t = taskFor(c);
      if (t && !t.scope.create)
        fail("permission_required", "Asset creation is outside this task");
      if (t && t.created.size >= 200)
        fail("limit", "Task-created asset limit reached");
      if (p.files === undefined && p.kind !== "web-content") {
        const id =
          p.kind === "component"
            ? store.createAsset(p.name)
            : store.createDataAsset(p.kind, p.name);
        t?.created.add(id);
        return summary(asset(id));
      }
      const files =
        p.files ?? (p.kind === "web-content" ? WEB_PROJECT_STARTER : {});
      if (
        Object.keys(files).some((path) => !validSourcePath(path)) ||
        new TextEncoder().encode(JSON.stringify(files)).length > 1024 * 1024
      )
        fail("invalid_input", "Invalid virtual source project");
      const a = {
        id: `asset-${crypto.randomUUID()}`,
        instanceId: crypto.randomUUID(),
        revision: 0,
        name: p.name,
        description: "",
        kind: p.kind,
        files,
        ...(p.kind === "web-content"
          ? { html: files["index.html"] ?? "" }
          : {}),
        ...(p.kind === "component"
          ? { language: "rust", artifact: null, grants: {} }
          : {}),
      } as Asset;
      if (a.kind === "component") rebaseComponent(a);
      store.importAssets([a]);
      t?.created.add(a.id);
      return summary(a);
    },
  });
  define("asset.fork", {
    schema: z
      .object({ assetId: identity, name: z.string().trim().min(1).max(120) })
      .strict(),
    output: assetSummarySchema,
    effects: ["asset.create"],
    description:
      "Fork authorized source without inherited grants, builds or activation",
    requirements: readable,
    run: (p, c) => {
      const t = taskFor(c);
      if (t && !t.scope.create)
        fail("permission_required", "Asset creation is outside this task");
      if (t && t.created.size >= 200)
        fail("limit", "Task-created asset limit reached");
      const source = store.active().assets.find(a => a.id === p.assetId) ?? widgetDefinitionAsset([], p.assetId) ?? builtinIconAsset(p.assetId) ?? availableDeskTemplates([]).find(a => a.id === p.assetId);
      if (!source) fail("unavailable", "Asset unavailable");
      const a: Asset = structuredClone(source);
      a.id = `asset-${crypto.randomUUID()}`;
      a.instanceId = crypto.randomUUID();
      a.name = p.name;
      a.revision = 0;
      a.origin = { assetId: p.assetId, revision: source.revision };
      if (a.kind === "widget-definition") {
        const recipe = parseWidgetRecipe(a.files["widget.json"] ?? "");
        a.files["widget.json"] = JSON.stringify({ ...recipe, title: p.name, origin: a.origin, forkDefaults: recipe.defaults }, null, 2);
      }
      delete a.editorPolicyId;
      if (a.kind === "component") {
        a.artifact = null;
        a.grants = {};
        rebaseComponent(a);
      }
      if (a.kind === "package") {
        const manifest = parseManifest(a.files["station.json"] ?? "");
        a.files["station.json"] = JSON.stringify(
          { ...manifest, id: `package-${crypto.randomUUID().slice(0, 8)}` },
          null,
          2,
        );
      }
      store.importAssets([a]);
      t?.created.add(a.id);
      return summary(a);
    },
  });
  define("asset.open", {
    schema: z.object({ assetId: identity, editorId: identity.optional(), presentation: z.enum(["tab", "peek", "full"]).default("tab") }).strict(),
    output: z.object({ panelId: z.string(), editorId: z.string() }), effects: ["layout.write", "execute.editor"],
    description: "Open an authorized asset using a compatible editor and explicit presentation", requirements: p => [{ asset: p.assetId }, { surface: "main" }],
    run: (p, c) => {
      const source = store.active().assets.find(a => a.id === p.assetId) ?? widgetDefinitionAsset([], p.assetId) ?? builtinIconAsset(p.assetId) ?? availableDeskTemplates([]).find(a => a.id === p.assetId);
      if (!source) fail("unavailable", "Asset unavailable");
      const choice = resolveEditor(store.active(), source, p.editorId);
      if (p.editorId && !choice.choices.some(item => item.id === p.editorId)) fail("invalid_input", "Editor is unavailable or incompatible");
      const t = taskFor(c);
      if (t && choice.editorId !== "station" && ![...t.packages].some(id => choice.editorId.startsWith(id + "/"))) fail("permission_required", "Editor execution is outside this task");
      const opened = store.dispatchDock({ type: "openAsset", assetId: p.assetId });
      if (!opened.ok) fail("unavailable", opened.reason);
      const panelId = opened.panelId ?? Object.values(opened.layout.panels).find(panel => panel.kind === "asset" && panel.assetId === p.assetId)?.id;
      if (!panelId) fail("unavailable", "Editor panel unavailable");
      const configured = store.dispatchDock({ type: "setEditor", panelId, definitionId: choice.editorId === "station" ? undefined : choice.editorId });
      if (!configured.ok) fail("unavailable", configured.reason);
      if (p.presentation === "peek") store.dispatchDock({ type: "presentPanel", panelId, mode: "peek", edge: "right" });
      if (p.presentation === "full") store.dispatchDock({ type: "maximize", panelId });
      return { panelId, editorId: choice.editorId };
    },
  });
  define("routing.inspect", {
    schema: z.object({ assetId: identity }).strict(), output: z.object({ editorId: z.string(), reason: z.string(), policyId: z.string().nullable(), choices: z.array(z.object({ id: z.string(), title: z.string() })) }),
    effects: [], description: "Explain compatible editor routing; choices never grant execution authority", requirements: readable,
    run: (p, c) => {
      const result = resolveEditor(store.active(), asset(p.assetId));
      const t = taskFor(c);
      if (t) {
        result.choices = result.choices.filter(choice => choice.id === "station" || [...t.packages].some(id => choice.id.startsWith(id + "/")));
        if (!result.choices.some(choice => choice.id === result.editorId)) { result.editorId = "station"; result.reason = "Installed editor is outside this task"; }
        if (result.policyId && !permits(t, result.policyId)) result.policyId = null;
      }
      return result;
    },
  });
  define("routing.configure", {
    schema: z.object({ assetId: identity.optional(), policyId: identity.nullable() }).strict(), output: z.object({ ok: z.literal(true) }),
    effects: ["asset.routing.write"], description: "Bind an inert decision asset to one asset or the workspace; source revisions stay unchanged",
    requirements: p => [...(p.assetId ? [{ asset: p.assetId, write: true }] : []), ...(p.policyId ? [{ asset: p.policyId }] : [])],
    run: (p, c) => { if (taskFor(c) && !p.assetId) fail("permission_required", "Workspace routing requires owner consent"); store.configureEditorPolicy(p.policyId, p.assetId); return { ok: true }; },
  });
  define("authoring.inspect", {
    schema: empty,
    output: json,
    effects: [],
    description:
      "Discover curated dependencies, templates and provider availability",
    run: () => ({
      templates: { web: WEB_PROJECT_STARTER },
      creationDefaults: ["web-content", "component", "theme", "package"],
      dependencies: ["@station/sdk", "@station/ui", "react", "react-dom"],
      providers: {
        web: !!ports.buildWeb,
        componentBuild: !!ports.buildComponent,
        componentRun: !!ports.runComponent,
      },
      arbitraryNpm: false,
    }),
  });
  define("web.build", {
    schema: z.object({ assetId: identity }).strict(),
    output: json,
    effects: ["build.local"],
    available: () => !!ports.buildWeb,
    description: "Build current web source with pinned curated dependencies",
    requirements: readable,
    run: (p, c, signal) => ports.buildWeb!(asset(p.assetId), signal),
  });
  define("component.build", {
    schema: z.object({ assetId: identity }).strict(),
    output: json,
    effects: ["build.cloud"],
    available: () => !!ports.buildComponent,
    description:
      "Build current Component source using the configured cloud provider",
    requirements: readable,
    run: (p, c, signal) => {
      const t = taskFor(c);
      if (t && !t.scope.cloudBuild)
        fail(
          "permission_required",
          "Cloud build sends source and may incur cost; explicit authorization required",
        );
      return ports.buildComponent!(store.active().id, p.assetId, signal);
    },
  });
  define("component.run", {
    schema: z
      .object({
        assetId: identity,
        input: z.string().max(65536),
        imports: z.array(identity).max(16),
      })
      .strict(),
    output: json,
    effects: ["execute.component"],
    available: () => !!ports.runComponent,
    description:
      "Run verified Component bytes with separately bounded import authority",
    requirements: readable,
    run: (p, c, signal) => {
      const t = taskFor(c);
      if (
        t &&
        p.imports.some((id: string) => !t.scope.componentImports.includes(id))
      )
        fail(
          "permission_required",
          "Component imports exceed task authorization",
        );
      return ports.runComponent!(asset(p.assetId), p.input, p.imports, signal);
    },
  });
  define("package.prepare", {
    schema: z.object({ assetId: identity }).strict(),
    output: json,
    effects: ["build.local"],
    available: () => !!ports.preparePackage,
    description:
      "Build an immutable package candidate; never install or grant authority",
    requirements: readable,
    run: async (p, c, signal) => {
      if (preparations.size >= 32)
        fail("limit", "Too many prepared packages in this session");
      const w = store.active(),
        source = asset(p.assetId),
        manifest = parseManifest(assetFiles(source)["station.json"] ?? "");
      const members = packageMembers(manifest, w.assets);
      for (const a of members) requireResource(c, { asset: a.id });
      const revisions = Object.fromEntries(
        [source, ...members].map((a) => [a.id, a.revision]),
      );
      const installation = await ports.preparePackage!(w, p.assetId, signal);
      taskFor(c);
      signal.throwIfAborted();
      const preparationId = crypto.randomUUID();
      preparations.set(preparationId, {
        installation,
        taskId: c.taskId,
        revisions,
      });
      return {
        preparationId,
        packageId: installation.id,
        contributions: installation.manifest.contributions.map((d) => ({
          id: d.id,
          title: d.title,
          role: d.role,
          capabilities: d.capabilities,
        })),
        revisions,
      };
    },
  });
  define("package.install", {
    schema: z
      .object({
        preparationId: identity,
        grants: z.record(identity, z.array(identity).max(32)).default({}),
      })
      .strict(),
    output: json,
    effects: ["package.install"],
    description:
      "Install a prepared snapshot with task-bounded temporary authority",
    run: (p, c) => {
      const prepared = preparations.get(p.preparationId);
      if (!prepared || prepared.taskId !== c.taskId)
        fail("unavailable", "Prepared package unavailable to this task");
      const t = taskFor(c),
        installation = structuredClone(prepared.installation);
      if (
        Object.entries(prepared.revisions).some(
          ([id, rev]) => asset(id).revision !== rev,
        )
      )
        fail("conflict", "Source changed after package preparation");
      const previous = store
        .active()
        .installations.find((i) => i.id === installation.id);
      if (t && previous && previous.authorizationTaskId !== t.id)
        fail(
          "permission_required",
          "Replacing an existing installation needs owner review",
        );
      for (const [id, caps] of Object.entries(p.grants) as [
        string,
        string[],
      ][]) {
        const d = installation.manifest.contributions.find((d) => d.id === id);
        if (
          !d ||
          caps.some(
            (cap) =>
              !d.capabilities.includes(cap) ||
              (t && !t.scope.capabilities.includes(cap)),
          )
        )
          fail(
            "permission_required",
            "Package authority exceeds declarations or task grants",
          );
      }
      installation.grants = p.grants;
      if (t) {
        installation.authorizationTaskId = t.id;
        installation.metadataTargets = [
          ...t.scope.editableAssets,
          ...t.created,
        ];
        t.packages.add(installation.id);
      }
      store.installPackage(installation);
      preparations.delete(p.preparationId);
      return { packageId: installation.id, temporary: !!t };
    },
  });
  define("package.place", {
    schema: z
      .object({
        definitionId: identity,
        assetId: identity.optional(),
        target: targetSchema,
      })
      .strict(),
    output: json,
    effects: ["layout.write", "execute.web"],
    description:
      "Place a task-owned installed widget/editor in an authorized surface",
    requirements: (p) => [
      { surface: p.target.surface },
      ...(p.assetId ? [{ asset: p.assetId }] : []),
    ],
    run: (p, c) => {
      const installation = store
        .active()
        .installations.find(
          (i) =>
            i.enabled &&
            i.manifest.contributions.some(
              (d) => `${i.id}/${d.id}` === p.definitionId,
            ),
        );
      const t = taskFor(c);
      if (!installation || (t && installation.authorizationTaskId !== t.id))
        fail("permission_required", "Installation is not owned by this task");
      const response = store.dispatchDock({
        type: "createContribution",
        definitionId: p.definitionId,
        assetId: p.assetId,
        target: p.target,
      });
      if (!response.ok) fail("invalid_placement", response.reason);
      return { panelId: response.panelId };
    },
  });
  define("packages.list", {
    schema: empty,
    output: json,
    effects: [],
    description:
      "Inspect authorized installation identity, build hashes and declared/reviewed grants without source",
    run: (_, c) => {
      const task = taskFor(c);
      return store
        .active()
        .installations.filter((i) => !task || i.authorizationTaskId === task.id)
        .map((i) => ({
          id: i.id,
          installationId: i.installationId ?? null,
          packageAssetId: i.packageAssetId,
          revision: i.revision,
          enabled: i.enabled,
          authorizationTaskId: i.authorizationTaskId ?? null,
          contributions: i.manifest.contributions.map((d) => ({
            id: d.id,
            role: d.role,
            capabilities: d.capabilities,
            grants: i.grants[d.id] ?? [],
            build: i.builds[d.id]
              ? {
                  sourceHash: i.builds[d.id].sourceHash,
                  documentHash: i.builds[d.id].documentHash,
                  revision: i.builds[d.id].revision,
                  toolchain: i.builds[d.id].toolchain,
                }
              : null,
          })),
        }));
    },
  });
  for (const action of ["commands", "execute", "export"] as const) {
    const binding = { assetId: z.string().min(1).max(200), panelId: z.string().min(1).max(240), revision: z.number().int().nonnegative() };
    define(`vector.editor.${action}`, {
      schema: z.object({ ...binding, ...(action === "execute" ? { command: vectorCommandSchema } : {}) }).strict(),
      output: action === "commands" ? z.array(vectorCommandInfoSchema).max(4096) : action === "export" ? z.object({ source: z.string().max(32768) }).strict() : json,
      effects: [action === "execute" ? "editor.draft.write" : "editor.draft.read"],
      available: () => !!ports.vectorEditors,
      description: `${action} in an explicitly opened VectorCraft SVG editor; saved source is unchanged until Apply`,
      requirements: p => [{ asset: p.assetId, write: action !== "commands" }, { surface: hostSurface(store.active().dock, p.panelId) ?? "main" }],
      run: async (p, _context, signal) => {
        const workspace = store.active(), asset = workspace.assets.find(item => item.id === p.assetId);
        const panel = workspace.dock.panels[p.panelId];
        if (asset?.kind !== "svg" || panel?.kind !== "asset" || panel.assetId !== asset.id) fail("INVALID_ARGUMENT", "Choose an opened SVG editor");
        if (asset.revision !== p.revision) fail("CONFLICT", "Saved source changed; reload VectorCraft");
        if (!ports.vectorEditors) fail("UNAVAILABLE", "VectorCraft editor is unavailable");
        const session = ports.vectorEditors.get(workspace.id, p.panelId, asset.id, p.revision);
        if (action === "execute") {
          const command = vectorCommandSchema.parse(p.command);
          if (!allowedVectorCommand(command.id)) fail("DENIED", "Command is outside the document editing contract");
          return await session.execute(command, signal);
        }
        return await session[action](signal);
      },
    });
  }
  define("dock.apply", {
    schema: controlledDockCommand,
    output: json,
    effects: ["layout.write"],
    description:
      "Apply validated placement through the existing reducer/history",
    requirements: (p) => {
      const r: Requirement[] = [];
      if (p.type === "resizeDashboard") r.push({ surface: "dashboard" });
      if (p.type === "createWidget" && p.defaults?.dataView?.sourceId) r.push({ asset: p.defaults.dataView.sourceId });
      if (p.type === "configureDataView") { if (p.config.sourceId) r.push({ asset: p.config.sourceId }); for (const page of p.config.pages ?? []) r.push({asset:page.assetId}); }
      if (p.type === "configureNote" && p.sourceAssetId) r.push({ asset: p.sourceAssetId });
      if (p.type === "configureActionButton" && p.config.targetId) r.push({ surface: hostSurface(store.active().dock, p.config.targetId) ?? "main" });
      if (p.type === "configureActionButton" && p.config.assetId) r.push({ asset: p.config.assetId });
      if (p.type === "configureActionButton" && p.config.iconAsset) r.push({ asset: p.config.iconAsset.assetId });
      if (p.type === "setWidgetTarget" && p.reference) r.push({ surface: p.reference.ownerId ? hostSurface(store.active().dock, p.reference.ownerId) ?? "main" : p.reference.surface });
      if (p.assetId) r.push({ asset: p.assetId });
      if (p.target) r.push({ surface: p.target.surface });
      if (p.surface) r.push({ surface: p.surface });
      if (p.panelId) {
        const s = hostSurface(store.active().dock, p.panelId);
        if (s) r.push({ surface: s });
        else r.push({ surface: "main" });
      }
      return r;
    },
    run: (p, c) => {
      const t = taskFor(c);
      if (t && p.type === "openAsset") {
        const chosen = resolveEditor(store.active(), asset(p.assetId)).editorId;
        if (chosen !== "station" && ![...t.packages].some(id => chosen.startsWith(id + "/"))) fail("permission_required", "Routed editor is outside this task; owner consent is required");
      }
      const response = store.dispatchDock(p);
      if (!response.ok) throw new Error(response.reason);
      return { panelId: response.panelId ?? null };
    },
  });
  for (const [method, fn] of [
    ["layout.undo", store.undoLayout],
    ["layout.redo", store.redoLayout],
  ] as const)
    define(method, {
      schema: empty,
      output: json,
      effects: ["layout.write"],
      description: method,
      run: (_, c) => {
        if (taskFor(c))
          fail(
            "permission_required",
            "Whole-layout history requires the owner; scoped tasks use explicit placement",
          );
        return fn();
      },
    });
  define("permissions.inspect", {
    schema: empty,
    output: json,
    effects: [],
    description:
      "Inspect your own task authority and pending expansion requests",
    run: (_, c) => {
      const t = taskFor(c);
      return t
        ? {
            task: taskView(t),
            requests: requests.filter((r) => r.taskId === t.id),
          }
        : inspectAccess();
    },
  });
  define("permissions.request", {
    schema: z
      .object({ scope: taskScopeSchema, reason: z.string().min(1).max(1000) })
      .strict(),
    output: json,
    effects: [],
    description:
      "Request a specific expansion; only trusted owner UI can approve",
    run: (p, c) => {
      if (requests.filter((r) => r.status === "pending").length >= 32)
        fail("limit", "Pending review limit reached");
      const r = {
        id: crypto.randomUUID(),
        taskId: c.taskId,
        ...p,
        status: "pending" as const,
      };
      requests.push(r);
      publish();
      return { requestId: r.id, status: r.status };
    },
  });
  define("operations.inspect", {
    schema: z.object({ operationId: identity }).strict(),
    output: json,
    effects: [],
    description:
      "Read your operation status, diagnostics and result after a timeout",
    run: (p, c) => operationView(ownOperation(p.operationId, c)),
  });
  define("operations.cancel", {
    schema: z.object({ operationId: identity }).strict(),
    output: json,
    effects: [],
    description: "Cancel your operation and prevent late commits",
    run: (p, c) => {
      const op = ownOperation(p.operationId, c);
      if (op.status === "running") {
        op.controller.abort();
        op.status = "cancelled";
        publish();
      }
      return operationView(op);
    },
  });
  define("runtime.inspect", {
    schema: z.object({ after: z.number().int().nonnegative().default(0) }).strict(),
    output: z.object({ epoch: z.string(), revision: z.number(), lifecycle: z.object({ state: z.string(), providers: z.number(), scopes: z.number(), acquisitions: z.number(), events: z.array(z.object({ sequence: z.number(), at: z.number(), kind: z.string(), subjectId: z.string(), label: z.string(), state: z.string() })) }).nullable(), activity: z.array(z.object({ sequence: z.number(), taskId: z.string(), method: z.string(), at: z.number(), outcome: z.string(), operationId: z.string().optional() })) }),
    effects: [], description: "Inspect redacted session diagnostics; tasks see only their own activity, owner sees host lifecycle history",
    run: (p, c) => ({ epoch, revision, lifecycle: c === owner ? ports.diagnostics?.() ?? null : null, activity: audit.filter(e => e.sequence > p.after && (c === owner || e.taskId === c.taskId)).slice(-200) }),
  });
  define("events.read", {
    schema: z
      .object({ after: z.number().int().nonnegative().default(0) })
      .strict(),
    output: json,
    effects: [],
    description: "Read bounded redacted activity for your task",
    run: (p, c) => ({
      cursor: change,
      events: audit
        .filter(
          (e) => e.sequence > p.after && (c === owner || e.taskId === c.taskId),
        )
        .slice(-100),
    }),
  });
  function taskView(t: Task) {
    return {
      id: t.id,
      name: t.name,
      source: t.source,
      workspaceId: t.workspaceId,
      expiresAt: t.expiresAt,
      scope: t.scope,
      createdAssets: [...t.created],
      revoked: t.revoked,
    };
  }
  function inspectAccess() {
    return {
      epoch,
      revision,
      tasks: [...tasks.values()].map(taskView),
      requests: [...requests],
      operations: [...operations.values()].map(operationView),
      activity: [...audit],
      commands: describe(),
    };
  }
  function operationView(op: Operation) {
    const { controller, ...view } = op;
    return view;
  }
  function ownOperation(id: string, c: InvocationContext) {
    const op = operations.get(id);
    if (!op || (c !== owner && op.taskId !== c.taskId))
      return fail("unavailable", "Operation unavailable");
    return op;
  }
  function executeForInner(
    c: InvocationContext,
    input: unknown,
  ): { revision: number; version: StateVersion; result: any } {
    const t = taskFor(c),
      request = requestSchema.parse(input),
      d = registry.get(request.method);
    if (!d)
      fail("unknown_command", `Unknown Station command: ${request.method}`);
    if (
      t &&
      ![
        "commands.list",
        "permissions.inspect",
        "permissions.request",
        "operations.inspect",
        "operations.cancel",
        "events.read",
      ].includes(request.method) &&
      !t.scope.operations.includes(request.method)
    )
      fail("permission_required", "Operation is outside this task", {
        method: request.method,
      });
    const key = request.requestId
        ? `${c.taskId}:${request.requestId}`
        : undefined,
      encoded = JSON.stringify(request);
    if (key && dedup.has(key)) {
      const previous = dedup.get(key)!;
      if (previous.input !== encoded)
        fail(
          "conflict",
          "Request identity was reused with different arguments",
        );
      return previous.response as any;
    }
    if (t && d.effects.length && !request.version)
      fail(
        "precondition_required",
        "Inspect state and provide its epoch/revision before mutation",
      );
    if (
      (request.version &&
        (request.version.epoch !== epoch ||
          request.version.revision !== revision)) ||
      (request.expectedRevision !== undefined &&
        request.expectedRevision !== revision)
    )
      fail("conflict", "Stale state revision; inspect before editing");
    const p = d.schema.parse(request.params ?? {});
    if (t && Object.keys(t.scope.fileAccess ?? {}).length) {
      if (request.method.startsWith("package.")) fail("permission_required", "Package execution requires whole-source grants; partial-file tasks cannot install or invoke packages");
      if ((p as any).assetId && t.scope.fileAccess?.[(p as any).assetId] && !["asset.read", "asset.files.patch", "asset.metadata.read", "asset.metadata", "routing.inspect"].includes(request.method)) fail("permission_required", "This operation requires whole-source access; the task has a partial-file policy");
    }
    if (
      d.effects.some(
        (effect) =>
          effect.startsWith("build.") || effect.startsWith("execute."),
      ) &&
      [...operations.values()].filter((op) => op.status === "running").length >=
        8
    )
      fail("limit", "Active operation limit reached");
    for (const r of d.requirements?.(p) ?? []) requireResource(c, r);
    if (d.available && !d.available())
      fail("provider_unavailable", "Required provider is unavailable");
    const controller = new AbortController();
    const abort = () => controller.abort();
    t?.controller.signal.addEventListener("abort", abort, { once: true });
    let response;
    try {
      const value = d.run(p, c, controller.signal);
      if (value instanceof Promise) {
        if (operations.size >= 256) {
          for (const [id, op] of operations)
            if (op.status !== "running") {
              operations.delete(id);
              break;
            }
        }
        const op: Operation = {
          id: crypto.randomUUID(),
          taskId: c.taskId,
          method: request.method,
          status: "running",
          startedAt: Date.now(),
          controller,
        };
        operations.set(op.id, op);
        void value
          .then(
            (result) => {
              taskFor(c);
              for (const r of d.requirements?.(p) ?? []) requireResource(c, r);
              controller.signal.throwIfAborted();
              op.result = d.output.parse(JSON.parse(JSON.stringify(result)));
              op.status = "succeeded";
            },
            (error) => {
              throw error;
            },
          )
          .catch((error) => {
            op.status = controller.signal.aborted ? "cancelled" : "failed";
            op.error = {
              code:
                error instanceof ControlError ? error.code : "operation_failed",
              message:
                error instanceof Error ? error.message : "Operation failed",
            };
          })
          .finally(() => {
            t?.controller.signal.removeEventListener("abort", abort);
            record(c.taskId, request.method, op.status, op.id);
          });
        response = {
          revision,
          version: { epoch, revision },
          result: { operationId: op.id, status: op.status },
        };
      } else {
        t?.controller.signal.removeEventListener("abort", abort);
        response = {
          revision,
          version: { epoch, revision },
          result: d.output.parse(JSON.parse(JSON.stringify(value ?? null))),
        };
        if (d.effects.length || request.method === "permissions.request")
          record(c.taskId, request.method, "succeeded");
      }
    } catch (error) {
      t?.controller.signal.removeEventListener("abort", abort);
      record(c.taskId, request.method, "denied");
      throw error;
    }
    if (key) {
      if (dedup.size >= 1000) dedup.delete(dedup.keys().next().value!);
      dedup.set(key, { input: encoded, response });
    }
    return response;
  }
  function executeFor(c: InvocationContext, input: unknown) {
    try {
      return executeForInner(c, input);
    } catch (error) {
      if (contexts.has(c))
        record(
          c.taskId,
          typeof (input as any)?.method === "string"
            ? (input as any).method.slice(0, 200)
            : "invalid_request",
          "denied",
        );
      throw error;
    }
  }
  const expiry = setInterval(() => {
    for (const t of tasks.values())
      if (!t.revoked && t.expiresAt <= Date.now()) revoke(t.id);
  }, 1000);
  (expiry as any).unref?.();
  return {
    epoch,
    /** Trusted in-process UI only. Never forward this entry point through a transport. */
    execute: (input: unknown) => executeFor(owner, input),
    inspect: () => executeFor(owner, { method: "state.inspect" }).result,
    executeFor,
    describe,
    version: () => ({ epoch, revision }),
    inspectAccess,
    /** Trusted install review reads its prepared snapshot; never exposed as a transport operation. */
    preparedPackage(id: string) {
      const value = preparations.get(id);
      if (!value) fail("unavailable", "Preparation unavailable");
      return structuredClone(value.installation);
    },
    /** Owner UI/explicit headless fixture creates contexts. The credential broker only binds their IDs. */
    issueTask(value: {
      name: string;
      workspaceId: string;
      scope: TaskScope;
      source?: Task["source"];
      durationMs?: number;
    }) {
      if (disposed || value.workspaceId !== store.active().id)
        fail("unavailable", "Task workspace unavailable");
      if ([...tasks.values()].filter((t) => !t.revoked).length >= 32)
        fail("limit", "Active task limit reached");
      const scope = taskScopeSchema.parse(value.scope);
      for (const method of scope.operations)
        if (!registry.has(method))
          fail("unknown_command", `Unknown task operation ${method}`);
      const id = crypto.randomUUID(),
        context = Object.freeze({
          principalId: `${value.source ?? "external"}:${id}`,
          taskId: id,
          workspaceId: value.workspaceId,
          epoch,
        });
      contexts.add(context);
      const task: Task = {
        id,
        context,
        name: value.name.slice(0, 120),
        workspaceId: value.workspaceId,
        expiresAt: Date.now() + Math.min(value.durationMs ?? 3600000, 3600000),
        scope,
        created: new Set(),
        packages: new Set(),
        controller: new AbortController(),
        revoked: false,
        source: value.source ?? "external",
      };
      tasks.set(id, task);
      publish();
      return context;
    },
    contextForTask(id: string) {
      const t = tasks.get(id);
      if (!t) fail("unauthenticated", "Unknown task");
      taskFor(t.context);
      return t.context;
    },
    assertCapability(context: InvocationContext, capability: string) {
      requireResource(context, { capability });
    },
    revoke,
    renewTask(id: string) {
      const task = tasks.get(id);
      if (!task) fail("unavailable", "Task unavailable");
      taskFor(task.context);
      task.expiresAt = Date.now() + 3600000;
      publish();
      return task.expiresAt;
    },
    /** Expansion is owner-only and issues no wire-level approval operation. */
    decideRequest(id: string, approved: boolean) {
      const r = requests.find((r) => r.id === id && r.status === "pending");
      if (!r) fail("unavailable", "Review unavailable");
      const t = tasks.get(r.taskId);
      if (!t) fail("unavailable", "Task unavailable");
      taskFor(t.context);
      if (approved) {
        t.controller.abort();
        t.controller = new AbortController();
        t.scope = taskScopeSchema.parse(r.scope);
      }
      r.status = approved ? "approved" : "denied";
      publish();
    },
    subscribe(
      listener: (event: {
        type: "state.changed" | "control.changed";
        revision: number;
      }) => void,
    ) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      for (const t of tasks.values()) revoke(t.id);
      disposed = true;
      clearInterval(expiry);
      unsubscribe();
      listeners.clear();
    },
  };
}

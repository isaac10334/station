import { useEffect, useState, useSyncExternalStore } from "react";
import { deps } from "../../../composition";
import {
  pairAgentTask,
  revokeAgentTask,
  saveAgentConnection,
  renewAgentTask,
  agentControlTarget,
} from "../../../services/agent-control-client";
import type { TaskScope } from "@station/protocol";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { StatusBadge } from "../ui/status-badge";
import { SettingsSection } from "./settings-section";

/** Trusted consent surface. Authorizations are session-only; model output cannot
 * trigger Apply. Existing asset access and source disclosure are explicit.
 */
export function AgentAccessSettings({ forAgent = false, onAuthorized }: { forAgent?: boolean; onAuthorized?: (taskId: string) => void } = {}) {
  const target = useSyncExternalStore(agentControlTarget.subscribe, agentControlTarget.get);
  const [, refresh] = useState(0);
  useEffect(() => deps.control.subscribe(() => refresh((n) => n + 1)), []);
  const [name, setName] = useState(forAgent ? "Station agent" : "Codex workspace tools"),
    [internal, setInternal] = useState(forAgent);
  const [read, setRead] = useState<string[]>([]),
    [write, setWrite] = useState<string[]>([]);
  const [fileRules, setFileRules] = useState<Record<string, { read: string; write: string }>>({});
  const [create, setCreate] = useState(true),
    [execute, setExecute] = useState(!forAgent),
    [layout, setLayout] = useState(!forAgent);
  const [toolbarPlacement, setToolbarPlacement] = useState(false);
  const [programmability,setProgrammability]=useState(false),[selection,setSelection]=useState(false),[portableUi,setPortableUi]=useState(false);
  const [credentialFile, setCredentialFile] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const access = deps.control.inspectAccess(),
    workspace = deps.store.active();
  const scope = (): TaskScope => ({
    operations: [
      "state.inspect",
      "assets.list",
      "assets.catalog", "runtime.inspect", "routing.inspect",
      "asset.read",
      "asset.metadata.read",
      "asset.metadata",
      "authoring.inspect",
      ...(create ? ["asset.create", "asset.fork"] : []),
      ...(create || write.length ? ["asset.files.patch"] : []),
      ...(execute
        ? [
            "web.build",
            "package.prepare",
            "package.install",
            "package.place",
            "packages.list",
          ]
        : []),
      ...(layout ? ["dock.apply"] : []),
      ...(programmability?['assets.custom.update','programs.inspect','programs.create','programs.draft','programs.wire','programs.apply','programs.start','programs.stop','programs.saveDefinition','programs.fromDefinition','programs.configure','programs.createAsset','programs.action','programs.event']:[]),
      ...(selection?['navigation.configure']:[]),
    ],
    readableAssets: [...new Set([...read, ...write])],
    editableAssets: write,
    fileAccess: Object.fromEntries(Object.entries(fileRules).filter(([id, rule]) => (read.includes(id) || write.includes(id)) && (rule.read.trim() || rule.write.trim())).map(([id, rule]) => [id, { read: rule.read.split(",").map(v => v.trim()).filter(Boolean), write: write.includes(id) ? rule.write.split(",").map(v => v.trim()).filter(Boolean) : [] }])),
    create,
    surfaces: layout ? ["dashboard", ...(toolbarPlacement ? ["toolbar" as const] : []),...(selection?['sidebar' as const]:[])] : [],
    capabilities: execute
      ? ["station:assets/catalog", "station:assets/metadata",...(programmability?['station:programs/execute','station:services/read','station:services/activity']:[]),...(selection?['station:services/selection']:[]),...(portableUi?['station:ui/compose']:[])]
      : [],
    componentImports: [],
    cloudBuild: false,
  });
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((v) => v !== id) : [...values, id];
  return (
    <div className="flex flex-col gap-6">
      {!forAgent && <div className="space-y-2 rounded-lg border border-line bg-frame p-3 text-xs">
        <p className="font-medium">{target ? "This Station session" : "Agent connection unavailable"}</p>
        {target ? <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-fg-3"><dt>Origin</dt><dd className="break-all font-mono">{target.origin}</dd><dt>Instance</dt><dd className="break-all font-mono">{target.instanceId}</dd><dt>Renderer</dt><dd className="break-all font-mono">{target.rendererId}</dd></dl> : <p className="text-fg-3">Run <code>bun run dev:agent</code> and open its localhost origin to pair this tab.</p>}
        <p className="text-fg-3">Account login identifies your devices. Workspace control uses the reviewed task below, bound to this exact tab and instance.</p>
      </div>}
      <SettingsSection
        title="Agent access"
        description="Connections start without workspace authority. Authorize a task for 60 minutes; Stop revokes its work and temporary package permissions."
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Task name
            <Input
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {!forAgent && <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
            />
            Use in Station AI chat
          </label>}
          <p className="text-xs text-fg-3">
            {internal
              ? "Approved tool results can be sent to the model selected in chat. Select this task in chat to use it."
              : "The connecting client's name is self-reported. Pairing does not verify the executable. Approved reads may be shared with its AI model."}
          </p>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={programmability} onChange={event=>setProgrammability(event.target.checked)}/>Author and execute TypeScript with explicitly selected service bindings</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={portableUi} onChange={event=>setPortableUi(event.target.checked)}/>Allow portable UI on task-owned widget placements</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={selection} onChange={event=>setSelection(event.target.checked)}/>Read and configure Navigation selection on the sidebar</label>
          <fieldset className="flex flex-col gap-2 rounded-md border border-line-2 p-3">
            <legend className="px-1 text-sm font-medium">
              Existing assets
            </legend>
            <p className="text-xs text-fg-3">
              Read includes source and metadata. Edit also permits metadata and
              file changes. Newly created task assets are included
              automatically.
            </p>
            {workspace.assets.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={read.includes(a.id) || write.includes(a.id)}
                    onChange={() => setRead(toggle(read, a.id))}
                  />
                  Read
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={write.includes(a.id)}
                    onChange={() => setWrite(toggle(write, a.id))}
                  />
                  Edit
                </label>
                {(read.includes(a.id) || write.includes(a.id)) && <div className="flex w-full flex-wrap gap-2 pl-2"><label className="min-w-40 flex-1 space-y-1">Read paths<Input aria-label={`Read paths for ${a.name}`} value={fileRules[a.id]?.read ?? ""} placeholder="Whole asset, or src/, README.md" onChange={e => setFileRules(r => ({ ...r, [a.id]: { read: e.target.value, write: r[a.id]?.write ?? "" } }))} /></label><label className="min-w-40 flex-1 space-y-1">Write paths<Input aria-label={`Write paths for ${a.name}`} disabled={!write.includes(a.id)} value={fileRules[a.id]?.write ?? ""} placeholder="src/widgets/" onChange={e => setFileRules(r => ({ ...r, [a.id]: { write: e.target.value, read: r[a.id]?.read ?? "" } }))} /></label><p className="w-full text-fg-3">Both blank grants the selected whole-asset access. Otherwise use comma-separated exact files or directory/ prefixes. Partial-file tasks cannot build, fork, open editors or install packages from restricted source.</p></div>}
              </div>
            ))}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={create}
              onChange={(e) => setCreate(e.target.checked)}
            />
            Create and edit task-owned source
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={execute}
              onChange={(e) => setExecute(e.target.checked)}
            />
            Build locally and run task widgets with approved asset metadata
            access
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={layout}
              onChange={(e) => setLayout(e.target.checked)}
            />
            Arrange widgets on Overview
          </label>
          {layout && <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={toolbarPlacement} onChange={event => setToolbarPlacement(event.target.checked)} />
            Also arrange compact widgets in the main toolbar
          </label>}
          <p className="text-xs text-fg-3">
            No cloud builds, shell, arbitrary npm installation, external
            network, or default replacement is included.
          </p>
          <Button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              setError("");
              setCode("");
              const task = deps.control.issueTask({
                name,
                workspaceId: workspace.id,
                scope: scope(),
                source: internal ? "internal" : "external",
              });
              try {
                if (!internal) {
                  const pair = await pairAgentTask(
                    task.taskId,
                    Date.now() + 3600000,
                  );
                  setCode(pair.code);
                }
                onAuthorized?.(task.taskId);
              } catch (e) {
                deps.control.revoke(task.taskId);
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {internal
              ? "Authorize chat task"
              : "Authorize and create pairing code"}
          </Button>
          {credentialFile && (
            <label className="text-xs">
              Paired connection file
              <Input
                aria-label="Paired connection file"
                value={credentialFile}
                readOnly
              />
            </label>
          )}
          {code && (
            <div className="flex flex-col gap-2 rounded-md border border-line-2 p-3">
              <label className="text-xs">
                One-use pairing secret · expires in 60 seconds
                <Input
                  aria-label="One-use pairing secret"
                  value={code}
                  readOnly
                  type="password"
                />
              </label>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    const result = await saveAgentConnection(code);
                    setCredentialFile(result.credentialFile);
                    setCode("");
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Save CLI connection securely
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  navigator.clipboard.writeText(code).then(
                    () => setCode(""),
                    (e) => setError(String(e)),
                  )
                }
              >
                Copy pairing secret
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-fg-3">
              {error}
            </p>
          )}
        </div>
      </SettingsSection>
      <SettingsSection
        title="Authorized tasks"
        description="Authored source remains after a task ends. Temporary installations stop and lose their grants."
      >
        {!access.tasks.length && (
          <p className="text-sm text-fg-3">No agents authorized.</p>
        )}
        {access.tasks.map((t) => (
          <section
            key={t.id}
            className="mb-3 rounded-md border border-line-2 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <strong className="truncate text-sm">{t.name}</strong>
              <StatusBadge>{t.revoked ? "Stopped" : t.source}</StatusBadge>
              <Button
                size="sm"
                variant="outline"
                disabled={t.revoked}
                onClick={() => {
                  deps.control.renewTask(t.id);
                  void renewAgentTask(t.id).catch((e) => setError(String(e)));
                }}
              >
                Renew
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={t.revoked}
                onClick={() => {
                  deps.control.revoke(t.id);
                  void revokeAgentTask(t.id).catch((e) => setError(String(e)));
                }}
              >
                Stop
              </Button>
            </div>
            <p className="mt-1 text-xs text-fg-3">
              Expires {new Date(t.expiresAt).toLocaleTimeString()} ·{" "}
              {t.createdAssets.length} created assets
            </p>
            <details className="mt-2 text-xs">
              <summary>Operations and resource scope</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(t.scope, null, 2)}
              </pre>
            </details>
          </section>
        ))}
      </SettingsSection>
      <SettingsSection
        title="Permission requests"
        description="Review the exact proposed scope. Applying it replaces the task scope; it does not grant arbitrary host access."
      >
        {access.requests
          .filter((r) => r.status === "pending")
          .map((r) => (
            <section key={r.id} className="rounded-md border border-line-2 p-3">
              <p className="text-sm">{r.reason}</p>
              <pre className="my-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(r.scope, null, 2)}
              </pre>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => deps.control.decideRequest(r.id, true)}
                >
                  Apply exact scope
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deps.control.decideRequest(r.id, false)}
                >
                  Deny
                </Button>
              </div>
            </section>
          ))}
        {!access.requests.some((r) => r.status === "pending") && (
          <p className="text-sm text-fg-3">No pending requests.</p>
        )}
      </SettingsSection>
      <details className="text-sm">
        <summary>Command catalog · {access.commands.length}</summary>
        <div className="mt-3 flex flex-col gap-3">
          {access.commands.map((d) => (
            <details key={d.method}>
              <summary className="flex items-center gap-2">
                <code>{d.method}</code>
                <StatusBadge>
                  {d.available ? d.effects.join(", ") || "Read" : "Unavailable"}
                </StatusBadge>
              </summary>
              <p className="py-1 text-xs text-fg-3">{d.description}</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(d.schema, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      </details>
      <SettingsSection
        title="Recent activity"
        description="Bounded metadata only; source, credentials and tool arguments are excluded."
      >
        <div className="flex flex-col gap-2">
          {access.activity
            .slice(-20)
            .reverse()
            .map((e, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                <code className="min-w-0 flex-1 break-all">{e.method}</code>
                <StatusBadge>{e.outcome}</StatusBadge>
                <time>{new Date(e.at).toLocaleTimeString()}</time>
              </div>
            ))}
        </div>
      </SettingsSection>
    </div>
  );
}

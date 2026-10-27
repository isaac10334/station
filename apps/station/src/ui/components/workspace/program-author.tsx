import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "../ui/dialog";
import { useState, useSyncExternalStore, useEffect, useMemo } from "react";
import { deps } from "../../../composition";
import {
  defaultDraft,
  draftSchema,
  programFiles,
  type ProgramDraft,
  type ProgramInstance,
  type ServiceBinding,
} from "../../../core/programs";
import { PROGRAM_RECIPES } from "../../../core/program-recipes";
import type { DataAsset } from "../../../core/asset-state";
import { controlOperation } from "../../lib/control-operation";
import { EditorWorkspace, useEditorOwner } from "./editor-workspace";
import { SourceEditor } from "./source-editor";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { PropertyEditor } from "../ui/property-editor";
import { SettledInput } from "../ui/settled-input";
import { Tabs, TabsList, TabsTab, TabsPanel } from "../ui/tabs";

/** Draft, immutable build and running surface remain separate lifecycle stages.
 * This UI invokes shared commands and cannot mint implicit service permissions. */
export function ProgramAuthor({
  id,
  kind = "widget",
  initial,
  assetId,
  definitionId,
}: {
  id: string;
  kind?: "widget" | "service" | "action";
  initial?: ProgramDraft;
  assetId?: string;
  definitionId?: string;
}) {
  useSyncExternalStore(deps.store.subscribe, deps.store.get);
  useSyncExternalStore(deps.programs.subscribe, deps.programs.version);
  const item = deps.store
    .active()
    .programming?.instances.find((item) => item.id === id);
  const [accessOpen, setAccessOpen] = useState(false);
  const [tab, setTab] = useState("source"),
    [recipeId, setRecipeId] = useState("counter"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [path, setPath] = useState(initial?.entry ?? "main.tsx"),
    [filename, setFilename] = useState("");
  const fallback = useMemo(
    () =>
      initial ??
      PROGRAM_RECIPES.find((recipe) => recipe.id === recipeId)?.draft ??
      defaultDraft(),
    [id, initial, recipeId],
  );
  const draft = item?.draft ?? fallback;
  const synthetic: DataAsset = useMemo(
    () => ({
      id,
      instanceId: id,
      kind: "script",
      name: draft.title,
      description: "",
      revision: item?.revision ?? 0,
      files: {
        ...draft.files,
        "program.json": JSON.stringify({ ...draft, files: undefined }),
      },
    }),
    [id, draft, item?.revision],
  );
  const editorOwner = id;
  const editor = useEditorOwner(synthetic, editorOwner, {
    editable: true,
    patch: (patch) => {
      const current = deps.store
        .active()
        .programming?.instances.find((item) => item.id === id);
      if (!current) throw new Error("Program is unavailable");
      const files = { ...current.draft.files };
      for (const [path, source] of Object.entries(patch)) {
        if (path === "program.json")
          throw new Error("Use Input & schema to edit program declarations");
        if (source === null) delete files[path];
        else files[path] = source;
      }
      update({ files });
    },
  });
  useEffect(() => {
    if (item && item.draft.files[path] === undefined) setPath(item.draft.entry);
  }, [item?.revision, path]);
  const run = async (method: string, params: unknown) => {
    setError("");
    setBusy(true);
    try {
      await controlOperation(method, params);
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!item)
    return (
      <section
        className="space-y-4 p-4"
        aria-label="Create programmable widget"
      >
        <div>
          <h3 className="text-sm! font-medium!">Make a widget your own</h3>
          <p className="mt-1 text-xs text-fg-3">
            Start with working TypeScript. Edit it, review access, then build
            and run.
          </p>
        </div>
        {!initial && !assetId && !definitionId && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROGRAM_RECIPES.map((recipe) => (
              <button
                key={recipe.id}
                aria-pressed={recipeId === recipe.id}
                className="space-y-1 rounded-lg border border-line bg-frame p-3 text-left hover:bg-hover aria-pressed:border-fg-3 aria-pressed:bg-hover focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                onClick={() => setRecipeId(recipe.id)}
              >
                <span className="block text-sm font-medium">
                  {recipe.title}
                </span>
                <span className="block text-xs text-fg-3">
                  {recipe.description}
                </span>
              </button>
            ))}
          </div>
        )}
        <Button
          size="sm"
          disabled={busy}
          aria-busy={busy}
          onClick={() =>
            void (definitionId
              ? run("programs.fromDefinition", { instanceId: id, definitionId })
              : run("programs.create", {
                  instanceId: id,
                  kind,
                  ...(assetId ? { assetId } : { draft }),
                }))
          }
        >
          {busy ? "Creating…" : "Create editable draft"}
        </Button>
        <p className="text-xs text-fg-3">
          Creates a stopped instance. Access is reviewed separately.
        </p>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </section>
    );

  const update = (patch: Partial<ProgramDraft>) => {
    try {
      const current = deps.store
        .active()
        .programming!.instances.find((item) => item.id === id)!;
      const next = draftSchema.parse({ ...current.draft, ...patch });
      deps.control.execute({
        method: "programs.draft",
        params: {
          instanceId: id,
          expectedInstanceRevision: current.revision,
          draft: next,
        },
        version: deps.control.version(),
      });
      if (assetId) {
        const asset = deps.store
          .active()
          .assets.find((asset) => asset.id === assetId);
        if (!asset) throw new Error("Definition source unavailable");
        const files =
          asset.kind === "widget-definition"
            ? {
                "widget.json": JSON.stringify(
                  (() => {
                    const recipe = JSON.parse(asset.files["widget.json"]!);
                    return {
                      ...recipe,
                      defaults: { ...recipe.defaults, programDraft: next },
                    };
                  })(),
                  null,
                  2,
                ),
              }
            : programFiles(next);
        deps.control.execute({
          method: "asset.files.patch",
          params: {
            assetId,
            expectedAssetRevision: asset.revision,
            patch: files,
          },
          version: deps.control.version(),
        });
      }
      setError("");
    } catch (error) {
      setError(String(error));
      throw error;
    }
  };
  const status = deps.programs.inspect().find((value) => value.id === id);
  return (
    <section
      className="flex min-w-0 flex-col gap-3 p-3"
      aria-label="Program editor"
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong className="mr-auto text-sm">{item.title}</strong>
        <span
          className="rounded-md bg-hover px-2 py-1 text-xs text-fg-3"
          role="status"
        >
          {busy ? "Working…" : (status?.status ?? "stopped")}
        </span>
        {definitionId && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run("programs.fromDefinition", {
                instanceId: id,
                definitionId,
              })
            }
          >
            Update from package
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void run("programs.apply", { instanceId: id })}
        >
          Build snapshot
        </Button>
        <Button
          size="sm"
          disabled={busy || !item.snapshotId}
          onClick={() => {
            if (kind === "widget" && !item.surfaceAccess) setAccessOpen(true);
            else void run("programs.start", { instanceId: id });
          }}
        >
          {kind === "action" ? "Run" : "Start"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || status?.status !== "running"}
          onClick={() => void run("programs.stop", { instanceId: id })}
        >
          Stop
        </Button>
      </div>
      <p className="text-xs text-fg-3">
        Edits save to your draft. Build snapshot compiles that source; Start
        runs the built version.
      </p>
      {kind === "widget" && !item.surfaceAccess && (
        <button
          className="rounded-md border border-line bg-hover p-3 text-left text-xs text-fg-2 focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          onClick={() => setAccessOpen(true)}
        >
          Allow this widget to display its surface…
        </button>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Program sections">
          <TabsTab value="source">Source</TabsTab>
          <TabsTab value="input">Input & schema</TabsTab>
          <TabsTab value="access">Access & services</TabsTab>
          <TabsTab value="output">Output</TabsTab>
        </TabsList>
        <TabsPanel
          value="source"
          keepMounted
          hidden={tab !== "source"}
          className="mt-3 space-y-3 transition-none!"
        >
          <div className="space-y-1 text-xs">
            <p>Title</p>
            <SettledInput
              label="Program title"
              value={draft.title}
              validate={(text) =>
                !text.trim()
                  ? "Enter a title"
                  : text.length > 120
                    ? "Use 120 characters or fewer"
                    : undefined
              }
              onCommit={(title) => update({ title })}
            />
          </div>
          <div className="h-[min(65vh,720px)] min-h-96 min-w-0 overflow-hidden rounded-md border border-line">
            <EditorWorkspace session={editor} ownerId={editorOwner} />
          </div>
          {editor.problems.length > 0 && (
            <div className="text-xs" aria-label="Program diagnostics">
              {editor.problems.map((problem, index) => (
                <p
                  key={index}
                  className={
                    problem.severity === "error" ? "text-danger" : "text-fg-3"
                  }
                >
                  {problem.path}: {problem.message}
                </p>
              ))}
            </div>
          )}
          {kind === "widget" && (
            <label className="flex gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.compact}
                onChange={(e) => {
                  try {
                    update({ compact: e.target.checked });
                  } catch {}
                }}
              />
              Compact toolbar presentation
            </label>
          )}
        </TabsPanel>
        <TabsPanel
          value="input"
          keepMounted
          hidden={tab !== "input"}
          className="mt-3 space-y-4 transition-none!"
        >
          <p className="text-xs text-fg-3">
            Input is JSON passed to the entry function. Apply it to the draft
            before building.
          </p>
          <PropertyEditor
            field={{ key: "input", label: "Program input", type: "json" }}
            value={draft.input}
            onCommit={(input) =>
              update({ input: input as ProgramDraft["input"] })
            }
          />
          <details>
            <summary className="cursor-pointer text-xs font-medium">
              Selected dependencies
            </summary>
            <div className="mt-3 space-y-2">
              {deps.store
                .active()
                .assets.filter((asset) => asset.id !== assetId && asset.files)
                .map((asset) => (
                  <label key={asset.id} className="flex gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={draft.dependencies.includes(asset.id)}
                      onChange={(e) => {
                        try {
                          update({
                            dependencies: e.target.checked
                              ? [...draft.dependencies, asset.id]
                              : draft.dependencies.filter(
                                  (id) => id !== asset.id,
                                ),
                          });
                        } catch {}
                      }}
                    />
                    {asset.name}
                  </label>
                ))}
            </div>
          </details>
          <details>
            <summary className="cursor-pointer text-xs font-medium">
              Service methods and settings schema
            </summary>
            <div className="mt-3">
              <PropertyEditor
                field={{
                  key: "declarations",
                  label: "Program declarations",
                  type: "json",
                }}
                value={{
                  inputSchema: draft.inputSchema,
                  outputSchema: draft.outputSchema,
                  methods: draft.methods,
                  fields: draft.fields,
                  assetType: draft.assetType,
                }}
                onCommit={(value) => {
                  if (
                    !value ||
                    typeof value !== "object" ||
                    Array.isArray(value)
                  )
                    throw new Error("Declarations must be an object");
                  const keys = [
                    "inputSchema",
                    "outputSchema",
                    "methods",
                    "fields",
                    "assetType",
                  ];
                  if (Object.keys(value).some((key) => !keys.includes(key)))
                    throw new Error("Unknown declaration field");
                  update(value);
                }}
              />
            </div>
          </details>
        </TabsPanel>
        <TabsPanel
          value="access"
          keepMounted
          hidden={tab !== "access"}
          className="mt-3 transition-none!"
        >
          <div className="space-y-3 rounded-md border border-line p-3">
            <p className="text-xs text-fg-2">
              {item.surfaceAccess
                ? "Widget display allowed."
                : "Widget display has not been allowed."}{" "}
              {item.bindings.length} service bindings.
            </p>
            {item.bindings.map((binding) => (
              <p key={binding.alias} className="text-xs text-fg-3">
                {binding.alias}: {binding.operations.join(", ")} ·{" "}
                {binding.resources.length} resources
              </p>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAccessOpen(true)}
            >
              Manage permissions…
            </Button>
          </div>
        </TabsPanel>
        <TabsPanel
          value="output"
          keepMounted
          hidden={tab !== "output"}
          className="mt-3 space-y-3 transition-none!"
        >
          <p className="text-xs text-fg-3">
            Logs and results appear here after the program starts.
          </p>
          {deps.programs.logs(id).length > 0 && (
            <pre
              aria-label="Program logs"
              className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-frame p-3 text-xs"
            >
              {deps.programs.logs(id).join("")}
            </pre>
          )}
          {deps.programs.output(id) !== undefined && (
            <pre className="overflow-auto rounded-md border border-line bg-frame p-3 text-xs">
              {JSON.stringify(deps.programs.output(id), null, 2)}
            </pre>
          )}
        </TabsPanel>
      </Tabs>
      <div className="flex gap-2 border-t border-line pt-3">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run("programs.saveDefinition", {
              instanceId: id,
              name: item.title,
            })
          }
        >
          Save as reusable definition
        </Button>
      </div>
      <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{item.title} would like access</DialogTitle>
            <DialogDescription>
              Review what this instance can use. Closing this dialog leaves
              permissions unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ProgramBindings
              key={`${id}:${item.revision}`}
              item={item}
              busy={busy}
              run={run}
              onDismiss={() => setAccessOpen(false)}
            />
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
      {(error || status?.error) && (
        <p role="alert" className="break-words text-xs text-danger">
          {error || status?.error}
        </p>
      )}
    </section>
  );
}

function ProgramBindings({
  item,
  busy,
  run,
  onDismiss,
}: {
  onDismiss: () => void;
  item: ProgramInstance;
  busy: boolean;
  run: (method: string, params: unknown) => Promise<boolean>;
}) {
  const [alias, setAlias] = useState("catalog"),
    [service, setService] = useState("builtin:assets"),
    [operations, setOperations] = useState("query");
  const [resources, setResources] = useState<string[]>([]),
    [bindings, setBindings] = useState<ServiceBinding[]>(item.bindings),
    [startup, setStartup] = useState(item.startup),
    [surfaceAccess, setSurfaceAccess] = useState(
      item.kind === "widget" ? true : (item.surfaceAccess ?? false),
    );
  const [filter, setFilter] = useState("");
  const workspace = deps.store.active();
  return (
    <fieldset className="space-y-3 rounded-lg border border-line p-3">
      <legend className="px-1 text-xs font-medium">Review access</legend>
      {item.kind === "widget" && (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={surfaceAccess}
            onChange={(e) => setSurfaceAccess(e.target.checked)}
          />
          Allow this instance to draw its widget surface
        </label>
      )}
      <p className="text-xs text-fg-3">
        Bindings grant only selected methods and resources. Source access is
        separate.
      </p>
      {bindings.map((binding) => (
        <div
          key={binding.alias}
          className="flex items-center gap-2 rounded-md bg-hover p-2 text-xs"
        >
          <span className="min-w-0 flex-1 break-words">
            <strong>{binding.alias}</strong> → {binding.serviceId}
            <span className="block text-fg-3">
              {binding.operations.join(", ")} · {binding.resources.length}{" "}
              resources
            </span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setBindings(
                bindings.filter((value) => value.alias !== binding.alias),
              )
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <details>
        <summary className="cursor-pointer text-xs font-medium">
          Add a service binding
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              Binding name
              <Input
                aria-label="Binding name"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs">
              Service
              <NativeSelect
                aria-label="Binding service"
                value={service}
                onChange={(e) => {
                  setService(e.target.value);
                  setOperations(
                    e.target.value === "builtin:metadata"
                      ? "update"
                      : e.target.value === "builtin:selection"
                        ? "get"
                        : "query",
                  );
                  setResources([]);
                }}
              >
                {[
                  ["builtin:assets", "Asset metadata (read only)"],
                  ["builtin:activity", "Workspace activity (read only)"],
                  ["builtin:selection", "Navigation selection (read only)"],
                  ["builtin:metadata", "Asset metadata edit"],
                  ...deps.programs
                    .inspect()
                    .filter(
                      (value) =>
                        value.kind === "service" && value.id !== item.id,
                    )
                    .map((value) => [value.id, value.title]),
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs">
              Named operations
              <Input
                aria-label="Binding operations"
                value={operations}
                onChange={(e) => setOperations(e.target.value)}
              />
            </label>
          </div>
          <Input
            aria-label="Filter binding resources"
            placeholder="Find a resource…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="max-h-36 space-y-2 overflow-auto">
            {[
              ...workspace.assets.map((asset) => ({
                id: asset.id,
                name: asset.name,
              })),
              ...Object.values(workspace.dock.panels)
                .filter((panel) => panel.kind === "navigation")
                .map((panel) => ({
                  id: panel.id,
                  name: "Navigation " + panel.id.slice(-6),
                })),
              { id: workspace.id, name: "This workspace" },
            ]
              .filter((resource) =>
                resource.name.toLowerCase().includes(filter.toLowerCase()),
              )
              .map((resource) => (
                <label key={resource.id} className="flex gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={resources.includes(resource.id)}
                    onChange={(e) =>
                      setResources(
                        e.target.checked
                          ? [...resources, resource.id]
                          : resources.filter((id) => id !== resource.id),
                      )
                    }
                  />
                  {resource.name}
                </label>
              ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!/^[a-z][\w-]{0,63}$/.test(alias) || !operations.trim()}
            onClick={() =>
              setBindings([
                ...bindings.filter((binding) => binding.alias !== alias),
                {
                  alias,
                  serviceId: service,
                  operations: operations
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                  resources,
                },
              ])
            }
          >
            Add to review
          </Button>
        </div>
      </details>
      {item.kind === "service" && (
        <label className="flex gap-2 text-xs">
          <input
            type="checkbox"
            checked={startup}
            onChange={(e) => setStartup(e.target.checked)}
          />
          Start when this workspace opens
        </label>
      )}
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          if (
            await run("programs.wire", {
              instanceId: item.id,
              expectedInstanceRevision: item.revision,
              bindings,
              startup,
              surfaceAccess,
            })
          )
            onDismiss();
        }}
      >
        Allow selected access
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}>
        Cancel
      </Button>
    </fieldset>
  );
}

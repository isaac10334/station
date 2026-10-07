import { defineCapability } from "@loop-kit/capabilities";
import { createHost } from "@loop-kit/host";
import { createStore, hasCurrentArtifact, type KeyValueStorage } from "./model";
import { createPolyengineRunner, selectComponentRuntime, type ComponentRunner } from "./component-runtime";
import { REQUIRED_GRANTS } from "./component-contract";
import { sha256, sourceSha256, witSha256, type BuiltArtifact } from "./build-contract";

const componentRunner = defineCapability<ComponentRunner>({
  id: "unit:workspace/component-runtime-polyengine",
  version: "1.0.0",
});

export function createComposition(
  storage: KeyValueStorage,
  createRunner: () => ComponentRunner = createPolyengineRunner,
) {
  const store = createStore(storage);
  const host = createHost();
  host.provide(componentRunner, { create: () => createRunner() });
  const runner: ComponentRunner = {
    async run(unit, input, grants, requestedSignal) {
      const current = store.active().units.find((item) => item.instanceId === unit.instanceId);
      if (!current || current.kind !== "component" || current.revision !== unit.revision || current.artifact?.sha256 !== unit.artifact?.sha256)
        throw new Error("Source changed. Build the current revision before running.");
      if (!current.artifact) throw new Error("Build the current P3 source before running.");
      selectComponentRuntime(current.artifact);
      if (!hasCurrentArtifact(current)) throw new Error("Source changed. Build the current revision before running.");
      if (current.artifact?.sourceSha256 !== await sourceSha256(current.files) || current.artifact.witSha256 !== await witSha256(current.files))
        throw new Error("Source no longer matches the built artifact. Rebuild this Component.");
      for (const grant of REQUIRED_GRANTS) if (!grants.has(grant) || !current.grants[grant]) throw new Error(`Import denied: ${grant}`);
      const scope = host.scope();
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      requestedSignal?.addEventListener("abort", onAbort, { once: true });
      const unsubscribe = store.subscribe(() => {
        const latest = store.active().units.find((item) => item.instanceId === current.instanceId);
        if (!latest || latest.kind !== "component" || latest.revision !== current.revision || latest.artifact?.sha256 !== current.artifact?.sha256 ||
            REQUIRED_GRANTS.some((grant) => !latest.grants[grant])) controller.abort();
      });
      try {
        const handle = await scope.acquire(componentRunner);
        handle.signal.addEventListener("abort", onAbort, { once: true });
        if (requestedSignal?.aborted) controller.abort();
        const result = await handle.value.run(current, input, grants, controller.signal);
        const latest = store.active().units.find((item) => item.instanceId === unit.instanceId);
        if (!latest || latest.kind !== "component" || !hasCurrentArtifact(latest) || latest.revision !== current.revision || latest.artifact?.sha256 !== current.artifact?.sha256)
          throw new Error("Source changed during the run. Run the current revision again.");
        return result;
      } finally {
        unsubscribe();
        requestedSignal?.removeEventListener("abort", onAbort);
        await scope.revoke();
      }
    },
  };
  async function buildUnit(workspaceId: string, unitId: string): Promise<BuiltArtifact> {
    const unit = store.get().workspaces.find((item) => item.id === workspaceId)?.units.find((item) => item.id === unitId);
    if (!unit || unit.kind !== "component") throw new Error("Component source was not found.");
    const source = { id: unit.id, revision: unit.revision, files: { ...unit.files } };
    const expectedSourceHash = await sourceSha256(source.files);
    const response = await fetch("/api/component/build", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(source),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Component build failed (${response.status}).`);
    }
    const artifact = (await response.json()).artifact as BuiltArtifact;
    if (artifact.id !== source.id || artifact.revision !== source.revision ||
        artifact.sourceSha256 !== expectedSourceHash || artifact.witSha256 !== await witSha256(source.files) ||
        artifact.schemaVersion !== 2 || artifact.profile !== "component-model-0.3" ||
        !/^[0-9a-f-]{36}$/.test(artifact.buildId) ||
        !/^[a-f0-9]{64}$/.test(artifact.sha256) || !Array.isArray(artifact.imports))
      throw new Error("Build metadata did not match the submitted source.");
    const bytesResponse = await fetch(`/api/artifacts/${artifact.sha256}.wasm`, { cache: "no-store" });
    if (!bytesResponse.ok) throw new Error("Built bytes unavailable for verification.");
    const bytes = new Uint8Array(await bytesResponse.arrayBuffer());
    if (artifact.bytes !== bytes.byteLength || artifact.sha256 !== await sha256(bytes))
      throw new Error("Build artifact bytes failed verification.");
    if (!store.installArtifact(workspaceId, source, artifact, unit.instanceId))
      throw new Error("Source changed during the build. Rebuild the current revision.");
    return artifact;
  }
  return { store, runner, buildUnit, dispose: () => host.dispose() };
}

const browserStorage: KeyValueStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

export const deps = createComposition(browserStorage);

const SESSION_KEY = "unit-workspace.demo-session.v1";
export const demoSession = {
  get(): { kind: "guest" | "demo"; email?: string } | null {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return value?.kind === "guest" || value?.kind === "demo" ? value : null;
    } catch { return null; }
  },
  set(value: { kind: "guest" | "demo"; email?: string } | null) {
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  },
};

/** Bun adapters use the same fixed worker and exact byte/import verification as
 * the browser. Artifact storage is explicit and profile-local; cloud builds still
 * require the dispatcher's separate source-transfer/cost authorization.
 */
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { buildComponent, readArtifact } from "./component-build";
import { createPolyengineRunner } from "../src/providers/component-runtime";
import type { Store } from "../src/features/workspace/application/store";
const require = createRequire(import.meta.url);
export function headlessComponents(profilePath: string, getStore: () => Store) {
  const paths = {
    artifactDir: join(dirname(profilePath), "artifacts"),
    sandboxConfig: join(import.meta.dir, "../vercel-sandbox.json"),
    translator: join(
      dirname(require.resolve("@polyengine/translator/package.json")),
      "esm/translator_shim.wasm",
    ),
  };
  const createRunner = () =>
    createPolyengineRunner({
      async readArtifact(hash, signal) {
        signal?.throwIfAborted();
        const bytes = await readArtifact(hash, paths.artifactDir);
        if (!bytes)
          throw new Error("Verified profile-local artifact unavailable");
        return bytes;
      },
      async readTranslator(signal) {
        signal?.throwIfAborted();
        return new Uint8Array(await Bun.file(paths.translator).arrayBuffer());
      },
      createWorker: () =>
        new Worker(
          new URL("../src/providers/component-worker.ts", import.meta.url).href,
        ),
    });
  return {
    createRunner,
    async build(workspaceId: string, assetId: string, signal: AbortSignal) {
      const store = getStore(),
        asset = store.active().assets.find((a) => a.id === assetId);
      if (store.active().id !== workspaceId || asset?.kind !== "component")
        throw new Error("Component source unavailable");
      const source = {
        id: asset.id,
        revision: asset.revision,
        files: { ...asset.files },
      };
      const result = await buildComponent(source, paths, signal);
      signal.throwIfAborted();
      if (
        !store.installArtifact(
          workspaceId,
          source,
          result.metadata,
          asset.instanceId,
        )
      )
        throw new Error("Source changed during build");
      return result.metadata;
    },
  };
}

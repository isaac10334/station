import { test, expect } from "bun:test";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { Translator } from "@polyengine/runtime/shim";
import { createComposition } from "../src/application";
import { createPolyengineRunner } from "../src/providers/component-runtime";
import { inspectComponentPlan } from "../src/providers/component-plan";
import { REQUIRED_GRANTS } from "../src/core/component-contract";
import {
  sha256,
  sourceSha256,
  witSha256,
  type BuiltArtifact,
} from "../src/core/build-contract";
import { taskScopeSchema } from "@station/protocol";
const wasmPath = new URL(
  "../../../components/greeting/target/wasm32-wasip2/release/greeting.wasm",
  import.meta.url,
);
// Run after build:component for real-byte acceptance; ordinary clean CI can lack Cargo output.
test.skipIf(!(await Bun.file(wasmPath).exists()))(
  "headless command executes actual P3 bytes in the fixed Bun worker with task import grants",
  async () => {
    const require = createRequire(import.meta.url),
      bytes = await Bun.file(wasmPath).bytes();
    const shim = await Bun.file(
      join(
        dirname(require.resolve("@polyengine/translator/package.json")),
        "esm/translator_shim.wasm",
      ),
    ).bytes();
    const translator = await Translator.create(shim),
      inspected = inspectComponentPlan(translator.translate(bytes).plan);
    const app = createComposition(
      { getItem: () => null, setItem: () => {} },
      () =>
        createPolyengineRunner({
          async readArtifact() {
            return bytes.slice();
          },
          async readTranslator() {
            return shim.slice();
          },
          createWorker() {
            return new Worker(
              new URL("../src/providers/component-worker.ts", import.meta.url)
                .href,
            );
          },
        }),
    );
    try {
      const asset = app.store.active().assets[0];
      // Provenance is a test fixture, not evidence that a cloud build occurred.
      const metadata: BuiltArtifact = {
        schemaVersion: 2,
        buildId: crypto.randomUUID(),
        id: asset.id,
        revision: asset.revision,
        sourceSha256: await sourceSha256(asset.files!),
        witSha256: await witSha256(asset.files!),
        sha256: await sha256(bytes),
        bytes: bytes.byteLength,
        builtBy: "vercel-sandbox",
        profile: "component-model-0.3",
        ...inspected,
        toolchain: "acceptance fixture: local Cargo output",
        snapshotId: "test-fixture-not-cloud",
        translatorSha256: await sha256(shim),
      };
      app.store.installArtifact(
        app.store.active().id,
        { id: asset.id, revision: asset.revision, files: asset.files! },
        metadata,
        asset.instanceId,
      );
      const context = app.control.issueTask({
        name: "Real worker acceptance",
        workspaceId: app.store.active().id,
        scope: taskScopeSchema.parse({
          operations: ["component.run"],
          readableAssets: [asset.id],
          componentImports: [...REQUIRED_GRANTS],
        }),
      });
      const operation = app.control.executeFor(context, {
        method: "component.run",
        version: app.control.version(),
        params: {
          assetId: asset.id,
          input: "World",
          imports: [...REQUIRED_GRANTS],
        },
      }).result;
      let status: any;
      for (let i = 0; i < 150; i++) {
        status = app.control.executeFor(context, {
          method: "operations.inspect",
          params: { operationId: operation.operationId },
        }).result;
        if (status.status !== "running") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(status.status, JSON.stringify(status)).toBe("succeeded");
      expect(status.result.output).toBe("Hello, World!");
      expect(status.result.surfaceText).toBe("Hello, World!");
      expect(
        app.store.active().assets[0].kind === "component" &&
          Object.values(app.store.active().assets[0].grants).some(Boolean),
      ).toBe(false);
    } finally {
      await app.dispose();
    }
  },
  20000,
);

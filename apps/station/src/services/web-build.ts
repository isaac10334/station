import { sourceSha256, sha256 } from "../core/build-contract";
import { WorkerClient } from "./worker-client";
import type { SourceProject } from "../core/source-project";

export type { WebBuild } from "../core/source-project";
import type { WebBuild } from "../core/source-project";
const escapeScript = (source: string) =>
  source.replace(/<\/script/gi, "<\\/script");
export async function buildWebProject(
  project: SourceProject,
  entry = "index.html",
  signal?: AbortSignal,
): Promise<WebBuild> {
  if (
    new TextEncoder().encode(JSON.stringify(project.files)).byteLength >
    1024 * 1024
  )
    throw new Error("Web project exceeds 1 MiB");
  const tools = await import("../generated/web-tools");
  const worker = new WorkerClient(tools.buildWorker);
  const abort = () => worker.dispose(new Error("Build cancelled"));
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    await worker.request({
      op: "init",
      wasm: tools.wasm,
      resources: tools.resources,
    });
    let html = project.files[entry];
    if (html === undefined) throw new Error(`Missing HTML entry: ${entry}`);
    const base = entry.slice(0, entry.lastIndexOf("/") + 1);
    const paths = [
      ...html.matchAll(
        /<(script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*(?:><\/script>|>)/gi,
      ),
    ];
    const entries = paths.map((match) => {
      const path = match[2]!;
      if (/^(?:\w+:|\/)/.test(path))
        throw new Error(
          "Only local script and stylesheet references are supported",
        );
      return base + path.replace(/^\.\//, "");
    });
    const results = await worker.request<
      { entry: string; outputs: { path: string; text: string }[] }[]
    >({ op: "build", files: project.files, entries });
    paths.forEach((match, index) => {
      const output = results[index]!;
      html = html.replace(match[0], () =>
        output.outputs
          .map((file) =>
            file.path.endsWith(".css")
              ? `<style>${file.text.replace(/<\/style/gi, "<\\/style")}</style>`
              : `<script type="module">${escapeScript(file.text)}</script>`,
          )
          .join(""),
      );
    });
    return {
      instanceId: project.instanceId,
      revision: project.revision,
      sourceHash: await sourceSha256(project.files),
      documentHash: await sha256(new TextEncoder().encode(html)),
      document: html,
      toolchain: "esbuild-wasm@0.28.2",
    };
  } finally {
    signal?.removeEventListener("abort", abort);
    worker.dispose();
  }
}

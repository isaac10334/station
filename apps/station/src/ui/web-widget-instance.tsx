import { useEffect, useRef, useState } from "react";
import type { WebContentAsset } from "../core/asset-state";
import { assetFiles } from "../core/source-project";
import { buildWebProject, type WebBuild } from "../services/web-build";
import { SandboxFrame } from "./sandbox-frame";
import { Button } from "./components/ui/button";

/** Source edits mark this instance stale; explicit runs retain the last successful document on failure. */
export function WebWidgetInstance({ asset }: { asset: WebContentAsset }) {
  const [preview, setPreview] = useState<{
      build: WebBuild;
      run: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const source = useRef(asset),
    controller = useRef<AbortController | null>(null);
  source.current = asset;
  async function run() {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const current = source.current;
    setBusy(true);
    setError("");
    try {
      const build = await buildWebProject(
        { ...current, files: assetFiles(current) },
        "index.html",
        abort.signal,
      );
      if (abort.signal.aborted) return;
      if (source.current.revision !== build.revision)
        throw new Error("Source changed during build; run again");
      setPreview((previous) => ({ build, run: (previous?.run ?? 0) + 1 }));
    } catch (error) {
      if (!abort.signal.aborted) setError(String(error));
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    void run();
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [asset.instanceId]);
  return (
    <div className="station-web-widget">
      <div className="station-editor-part-toolbar">
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void run()}
        >
          {busy ? "Building…" : "Run changes"}
        </Button>
        {preview?.build.revision !== asset.revision && (
          <span>Changes pending</span>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <SandboxFrame
          key={preview.run}
          html={preview.build.document}
          title={`${asset.name} dashboard widget`}
        />
      )}
    </div>
  );
}

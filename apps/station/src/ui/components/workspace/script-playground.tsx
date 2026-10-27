import { useEffect, useRef, useState } from "react";
import type { DataAsset } from "../../../core/asset-state";
import type { ScriptOutput } from "../../../contracts/script-runtime";
import { controlOperation } from "../../lib/control-operation";
import { EditorWorkspace, useEditorOwner } from "./editor-workspace";
import { CodeInput } from "../ui/code-input";
import { Button } from "../ui/button";

/** One JSON calculation and explicit cancellable run; source uses the shared IDE. */
export function ScriptPlayground({
  asset,
  ownerId,
}: {
  asset: DataAsset;
  ownerId: string;
}) {
  const session = useEditorOwner(asset, ownerId),
    [input, setInput] = useState('{"amount":4}'),
    [result, setResult] = useState<ScriptOutput>(),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort();
    setRunning(false);
    setResult(undefined);
    setError("");
    return () => controller.current?.abort();
  }, [asset.id, asset.revision]);
  const run = async () => {
    controller.current?.abort();
    const call = new AbortController();
    controller.current = call;
    try {
      const value = JSON.parse(input);
      setRunning(true);
      setError("");
      setResult(undefined);
      const output = await controlOperation<ScriptOutput>(
        "scripts.run",
        { assetId: asset.id, input: value },
        call.signal,
      );
      if (!call.signal.aborted) setResult(output);
    } catch (e) {
      if (!call.signal.aborted) setError(String(e));
    } finally {
      if (controller.current === call) setRunning(false);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Button
          size="sm"
          disabled={running}
          aria-busy={running}
          onClick={() => void run()}
        >
          {running ? "Running…" : "Run calculation"}
        </Button>
        {running && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              controller.current?.abort();
              setRunning(false);
            }}
          >
            Cancel
          </Button>
        )}
        <span className="text-xs text-fg-3">
          Use input in main.js and return a JSON value.
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[minmax(0,3fr)_minmax(240px,2fr)]">
        <section
          className="flex min-h-96 min-w-0 flex-col"
          aria-label="Calculation source"
        >
          <EditorWorkspace session={session} ownerId={ownerId} />
        </section>
        <section
          className="min-w-0 space-y-4 border-l border-line p-3"
          aria-label="Calculation input and output"
        >
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Input</h3>
            <div className="h-36 overflow-hidden rounded border border-line">
              <CodeInput
                label="Calculation input JSON"
                value={input}
                onChange={setInput}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Output</h3>
              {result && (
                <span className="text-xs text-fg-3">{result.elapsedMs} ms</span>
              )}
            </div>
            <pre
              className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-raised p-3 text-xs"
              aria-label="Script output"
              role="status"
            >
              {result
                ? JSON.stringify(result.value, null, 2)
                : "Run the calculation to see its result."}
            </pre>
          </div>
          {!!result?.logs.length && (
            <details>
              <summary className="text-xs text-fg-3">Console output</summary>
              <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs">
                {result.logs.join("\n")}
              </pre>
            </details>
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <details className="text-xs text-fg-3">
            <summary>About calculations</summary>
            <p className="mt-2">
              Calculations run in an isolated QuickJS VM with JSON input/output.
              They cannot use the network, files or Station services. Each run
              starts fresh and has a 200 ms execution budget. Use a TypeScript
              program for widgets, actions and services, or a Rust Component for
              portable WIT exports.
            </p>
          </details>
        </section>
      </div>
    </div>
  );
}

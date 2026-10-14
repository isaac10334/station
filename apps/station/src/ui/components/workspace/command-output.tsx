import { useEffect, useRef, useState } from "react";
import type { Workspace } from "../../../core/model";
import { installedDefinitions } from "../../../services/package-runtime";
import { packageRuntime } from "../../../composition";
const { invokeInstalledCommand } = packageRuntime;
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/** Contextual output widget. Merely opening it never executes its Component. */
export function CommandOutput({
  definitionId,
  workspace,
}: {
  definitionId: string;
  workspace: Workspace;
}) {
  const [input, setInput] = useState(""),
    [output, setOutput] = useState(""),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  if (!installedDefinitions(workspace).some((item) => item.id === definitionId))
    return <p>Command unavailable. Enable its package to restore it.</p>;
  return (
    <div className="station-editor-part p-3">
      <label htmlFor={`${definitionId}:input`}>Command input</label>
      <Input
        id={`${definitionId}:input`}
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            const abort = new AbortController();
            controller.current = abort;
            setBusy(true);
            try {
              setOutput(
                JSON.stringify(
                  await invokeInstalledCommand(
                    workspace,
                    definitionId,
                    input,
                    abort.signal,
                  ),
                  null,
                  2,
                ),
              );
            } catch (error) {
              setOutput(String(error));
            } finally {
              controller.current = null;
              setBusy(false);
            }
          }}
        >
          Run
        </Button>
        <Button
          size="sm"
          disabled={!busy}
          onClick={() => controller.current?.abort()}
        >
          Cancel
        </Button>
      </div>
      <pre
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap"
        role="status"
      >
        {output}
      </pre>
    </div>
  );
}

/** Browser acceptance fixture; served only by semantic-proof-server.ts, never in the app. */
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { RecordingSurface, type UiEvent } from "@loop-kit/ui";
import { PortableSurface } from "../../src/ui/components/workspace/portable-surface";
import { semanticProofFrame } from "./semantic-definition";
import { SemanticThemeContext } from "../../src/ui/semantic-theme";
import { semanticTheme } from "../../src/core/semantic-theme";
import { SourceFileTree } from "../../src/ui/components/workspace/source-file-tree";
import { PropertyInspector } from "../../src/ui/components/ui/property-inspector";
function Proof() {
  const [mode, setMode] = useState<"light" | "dark">("dark"),
    [event, setEvent] = useState<UiEvent>(),
    [selected, setSelected] = useState("src/main.ts"),
    [name, setName] = useState("Station"),
    [frame, setFrame] = useState(semanticProofFrame);
  const recording = useMemo(() => {
    const surface = new RecordingSurface();
    surface.render(semanticProofFrame);
    return surface;
  }, []);
  return (
    <SemanticThemeContext.Provider
      value={semanticTheme({ preference: mode, systemDark: false })}
    >
      <main
        className="flex min-h-screen flex-col gap-4 bg-frame p-6 text-fg"
        data-theme={mode}
      >
        <h1>Station semantic adapter proof</h1>
        <button onClick={() => setMode(mode === "dark" ? "light" : "dark")}>
          Switch to {mode === "dark" ? "light" : "dark"}
        </button>
        <PortableSurface
          frame={frame}
          onEvent={async (event) => {
            recording.event(event);
            setEvent(await recording.nextEvent());
            if (event.type === "select" || event.type === "change") {
              const next = structuredClone(recording.frame!);
              const update = (node: typeof next.root): typeof next.root => ({
                ...node,
                ...(node.key === event.key ? { value: event.value } : {}),
                ...(node.children
                  ? { children: node.children.map(update) }
                  : {}),
              });
              const revised = {
                revision: next.revision + 1,
                root: update(next.root),
              };
              recording.render(revised);
              setFrame(revised);
            }
          }}
        />
        <output aria-label="Recording event" style={{overflowWrap:'anywhere'}}>
          {event ? JSON.stringify(event) : "Waiting for DOM event"}
        </output>
        <section className="flex h-56 flex-col" aria-label="Source tree proof">
          <SourceFileTree
            paths={["src/main.ts", "src/view.ts", "README.md"]}
            selected={selected}
            onSelect={setSelected}
            editable={false}
            onNew={() => {}}
            onRename={() => {}}
            onDelete={() => {}}
          />
        </section>
        <output aria-label="Selected file">{selected}</output>
        <PropertyInspector
          fields={[
            {
              key: "name",
              label: "Workspace name",
              type: "string",
              maxLength: 80,
            },
          ]}
          value={{ name }}
          onCommit={(_, value) => setName(value)}
        />
        <output aria-label="Committed name">{name}</output>
      </main>
    </SemanticThemeContext.Provider>
  );
}
createRoot(document.getElementById("app")!).render(<Proof />);

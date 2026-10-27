import { normalizeSvgEditSource, prepareSvgEditSource } from "../../../services/svg-edit-source";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { svgIconUrl } from "../../../services/svg-icons";

/** SVG-Edit runs in an opaque frame with no network or Station bridge. Only
 * validated source leaves/enters; Apply uses the caller's source revision guard.
 */
export function SvgEditCanvas({
  source,
  editable,
  onCommit,
}: {
  source: string;
  editable: boolean;
  onCommit: (next: string, expected: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    baseline = useRef(source),
    sourceRef = useRef(source);
  sourceRef.current = source;
  const [notice, setNotice] = useState("");
  const [savedBaseline, setSavedBaseline] = useState(source);
  const [html, setHtml] = useState(""),
    [ready, setReady] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState("select");
  const send = (action: string, extra = {}) =>
    frame.current?.contentWindow?.postMessage(
      {
        type: "station:svg-edit",
        action,
        background: getComputedStyle(document.documentElement)
          .getPropertyValue("--raised")
          .trim(),
        foreground: getComputedStyle(document.documentElement)
          .getPropertyValue("--fg")
          .trim(),
        ...extra,
      },
      "*",
    );
  useEffect(() => {
    let active = true;
    import("../../../generated/svg-edit-tools")
      .then(({ svgEditFrame }) => {
        if (active)
          setHtml(
            `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:var(--canvas-bg);color:var(--canvas-fg)}#canvas{position:absolute;inset:0;overflow:hidden;contain:strict}#canvas>svg{display:block}svg{overflow:visible}</style><div id="canvas"></div><script>${svgEditFrame.replaceAll("</script", "<\\/script")}</script>`,
          );
      })
      .catch((e) => setError(String(e)));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const observer = new MutationObserver(() => send("theme"));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        event.data?.type !== "station:svg-edit"
      )
        return;
      try {
        if (event.data.action === "ready") {
          // Transport readiness is independent of source validity. Otherwise an
          // invalid initial source permanently disables Reload after repair.
          setReady(true);
          svgIconUrl(sourceRef.current);
          baseline.current = sourceRef.current;
          setSavedBaseline(baseline.current);
          send("load", {
            source: prepareSvgEditSource(baseline.current),
            background: getComputedStyle(document.documentElement)
              .getPropertyValue("--raised")
              .trim(),
            foreground: getComputedStyle(document.documentElement)
              .getPropertyValue("--fg")
              .trim(),
          });
        }
        if (event.data.action === "loaded") { setLoaded(true); setError(""); setNotice(""); }
        if (event.data.action === "error")
          setError(String(event.data.message).slice(0, 500));
        if (event.data.action === "source" && editable) {
          const raw = event.data.source;
          if (typeof raw !== "string" || raw.length > 32768)
            throw new Error("SVG exceeds 32 KiB");
          const next = normalizeSvgEditSource(raw);
          commit.current(next, baseline.current);
          setNotice("Drawing saved");
          baseline.current = next;
          setSavedBaseline(next);
          setError("");
        }
      } catch (e) {
        setError(String(e));
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [editable]);
  const reload = () => {
    try {
      svgIconUrl(source);
      baseline.current = source;
      setSavedBaseline(source);
      setLoaded(false);
      send("load", { source: prepareSvgEditSource(source) });
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line p-2"
        aria-label="SVG drawing tools"
      >
        {[
          ["select", "Select"],
          ["rect", "Rectangle"],
          ["ellipse", "Ellipse"],
          ["line", "Line"],
          ["path", "Path"],
          ["fhpath", "Pencil"],
        ].map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={mode === value ? "secondary" : "ghost"}
            aria-pressed={mode === value}
            disabled={!loaded || !editable}
            onClick={() => {
              setMode(value);
              send("mode", { mode: value });
            }}
          >
            {label}
          </Button>
        ))}
        {[
          ["undo", "Undo"],
          ["redo", "Redo"],
          ["group", "Group"],
          ["ungroup", "Ungroup"],
          ["delete", "Delete"],
        ].map(([action, label]) => (
          <Button
            size="sm"
            variant="ghost"
            key={action}
            disabled={!loaded || !editable}
            onClick={() => send(action)}
          >
            {label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          disabled={!loaded}
          onClick={() => send("fit")}
        >
          Fit
        </Button>
        <Button
          size="sm"
          disabled={!loaded || !editable || source !== savedBaseline}
          onClick={() => send("export")}
        >
          Apply drawing
        </Button>
        <Button size="sm" variant="ghost" disabled={!ready} onClick={reload}>
          Reload saved source
        </Button>
      </div>
      <div className="flex items-center gap-4 border-b border-line px-3 py-2">
        {["fill", "stroke"].map((target) => (
          <label
            key={target}
            className="flex items-center gap-2 text-xs text-fg-3"
          >
            {target === "fill" ? "Fill" : "Stroke"}
            <input
              type="color"
              aria-label={`SVG ${target}`}
              defaultValue={target === "fill" ? "#336699" : "#000000"}
              disabled={!editable || !loaded}
              onChange={(event) =>
                send("color", { target, value: event.target.value })
              }
              className="h-6 w-8 rounded border border-line bg-transparent"
            />
          </label>
        ))}
      </div>
      <p className="px-3 py-1 text-xs text-fg-3">
        SVG-Edit · Draw, select and resize. Apply saves the drawing; Source
        edits remain available.
      </p>
      {source !== savedBaseline && (
        <p role="status" className="px-3 py-1 text-xs text-fg-3">
          Saved source changed. Reload it before applying this drawing.
        </p>
      )}
      {html && (
        <iframe
          ref={frame}
          title="SVG-Edit canvas"
          sandbox="allow-scripts"
          srcDoc={html}
          className="min-h-80 w-full flex-1 border-0 bg-raised"
        />
      )}
      {notice && (
        <p role="status" className="px-3 py-1 text-xs text-fg-3">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

import SvgCanvas from "@svgedit/svgcanvas";
import { createSvgViewportFit } from "./lib/svg-viewport";

// SVG-Edit's clipboard expects Storage. Opaque frames deliberately have none;
// keep its clipboard in this frame's memory, never in Station's origin storage.
for (const name of ["localStorage", "sessionStorage"]) {
  const entries = new Map<string, string>();
  Object.defineProperty(window, name, {
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, String(value));
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
      clear: () => entries.clear(),
    },
  });
}
const holder = document.getElementById("canvas")!;
const canvas = new SvgCanvas(holder, {
  dimensions: [640, 480],
  initFill: { color: "336699", opacity: 1 },
  initStroke: { color: "000000", width: 1, opacity: 1 },
  imgPath: "",
  baseUnit: "px",
}) as SvgCanvas & {
  // 7.4.2's declarations omit these published runtime methods.
  undoMgr: SvgCanvas["undoMgr"] & { undo(): void; redo(): void };
  updateCanvas(width: number, height: number): void;
  setBackground(color: string, url?: string): void;
  setColor(type: string, color: string): void;
};
let loaded = false;
const send = (value: object) =>
  parent.postMessage({ type: "station:svg-edit", ...value }, "*");
window.addEventListener("message", (event) => {
  if (event.source !== parent || event.data?.type !== "station:svg-edit")
    return;
  const message = event.data;
  try {
    if (message.action === "theme") {
      document.body.style.background =
        typeof message.background === "string" ? message.background : "";
      document.body.style.color =
        typeof message.foreground === "string" ? message.foreground : "";
      canvas.setBackground(document.body.style.background || "transparent");
      return;
    }
    if (
      message.action === "load" &&
      typeof message.source === "string" &&
      message.source.length <= 32768
    ) {
      document.body.style.background =
        typeof message.background === "string" ? message.background : "";
      document.body.style.color =
        typeof message.foreground === "string" ? message.foreground : "";
      loaded = canvas.setSvgString(message.source, true);
      if (!loaded) throw new Error("SVG-Edit could not open this document.");
      canvas.setBackground(document.body.style.background || "transparent");
      fit(true);
      send({ action: "loaded" });
    } else if (
      message.action === "color" &&
      ["fill", "stroke"].includes(message.target) &&
      /^#[0-9a-f]{6}$/i.test(message.value)
    )
      canvas.setColor(message.target, message.value);
    else if (
      message.action === "mode" &&
      ["select", "rect", "ellipse", "line", "path", "fhpath"].includes(
        message.mode,
      )
    )
      canvas.setMode(message.mode);
    else if (message.action === "undo") canvas.undoMgr.undo();
    else if (message.action === "redo") canvas.undoMgr.redo();
    else if (message.action === "delete") canvas.deleteSelectedElements();
    else if (message.action === "group") canvas.groupSelectedElements();
    else if (message.action === "ungroup") canvas.ungroupSelectedElement();
    else if (message.action === "fit") fit(true);
    else if (message.action === "export" && loaded)
      send({ action: "source", source: canvas.getSvgString() });
  } catch (error) {
    send({ action: "error", message: String(error) });
  }
});
const fitViewport = createSvgViewportFit((width, height, zoom) => {
  canvas.setZoom(zoom);
  canvas.updateCanvas(width, height);
});
function fit(force = false) {
  fitViewport(document.documentElement.clientWidth, document.documentElement.clientHeight, canvas.contentW, canvas.contentH, force);
}
let pendingFit = 0;
new ResizeObserver(() => {
  if (!loaded || pendingFit) return;
  pendingFit = requestAnimationFrame(() => { pendingFit = 0; fit(); });
}).observe(document.documentElement);
document.addEventListener("keydown", (event) => {
  if (
    (event.target as HTMLElement).closest(
      "input,textarea,[contenteditable=true]",
    )
  )
    return;
  if ((event.ctrlKey || event.metaKey) && event.key === "z") {
    event.preventDefault();
    if (event.shiftKey) canvas.undoMgr.redo();
    else canvas.undoMgr.undo();
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    canvas.deleteSelectedElements();
  }
});
send({ action: "ready" });

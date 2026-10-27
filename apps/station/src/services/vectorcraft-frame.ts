import { allowedVectorCommand, vectorCommandSchema } from "../core/vector-editor";

// Upstream storage is private to this opaque frame. This wrapper does not change
// the vendor build and never lends it Station's origin, SDK or native authority.
for (const name of ["localStorage", "sessionStorage"]) {
  const entries = new Map<string, string>();
  Object.defineProperty(window, name, { value: { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, String(value)), removeItem: (key: string) => entries.delete(key), clear: () => entries.clear(), key: (index: number) => [...entries.keys()][index] ?? null, get length() { return entries.size; } } });
}
type Vectorcraft = { openFile(name: string, bytes: Uint8Array): boolean; captureDownloads(on: boolean): void; commands(): Promise<any[]>; execute(id: string, params: unknown): Promise<unknown>; request(method: string, params?: unknown): Promise<any> };
declare global { interface Window { vectorcraft?: Vectorcraft } }
const send = (requestId: string, value: object) => parent.postMessage({ type: "station:vectorcraft", requestId, ...value }, "*");
let loaded = false, busy = false;
window.addEventListener("message", async event => {
  if (event.source !== parent || event.data?.type !== "station:vectorcraft" || typeof event.data.requestId !== "string" || event.data.requestId.length > 80) return;
  const { requestId, action } = event.data;
  if (busy) { send(requestId, { error: "VectorCraft is busy" }); return; }
  busy = true;
  try {
    const api = window.vectorcraft;
    if (!api) throw new Error("VectorCraft is still loading");
    api.captureDownloads(true);
    if (action === "load") {
      if (loaded || typeof event.data.source !== "string" || new TextEncoder().encode(event.data.source).length > 32768) throw new Error("Reload the frame to replace this document");
      const name = "station-document.svg";
      if (!api.openFile(name, new TextEncoder().encode(event.data.source))) throw new Error("Import could not be queued");
      let document;
      for (let attempt = 0; attempt < 200; attempt++) {
        try { document = await api.request("document.inspect"); } catch { /* Import is queued before a document exists. */ }
        if (document?.title === name) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (document?.title !== name) throw new Error("Document import timed out");
      loaded = true;
      send(requestId, { result: { loaded: true } });
    } else if (!loaded) throw new Error("Open a document first");
    else if (action === "commands") {
      const catalog = await api.commands();
      send(requestId, { result: catalog.slice(0, 4096).map(command => ({ id: String(command.id).slice(0, 160), label: String(command.label).slice(0, 500), params: String(command.params ?? "{}").slice(0, 12000), enabled: command.enabled === true, allowed: allowedVectorCommand(command.id) })) });
    } else if (action === "execute") {
      const command = vectorCommandSchema.parse(event.data.command);
      if (!allowedVectorCommand(command.id)) throw new Error("This command is outside the document editing contract");
      const catalog = await api.commands();
      if (!catalog.some(item => item.id === command.id && item.enabled)) throw new Error("Command is unavailable for the current selection");
      const result = await api.execute(command.id, command.params);
      send(requestId, { result: { output: result ?? null, document: await api.request("document.inspect") } });
    } else if (action === "export") {
      const result = await api.request("app.export", { format: "svg" });
      if (typeof result.dataBase64 !== "string" || result.dataBase64.length > 45000) throw new Error("SVG export exceeds the 32 KiB asset contract");
      const source = new TextDecoder().decode(Uint8Array.from(atob(result.dataBase64), char => char.charCodeAt(0)));
      send(requestId, { result: { source } });
    } else throw new Error("Unknown editor action");
  } catch (error) { send(requestId, { error: String(error).slice(0, 1000) }); }
  finally { busy = false; }
});
const started = performance.now();
const startup = setInterval(() => {
  if (window.vectorcraft) { clearInterval(startup); send("ready", { ready: true }); }
  else if (performance.now() - started > 45000) { clearInterval(startup); send("ready", { error: "VectorCraft did not start. The saved source remains available." }); }
}, 100);

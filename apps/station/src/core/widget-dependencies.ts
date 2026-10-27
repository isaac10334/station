import type { Panel } from "./docking";
/** Declared dependencies explain intended access; the live scope/acquisition
 * timeline shows actual use. This metadata never authorizes execution.
 */
export function builtinWidgetDependencies(panel: Panel) {
  if (panel.kind === "browser" || (panel.kind === "widget" && panel.widget === "asset-browser")) return {
    capabilities: ["station:assets/catalog"],
    commands: ["assets.catalog", "asset.open", "asset.fork", "asset.metadata", "routing.inspect", "routing.configure"],
    note: "Trusted built-in. Catalog reads acquire a workspace-owned capability handle. Source opening and mutation use application commands; presentation/collection state stays local.",
  };
  if (panel.kind === "widget" && panel.widget === "clock") return { capabilities: ["loop:time/clock"], commands: [], note: "Workspace-owned clock acquisition; disposal cancels ticks." };
  if (panel.kind === "widget" && panel.widget === "browser-tab") return { capabilities: ["station:browser/contexts"], commands: [], note: "Explicit browser grant and owned lifecycle; foreign pages receive no Station SDK." };
  if (panel.kind === "widget" && panel.widget === "ai-chat") return { capabilities: ["station:ai/conversation"], commands: ["commands.list", "permissions.inspect"], note: "User-reviewed chat/task grants; model output cannot approve access." };
  if (panel.kind === "widget" && panel.widget === "capabilities") return { capabilities: [], commands: ["runtime.inspect", "events.read"], note: "Trusted owner diagnostics. Scoped tasks receive only their own redacted command activity." };
  return { capabilities: [], commands: [], note: "No declared built-in service dependency in this catalog. Authored contributions have separately reviewed package declarations; this is not a claim of complete instrumentation." };
}

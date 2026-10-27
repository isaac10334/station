import { useEffect, useMemo, useRef, useState } from "react";
import type { Workspace } from "../../../core/workspace-state";
import { activeShortcutEntries, DEFAULT_SHORTCUTS, resolvedShortcut, shortcutFromEvent, type ShortcutEntry } from "../../../core/shortcuts";
import { useShortcutServices } from "../../shortcut-services";
import { actionTargetCommands } from "../../../core/widget-action-targets";
import { widgetDefinitionAsset, parseWidgetRecipe } from "../../../core/widget-definitions";
import { useDockController } from "../../docking/react";

/** The one retained docking owner presents shortcut widgets. Repeated invocation
 * reuses the instance, preserving drafts and lifecycle. Escape exits focus and
 * returns the widget to its existing placement; it does not clone/render twice. */
export function useShortcutInvocation(workspace: Workspace, invokeShell?: (id: string) => void) {
  const dock = useDockController();
  return (entry: ShortcutEntry) => {
    if (entry.action.kind === "shell") { if (!invokeShell) throw new Error("This shell action is unavailable here"); invokeShell(entry.action.actionId); return; }
    const assetId = entry.action.assetId;
    const source = widgetDefinitionAsset(workspace.assets, assetId);
    if (!source) throw new Error("Shortcut widget is missing or incompatible. Choose another widget in settings.");
    const recipe = parseWidgetRecipe(source.files["widget.json"] ?? "");
    if (["app-shell", "desktop-shell"].includes(recipe.widget)) throw new Error("Root shells cannot open in a modal");
    let currentLayout = dock.layout;
    let panel = Object.values(dock.layout.panels).find(p => p.kind === "widget" && p.id !== dock.layout.rootId && (p.definitionId === assetId || !p.definitionId && assetId === `builtin:${p.widget}`));
    if (!panel) {
      const result = dock.command({ type: "createWidget", widget: recipe.widget, definitionId: assetId, target: { surface: "dashboard", intent: "append" } });
      if (!result.ok || !result.panelId) throw new Error(result.ok ? "Widget instance was not created" : result.reason);
      panel = result.layout.panels[result.panelId];
      currentLayout = result.layout;
    }
    if (!panel) throw new Error("Widget instance is unavailable");
    for (const command of actionTargetCommands(currentLayout, panel.id, false)) {
      // Newly created instances are already active; only existing instances need
      // their owning tab/hidden surface revealed through the shared controller.
      dock.command(command);
    }
    dock.focusPanel(panel.id, entry.presentation ?? "quick-access");
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-presentation-owner="${CSS.escape(panel!.id)}"] [data-quick-capture-input]`)?.focus());
  };
}

/** Root hotkey adapter. Local shortcuts yield to editing/games/IME/handled keys;
 * native callbacks resolve the current active workspace instead of storing it. */
export function ShortcutHost({ workspace, invokeShell }: { workspace: Workspace; invokeShell: (id: string) => void }) {
  const service = useShortcutServices();
  const dock = useDockController();
  const launcherPanel = useRef<string | null>(null);
  const currentFocus = useRef(dock.focusedPanel); currentFocus.current = dock.focusedPanel;
  const invoke = useShortcutInvocation(workspace, invokeShell), latest = useRef(invoke); latest.current = invoke;
  const [error, setError] = useState("");
  const entries = useMemo(() => activeShortcutEntries(workspace.shortcuts ?? DEFAULT_SHORTCUTS, workspace.activeDeskId), [workspace.shortcuts, workspace.activeDeskId]);
  const native = !!document.querySelector('meta[name="station-native-root"]');
  useEffect(() => {
    const run = (id: string) => {
      const entry = entries.find(e => e.id === id); if (!entry || document.querySelector("[data-shortcuts-manager]")) return false;
      try { latest.current(entry); setError(""); return true; } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); return false; }
    };
    const stopNative = service.connect(entries, id => {
      // An unrelated open modal keeps its current presentation and focus.
      if (document.querySelector('dialog[open]:not(.station-focus-dialog),[role="dialog"][data-open]:not(.station-focus-dialog),[role="alertdialog"][data-open]')) return;
      const entry = entries.find(e => e.id === id);
      if (entry && (entry.action.kind === "shell" || entry.presentation === "focus")) {
        launcherPanel.current = null;
        void service.present?.(false, true).catch(reason => setError(String(reason)));
      }
      if (!run(id)) return;
      if (entry?.action.kind === "widget" && (entry.presentation ?? "quick-access") === "quick-access") {
        launcherPanel.current = currentFocus.current ?? "pending";
        void service.present?.(true).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)));
      }
    });
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing || e.defaultPrevented || e.getModifierState("AltGraph") || document.querySelector("[data-shortcuts-manager]")) return;
      if ((e.target as Element)?.closest("input,textarea,select,[contenteditable],.cm-editor,[role=application],canvas,[role=dialog]")) return;
      const platform = /Mac|iPhone|iPad/.test(navigator.platform) ? "mac" : "other";
      const keys = shortcutFromEvent(e, platform); if (!keys) return;
      const entry = entries.find(entry => !(native && entry.scope === "global") && resolvedShortcut(entry.keys!, platform) === resolvedShortcut(keys, platform));
      if (entry) { e.preventDefault(); run(entry.id); }
    };
    window.addEventListener("keydown", down);
    return () => { stopNative(); window.removeEventListener("keydown", down); };
  }, [entries, native, service]);
  useEffect(() => {
    if (!launcherPanel.current) return;
    if (dock.focusedPanel) launcherPanel.current = dock.focusedPanel;
    else if (launcherPanel.current !== "pending") {
      launcherPanel.current = null;
      void service.present?.(false).catch(reason => setError(String(reason)));
    }
  }, [dock.focusedPanel, service]);
  useEffect(() => {
    const dismiss = () => { launcherPanel.current = null; dock.focusPanel(null); };
    window.addEventListener("station:launcher-dismiss", dismiss);
    return () => window.removeEventListener("station:launcher-dismiss", dismiss);
  }, [dock.focusPanel]);
  useEffect(() => {
    const captured = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.workspaceId !== workspace.id || detail.panelId !== launcherPanel.current || detail.panelId !== currentFocus.current) return;
      const panel = workspace.dock.panels[detail.panelId];
      if (panel?.kind !== "widget" || panel.widget !== "quick-capture") return;
      dock.focusPanel(null);
    };
    window.addEventListener("station:capture-saved", captured);
    const viewInbox = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || detail.workspaceId !== workspace.id || detail.panelId !== launcherPanel.current || detail.panelId !== currentFocus.current) return;
      launcherPanel.current = null;
      void service.present?.(false, true).catch(reason => setError(String(reason)));
    };
    window.addEventListener("station:capture-view-inbox", viewInbox);
    return () => { window.removeEventListener("station:capture-saved", captured); window.removeEventListener("station:capture-view-inbox", viewInbox); };
  }, [workspace.id, workspace.dock.panels, dock.focusPanel, service]);
  useEffect(() => () => { void service.present?.(false).catch(() => {}); }, [service, workspace.id, workspace.activeDeskId]);
  return error ? <div role="alert" className="fixed bottom-4 left-4 z-50 max-w-sm rounded-lg border border-line-2 bg-raised p-3 text-sm text-fg">{error}<button className="ml-2 underline" onClick={() => setError("")}>Dismiss</button></div> : null;
}

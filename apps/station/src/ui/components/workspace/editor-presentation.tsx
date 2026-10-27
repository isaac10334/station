import type { Command } from "../../../core/docking";
import { useDockController } from "../../docking/react";
import { Button } from "../ui/button";

/** Open one ordinary editor beside its reference, using the existing floating
 * graph. Expansion and docking move that same retained instance/session/iframe.
 * No source write, installation, grant or activation accompanies presentation. */
export function openInlineEditor(command: (command: Command) => { ok: boolean; reason?: string; panelId?: string }, assetId: string, anchor: HTMLElement) {
  const opened = command({ type: "openAsset", assetId });
  if (!opened.ok) throw new Error(opened.reason ?? "Editor unavailable");
  const panelId = opened.panelId ?? `asset-view:${assetId}`;
  const rect = anchor.getBoundingClientRect();
  const position = command({ type: "float", panelId, x: Math.max(8, Math.min(rect.left, window.innerWidth - 440)), y: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 400)) });
  if (!position.ok) throw new Error(position.reason);
  command({ type: "resizeFloat", panelId, width: Math.min(440, window.innerWidth - 16), height: Math.min(480, window.innerHeight - 16) });
  return panelId;
}

/** Shared presentation controls for every asset editor. The dock host retains
 * draft, selection, history and resource ownership through these transitions. */
export function EditorPresentationControls({ panelId }: { panelId: string }) {
  const { layout, command, focusPanel } = useDockController();
  return <div role="group" aria-label="Editor presentation" className="flex shrink-0 flex-wrap gap-1">
    <Button size="sm" variant="ghost" onClick={event => { focusPanel(null); const panel = layout.panels[panelId]; if (panel && "assetId" in panel && panel.assetId) openInlineEditor(command, panel.assetId, event.currentTarget); }}>Compact</Button>
    <Button size="sm" variant="ghost" onClick={() => focusPanel(panelId)}>Expand editor</Button>
    <Button size="sm" variant="ghost" onClick={() => { focusPanel(null); if (layout.floating[panelId]) command({ type: "dockFloat", panelId, target: { surface: "main", intent: "tab" } }); else command({ type: "activate", panelId }); }}>Open as tab</Button>
  </div>;
}

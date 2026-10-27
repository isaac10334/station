import { useState, useSyncExternalStore } from "react";
import type { Workspace } from "../../../core/workspace-state";
import { DEFAULT_SHORTCUTS, INBOX_DOCUMENT, type ShortcutEntry, type ShortcutSettings } from "../../../core/shortcuts";
import { shellActions } from "../../../features/shell/application/actions";
import { useShortcutServices } from "../../shortcut-services";
import { widgetDefinitions } from "../../widget-catalog";
import { assetReferenceSchema } from "../../../core/asset-references";
import { PropertyEditor } from "../ui/property-editor";
import { ShortcutRecorder } from "../ui/shortcut-recorder";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { SettingsSection } from "./settings-section";

/** Property-backed settings, over the same shell descriptors and asset identity
 * picker as other inspectors. The native adapter reports actual registration;
 * selecting Global is configuration, never evidence that the OS accepted it. */
export function ShortcutSettings({ workspace, onChange, onCreateInbox, onPreview }: {
  workspace: Workspace; onChange: (settings: ShortcutSettings) => void;
  onCreateInbox: (files: Record<string, string>) => string; onPreview?: (entry: ShortcutEntry) => void;
}) {
  const settings = workspace.shortcuts ?? DEFAULT_SHORTCUTS;
  const service = useShortcutServices();
  const native = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
  const [query, setQuery] = useState(""), [selected, setSelected] = useState<string | null>(null), [error, setError] = useState("");
  const shell = shellActions(workspace).flatMap(g => g.items).filter(a => a.id !== "palette");
  const entries: ShortcutEntry[] = [...settings.entries, ...shell.filter(a => a.shortcut && !settings.entries.some(e => e.action.kind === "shell" && e.action.actionId === a.id)).map(a => ({ id: `shell-${a.id}`, label: a.label, keys: a.shortcut!, enabled: true, scope: "workspace" as const, action: { kind: "shell" as const, actionId: a.id } }))];
  const save = (entry: ShortcutEntry, rethrow = false) => { try { const others = settings.entries.filter(e => e.id !== entry.id); onChange({ ...settings, entries: [...others, entry] }); setError(""); } catch (reason) { setError(String(reason)); if (rethrow) throw reason; } };
  const widgets = widgetDefinitions(workspace.assets, workspace).filter(d => d.create?.kind === "widget" && !["builtin:app-shell", "builtin:desktop-shell"].includes(d.id) && d.creation !== "contextual");
  return <div data-shortcuts-manager className="flex min-w-0 flex-col gap-6">
    <SettingsSection title="Bindings" description="Record a combination, choose an action, and decide where it works. Global keys are released while this manager is open so you can record them.">
      <div className="flex flex-wrap items-center gap-2"><Input aria-label="Search keyboard shortcuts" placeholder="Search actions…" value={query} onChange={e => setQuery(e.target.value)} className="min-w-32 flex-1" /><Button size="sm" variant="outline" onClick={() => {
        const entry: ShortcutEntry = { id: `shortcut-${crypto.randomUUID()}`, label: "Open widget", keys: null, enabled: true, scope: "workspace", action: { kind: "widget", assetId: "builtin:quick-capture" } }; save(entry); setSelected(entry.id);
      }}>Add shortcut</Button></div>
      <div className="divide-y divide-line rounded-lg border border-line">
        {entries.filter(e => `${e.label} ${e.keys ?? ""} ${e.scope}`.toLowerCase().includes(query.toLowerCase())).map(entry => {
          const status = native.bindings.find(b => b.id === entry.id);
          return <div key={entry.id} className="p-3">
            <div className="flex flex-wrap items-start gap-3">
              <button type="button" aria-expanded={selected === entry.id} className="min-w-32 flex-1 rounded text-left text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={() => setSelected(selected === entry.id ? null : entry.id)}><span className="block font-medium">{entry.label}</span><span className="text-xs text-fg-3">{entry.scope === "global" ? "Global · desktop" : entry.scope === "desk" ? workspace.desks.find(d => d.id === entry.deskId)?.name ?? "Missing desk" : "This workspace"}{entry.action.kind === "widget" ? " · Open in modal" : " · Shell action"}</span></button>
              <div className="min-w-40 flex-1"><ShortcutRecorder label={entry.label} value={entry.keys} onChange={keys => save({ ...entry, keys })} taken={[{ keys: "mod+k", label: "Command palette" }, ...entries.filter(e => e.id !== entry.id && e.keys && e.enabled && !(entry.scope === "desk" && e.scope === "desk" && entry.deskId !== e.deskId)).map(e => ({ keys: e.keys!, label: e.label }))]} /></div>
              <PropertyEditor field={{ key: "enabled", label: `Enable ${entry.label}`, type: "boolean" }} value={entry.enabled} onCommit={value => save({ ...entry, enabled: value === true })} />
            </div>
            {entry.scope === "global" && <p className="mt-1 text-xs text-fg-3">{native.phase === "web" ? "Desktop required. Works locally in this browser." : native.phase === "error" ? native.message : status?.message ?? (status?.status === "suspended" ? "Paused while configuring shortcuts" : status?.status === "registered" ? "Registered with the OS" : "Waiting for desktop registration")}</p>}
            {selected === entry.id && <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <div className="space-y-1"><span className="text-xs text-fg-3">Name</span><PropertyEditor field={{ key: "label", label: "Shortcut name", type: "text", required: true, maxLength: 120 }} value={entry.label} onCommit={value => save({ ...entry, label: String(value) })} /></div>
              <div className="space-y-1"><span className="text-xs text-fg-3">Scope</span><PropertyEditor field={{ key: "scope", label: `Scope for ${entry.label}`, type: "select", options: ["workspace", "desk", "global"] }} value={entry.scope} onCommit={value => { if (value) save({ ...entry, scope: value as ShortcutEntry["scope"], deskId: value === "desk" ? workspace.activeDeskId : undefined }); }} /></div>
              {entry.scope === "desk" && <NativeSelect aria-label="Shortcut desk" value={entry.deskId} onChange={e => save({ ...entry, deskId: e.target.value })}>{workspace.desks.map(desk => <option key={desk.id} value={desk.id}>{desk.name}</option>)}</NativeSelect>}
              <div className="space-y-1"><label className="text-xs text-fg-3">Action</label><NativeSelect aria-label={`Action for ${entry.label}`} value={entry.action.kind === "widget" ? "widget" : entry.action.actionId} onChange={e => save({ ...entry, action: e.target.value === "widget" ? { kind: "widget", assetId: "builtin:quick-capture" } : { kind: "shell", actionId: e.target.value } })}><option value="widget">Open a widget in a modal</option>{shell.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</NativeSelect></div>
              {entry.action.kind === "widget" && <div className="space-y-1"><span className="text-xs text-fg-3">Widget · choose or drop an asset</span><PropertyEditor field={{ key: "widget", label: "shortcut widget", type: "asset", required: true }} reference={{ workspaceId: workspace.id, options: widgets.map(w => ({ assetId: w.id, label: w.title })) }} value={{ assetId: entry.action.assetId }} onCommit={value => { const reference = assetReferenceSchema.parse(value); save({ ...entry, action: { kind: "widget", assetId: reference.assetId } }, true); }} /></div>}
              {entry.action.kind === "widget" && <div className="space-y-1"><span className="text-xs text-fg-3">Presentation</span><PropertyEditor field={{ key: "presentation", label: `Presentation for ${entry.label}`, type: "select", options: ["quick-access", "focus"] }} value={entry.presentation ?? "quick-access"} onCommit={value => save({ ...entry, presentation: value as "quick-access" | "focus" })} /></div>}
              <div className="flex flex-wrap gap-2 sm:col-span-2">{onPreview && entry.action.kind === "widget" && <Button size="sm" variant="outline" onClick={() => onPreview(entry)}>Try action</Button>}<Button size="sm" variant="ghost" onClick={() => save({ ...entry, keys: null, enabled: false })}>Disable shortcut</Button>{settings.entries.some(e => e.id === entry.id) && <Button size="sm" variant="ghost" onClick={() => { onChange({ ...settings, entries: settings.entries.filter(e => e.id !== entry.id) }); setSelected(null); }}>{entry.id.startsWith('shell-') ? 'Restore default' : 'Remove binding'}</Button>}</div>
            </div>}
          </div>;
        })}
        {!entries.some(e => `${e.label} ${e.keys ?? ""} ${e.scope}`.toLowerCase().includes(query.toLowerCase())) && <p className="p-4 text-sm text-fg-3">No matching shortcuts.</p>}
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </SettingsSection>
    <SettingsSection title="Capture inbox" description="Captures are ordinary records. Choose a local data source with text, created and status columns; view and customize it with Data view.">
      <PropertyEditor field={{ key: "inbox", label: "capture inbox", type: "asset" }} reference={{ workspaceId: workspace.id, options: workspace.assets.filter(a => a.kind === "data-source").map(a => ({ assetId: a.id, label: a.name })) }} value={settings.inboxSourceId ? { assetId: settings.inboxSourceId } : undefined} onCommit={value => onChange({ ...settings, inboxSourceId: assetReferenceSchema.optional().parse(value)?.assetId })} />
      {!workspace.assets.some(a => a.id === settings.inboxSourceId && a.kind === "data-source") && <Button size="sm" variant="outline" onClick={() => { try { const id = onCreateInbox({ "data.json": JSON.stringify(INBOX_DOCUMENT, null, 2) }); onChange({ ...settings, inboxSourceId: id }); } catch (reason) { setError(String(reason)); } }}>Create inbox</Button>}
    </SettingsSection>
  </div>;
}

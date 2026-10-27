import { useState, type ReactNode } from "react";
import { Folder, Keyboard, Settings2, Columns, Trash2 } from "lucide-react";
import type { State, Workspace } from "../../../core/workspace-state";
import type { OverlayWorkspacePort } from "../../../features/shell/application/ports";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { changeTheme } from "../ui/theme-toggle";
import { SettingsSection, SettingsRow } from "./settings-section";
import { WorkspaceDeletion } from "./workspace-deletion";
import { useDeskScene } from "./desk-scene";
import { DesktopUpdateSettings } from "./desktop-update-settings";

type Section = "app" | "workspaces" | "shortcuts";
/** One settings shell retains navigation while workspace-specific panels change.
 * Desk configuration reuses the existing spatial overview and its transition. */
export function WorkspaceSettings({ store, state, workspace, section, shortcuts, onClose, onSection }: {
  store: OverlayWorkspacePort; state: State; workspace: Workspace;
  section?: Section; shortcuts: ReactNode; onClose: () => void; onSection: (section: Section) => void;
}) {
  const tab = section ?? "app";
  const [deleting, setDeleting] = useState<string | null>(null);
  const scene = useDeskScene();
  const sections = [{ id: "app", label: "App", icon: Settings2 }, { id: "workspaces", label: "Workspaces", icon: Folder }, { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard }] as const;
  return <>
    <DialogHeader><DialogTitle>Settings</DialogTitle><DialogDescription>App preferences and local workspace management.</DialogDescription></DialogHeader>
    <DialogBody>
      <div className="grid min-h-96 min-w-0 gap-6 sm:grid-cols-[150px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex flex-wrap gap-1 sm:flex-nowrap sm:flex-col sm:border-r sm:border-line sm:pr-4">
          {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => onSection(id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === id ? "bg-selected text-fg" : "text-fg-3 hover:bg-hover hover:text-fg"}`}><Icon size={15} aria-hidden />{label}</button>)}
        </nav>
        <div className="min-w-0 space-y-6">
          {tab === "app" && <><SettingsSection title="Appearance" description="These preferences apply across all your workspaces.">
            <SettingsRow title="Theme" description="Choose how Station looks."><NativeSelect aria-label="App theme" value={state.app.theme} onChange={event => changeTheme(event.target.value as State["app"]["theme"], theme => store.patchApp({ theme }), event.currentTarget)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></NativeSelect></SettingsRow>
            <SettingsRow title="Density" description="Adjust the spacing of workspace controls."><NativeSelect aria-label="App density" value={state.app.density} onChange={event => store.patchApp({ density: event.target.value as State["app"]["density"] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></NativeSelect></SettingsRow>
          </SettingsSection><DesktopUpdateSettings /></>}
          {tab === "workspaces" && <>
            <SettingsSection title="Your workspaces" description="Stored locally on this device. Open a workspace to edit its preferences.">
              <div className="divide-y divide-line rounded-lg border border-line">
                {state.workspaces.map(item => <div key={item.id} className="flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-fg">{item.name}{item.id === workspace.id && <span className="ml-2 text-xs font-normal text-fg-3">Current</span>}</p><p className="text-xs text-fg-3">{item.assets.length} {item.assets.length === 1 ? "asset" : "assets"} · {item.desks.length} {item.desks.length === 1 ? "desk" : "desks"}</p></div>
                  {item.id !== workspace.id && <Button size="sm" variant="outline" onClick={() => store.selectWorkspace(item.id)}>Open</Button>}
                  <Button size="icon" variant="ghost" aria-label={`Delete ${item.name}`} disabled={state.workspaces.length === 1} title={state.workspaces.length === 1 ? "Create another workspace before deleting the last one" : `Delete ${item.name}`} className="text-danger" onClick={() => setDeleting(item.id)}><Trash2 /></Button>
                </div>)}
              </div>
              <Button size="sm" variant="outline" onClick={() => store.createWorkspace("Untitled workspace")}>New workspace</Button>
              {state.workspaces.length === 1 && <p className="text-xs text-fg-3">Keep at least one workspace. Create another before deleting this one.</p>}
            </SettingsSection>
            <SettingsSection title={workspace.name} description="Preferences for the current workspace.">
              <label className="flex flex-col gap-1 text-xs text-fg-2">Name<Input aria-label="Workspace name" value={workspace.name} onChange={event => store.renameWorkspace(event.target.value)} /></label>
              <label className="flex flex-col gap-1 text-xs text-fg-2">Description<textarea aria-label="Workspace description" rows={3} value={workspace.description} onChange={event => store.describeWorkspace(event.target.value)} /></label>
              <SettingsRow title="Desks and layout" description="Zoom out to switch desks, arrange your workspace, or open desk settings."><Button size="sm" variant="outline" onClick={() => { onClose(); requestAnimationFrame(() => scene.show(true)); }}><Columns />Manage desks</Button></SettingsRow>
            </SettingsSection>
          </>}
          {tab === "shortcuts" && <><div><h2 className="text-sm font-medium">Keyboard shortcuts</h2><p className="mt-1 text-xs text-fg-3">Actions and capture for {workspace.name}.</p></div><div key={workspace.id}>{shortcuts}</div></>}
        </div>
      </div>
    </DialogBody>
    <Dialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null); }}><DialogContent size="sm">{deleting && <WorkspaceDeletion key={deleting} store={store} state={state} workspaceId={deleting} onClose={() => setDeleting(null)} />}</DialogContent></Dialog>
  </>;
}

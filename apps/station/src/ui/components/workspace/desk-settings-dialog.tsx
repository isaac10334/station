import { useDockController } from "../../docking/react";
import type { ReactNode } from "react";
import { ShellBackgroundControl } from "./shell-background-control";
import { ShellDefinitionField } from "./shell-definition-field";
import { ServicesManager } from "./services-manager";
import { ExtensionSettings } from "./extension-settings";
import { availableDeskTemplates, parseDeskTemplate } from "../../../core/desk-templates";
import { WidgetPreview } from "./widget-preview";
import { useEffect, useState } from "react";
import type { Workspace } from "../../../core/workspace-state";
import { deps } from "../../../composition";
import { parseTheme } from "../../../core/theme-assets";
import { assetFiles } from "../../../core/source-project";
import { Copy, Plus, Check } from "../../lib/icons";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "../ui/dialog";
import { Tabs, TabsList, TabsTab, TabsPanel } from "../ui/tabs";
import {
  SettingsSection,
  SettingsRow,
  SettingsConfirmation,
} from "./settings-section";
import { DeskWidgetSettings } from "./desk-widget-settings";
import { WorkspacePackageSettings } from "./workspace-package-settings";
import { DesktopUpdateSettings } from "./desktop-update-settings";
import { AgentAccessSettings } from "./agent-access-settings";
import { ShortcutSettings } from "./shortcut-settings";
import { useShortcutInvocation } from "./shortcut-host";

type SettingsTab = "desk" | "appearance" | "widgets" | "packages" | "app" | "access" | "shortcuts" | "services" | "extensions";

/** Configuration tabs share a fixed shell; each tab has one bounded scroll region. */
export function DeskSettingsDialog({
  workspace,
  onClose,
  onCreate,
  onOpenAsset,
  onSearch,
  docked = false,
}: {
  docked?: boolean;
  workspace: Workspace;
  onClose: () => void;
  onCreate: (kind: "theme" | "package") => void;
  onOpenAsset: (id: string) => void;
  onSearch: () => void;
}) {
  const { layout, command } = useDockController();
  const previewShortcut = useShortcutInvocation(workspace);
  const Content = docked ? DockedSettingsShell : DialogContent;
  const Title = docked ? "h2" : DialogTitle;
  const Description = docked ? "p" : DialogDescription;
  const desk = deps.store.desk();
  const [tab, setTab] = useState<SettingsTab>("desk"),
    [name, setName] = useState(desk.name),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState<"reset" | "delete" | null>(null),
    [newDesk, setNewDesk] = useState(false),
    [newName, setNewName] = useState(""),
    [templateId, setTemplateId] = useState(workspace.defaultTemplateId ?? "builtin:desk-app");
  const templates = availableDeskTemplates(workspace.assets);
  const root = workspace.dock.rootId ? workspace.dock.panels[workspace.dock.rootId] : undefined;
  useEffect(() => {
    setName(desk.name);
  }, [desk.id, desk.name]);
  const themes = workspace.assets.filter((asset) => asset.kind === "theme");
  const themeAsset = themes.find(
    (asset) => asset.id === (desk.themeId ?? workspace.themeId),
  );
  let theme: ReturnType<typeof parseTheme> | undefined;
  try {
    if (themeAsset)
      theme = parseTheme(assetFiles(themeAsset)["theme.json"] ?? "");
  } catch {
    /* Runtime retains the last valid theme. */
  }
  const themeName = themeAsset?.name ?? "Station default";
  const notify = (message: string) => {
    setNotice(message);
    setError("");
  };
  return (
    <Content size="lg" className={docked ? "flex h-full min-h-0 flex-1 flex-col" : "station-settings-dialog"}>
      <DialogHeader className="pb-4">
        <div className="flex items-center justify-between gap-2">{!docked && <Title>Desk settings</Title>}{!docked && <Button size="sm" variant="ghost" onClick={() => {
          const existing = Object.values(layout.panels).find(p => p.kind === "widget" && p.widget === "desk-settings");
          const result = command(existing ? { type: "activate", panelId: existing.id } : { type: "createWidget", widget: "desk-settings", target: { surface: "main", intent: "tab" } });
          if (result.ok) onClose(); else setError(result.reason);
        }}>Dock settings</Button>}</div>
        <Description className="text-xs text-fg-3">
          {desk.name} · {workspace.name}
        </Description>
      </DialogHeader>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as SettingsTab);
          setNotice("");
        }}
        size="sm"
        className="min-h-0 flex-1"
      >
        <TabsList
          aria-label="Desk settings sections"
          className="gap-4 px-5 max-sm:gap-2"
          wrapperClassName="shrink-0"
        >
          <TabsTab value="desk">Desk</TabsTab>
          <TabsTab value="appearance">Appearance</TabsTab>
          <TabsTab value="widgets">Widgets</TabsTab>
          <TabsTab value="packages">Packages</TabsTab>
          <TabsTab value="services">Services</TabsTab>
          <TabsTab value="extensions">Extensions</TabsTab>
          <TabsTab value="app">App</TabsTab>
          <TabsTab value="shortcuts">Shortcuts</TabsTab>
          <TabsTab value="access">Agents</TabsTab>
        </TabsList>
        <DialogBody className="py-6">
          <TabsPanel value="shortcuts"><ShortcutSettings workspace={workspace} onChange={settings => deps.store.configureShortcuts(settings)} onPreview={entry => { try { previewShortcut(entry); } catch (reason) { setError(String(reason)); } }} onCreateInbox={files => {
            const id = deps.commands.execute("asset.create", { kind: 'data-source', name: 'Inbox', files }).result.id;
            command({ type: 'createWidget', widget: 'data-view', defaults: { displayName: 'Inbox', dataView: { sourceId: id, presentation: 'table', search: '', descending: true, sortBy: 'created', hiddenColumns: ['created'] } }, target: { surface: 'sidebar', intent: 'tab' } });
            return id;
          }} /></TabsPanel>
          <TabsPanel value="services"><ServicesManager/></TabsPanel>
          <TabsPanel value="extensions"><ExtensionSettings/></TabsPanel>
          <TabsPanel value="access" className="motion-reduce:transition-none"><AgentAccessSettings /></TabsPanel>
          <TabsPanel value="app" keepMounted className="motion-reduce:transition-none">
            <DesktopUpdateSettings />
          </TabsPanel>
          <TabsPanel
            value="desk"
            keepMounted
            className="motion-reduce:transition-none"
          >
            <div className="flex flex-col gap-8">
              <SettingsSection
                title="Your desk"
                description="Each desk keeps its own layout, navigation, and widget settings."
              >
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!name.trim()) {
                      setError("Enter a name for this desk.");
                      return;
                    }
                    deps.store.renameDesk(name.trim());
                    notify("Desk renamed.");
                  }}
                >
                  <label
                    htmlFor="desk-name"
                    className="text-xs font-medium text-fg-2"
                  >
                    Desk name
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="desk-name"
                      maxLength={120}
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setError("");
                      }}
                      aria-invalid={!!error}
                      aria-describedby={error ? "desk-name-error" : undefined}
                    />
                    <Button
                      size="sm"
                      type="submit"
                      disabled={!name.trim() || name.trim() === desk.name}
                    >
                      Save name
                    </Button>
                  </div>
                  {error && (
                    <p
                      id="desk-name-error"
                      className="text-xs text-danger"
                      role="alert"
                    >
                      {error}
                    </p>
                  )}
                </form>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNewName("");
                      setNewDesk(true);
                    }}
                  >
                    <Plus size={14} />
                    New desk
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      deps.store.createDesk(`${desk.name} copy`, true);
                      notify("Created a copy with its own layout.");
                    }}
                  >
                    <Copy size={14} />
                    Duplicate desk
                  </Button>
                </div>
              </SettingsSection>
              <SettingsSection title="App shell" description="The shell is the root layout widget for this desk.">
                <div className="space-y-1 text-xs"><span>Root widget</span><ShellDefinitionField workspace={workspace} label="Root widget" definitionId={root?.kind === "widget" ? root.definitionId ?? `builtin:${root.widget}` : "builtin:app-shell"} onOpen={onOpenAsset} onChange={selection => { const result = command(selection); if (!result.ok) { setError(result.reason); throw new Error(result.reason); } }} /></div>
                {root?.kind === "widget" && <ShellBackgroundControl value={root.background} onChange={background => { deps.store.dispatchDock({type:"configureShell",background}); }} />}
                <Button size="sm" variant="outline" onClick={() => { const id = deps.store.saveDeskTemplate(`${desk.name} template`); onOpenAsset(id); notify("Template asset created."); }}>Save as template asset</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (root?.kind === "widget") onOpenAsset(root.definitionId ?? `builtin:${root.widget}`); }}>Edit root definition</Button>
              </SettingsSection>
              <SettingsSection
                title="Workspace default"
                description="New desks start from a saved setup. Existing desks keep their own settings."
              >
                <SettingsRow
                  title="Save this desk as the default"
                  description="Copy this layout, navigation, widget availability, and theme for future desks."
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      deps.store.saveDeskDefault();
                      notify("Workspace default saved.");
                    }}
                  >
                    Save as default
                  </Button>
                </SettingsRow>
                <SettingsRow
                  title="Reset this desk"
                  description={
                    workspace.defaultSetup
                      ? "Replace this desk’s setup with the workspace default. Shared assets stay in place."
                      : "Save a workspace default before resetting a desk."
                  }
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!workspace.defaultSetup}
                    onClick={() => setConfirmation("reset")}
                  >
                    Reset to default
                  </Button>
                </SettingsRow>
              </SettingsSection>
              <div className="border-t border-line pt-5">
                <SettingsRow
                  title="Delete this desk"
                  description={
                    workspace.desks.length < 2
                      ? "Keep at least one desk in your workspace."
                      : "Remove this layout and its settings. Shared assets and packages are kept."
                  }
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger"
                    disabled={workspace.desks.length < 2}
                    onClick={() => setConfirmation("delete")}
                  >
                    Delete desk
                  </Button>
                </SettingsRow>
              </div>
            </div>
          </TabsPanel>
          <TabsPanel
            value="appearance"
            keepMounted
            className="motion-reduce:transition-none"
          >
            <div className="flex flex-col gap-8">
              <SettingsSection
                title="Desk theme"
                description="A theme changes colors, typography, and spacing. Changes apply as you choose."
              >
                <label
                  htmlFor="desk-theme"
                  className="text-xs font-medium text-fg-2"
                >
                  Theme for this desk
                </label>
                <NativeSelect
                  id="desk-theme"
                  value={desk.themeId ?? ""}
                  onChange={(event) => {
                    deps.store.patchDesk({
                      themeId: event.target.value || null,
                    });
                    notify("Desk theme updated.");
                  }}
                >
                  <option value="">Use workspace theme</option>
                  {themes.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </NativeSelect>
                <div
                  className="flex items-center justify-between gap-4 rounded-lg border border-line-2 bg-frame p-4"
                  aria-label="Current theme preview"
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="text-3xl font-medium tracking-tight text-fg"
                      style={theme ? { fontFamily: theme.font } : undefined}
                    >
                      Aa
                    </span>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-fg">
                        {themeName}
                      </span>
                      <span className="text-xs text-fg-2">
                        {desk.themeId
                          ? "Desk override"
                          : "Inherited from workspace"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5" aria-hidden>
                    {[
                      theme?.colors.frame ?? "var(--frame)",
                      theme?.colors.raised ?? "var(--raised)",
                      theme?.colors.fg ?? "var(--fg)",
                      theme?.colors.focus ?? "var(--focus-ring)",
                    ].map((color, index) => (
                      <span
                        key={index}
                        className="size-5 rounded-full border border-line-2"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                {themeAsset && !theme && (
                  <p className="text-xs leading-5 text-danger" role="status">
                    This theme has invalid data. The last valid appearance
                    remains active.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCreate("theme")}
                  >
                    <Plus size={14} />
                    New theme
                  </Button>
                  {themeAsset && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenAsset(themeAsset.id)}
                    >
                      Edit theme
                    </Button>
                  )}
                </div>
              </SettingsSection>
              <SettingsSection
                title="Workspace theme"
                description="The default appearance for desks without a theme override."
              >
                <SettingsRow
                  title={
                    workspace.themeId
                      ? (themes.find((asset) => asset.id === workspace.themeId)
                          ?.name ?? "Missing theme")
                      : "Station default"
                  }
                  description="Make the selected desk theme the workspace default. Other desks with overrides keep their themes."
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      !desk.themeId ||
                      desk.themeId === workspace.themeId ||
                      !theme
                    }
                    onClick={() => {
                      deps.store.setWorkspaceTheme(desk.themeId);
                      notify("Workspace theme updated.");
                    }}
                  >
                    Make default
                  </Button>
                </SettingsRow>
                {workspace.themeId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      deps.store.setWorkspaceTheme(null);
                      notify("Workspace uses the Station default theme.");
                    }}
                  >
                    Use Station default
                  </Button>
                )}
              </SettingsSection>
            </div>
          </TabsPanel>
          <TabsPanel
            value="widgets"
            keepMounted
            className="motion-reduce:transition-none"
          >
            <DeskWidgetSettings workspace={workspace} onNotice={notify} />
          </TabsPanel>
          <TabsPanel
            value="packages"
            keepMounted
            className="motion-reduce:transition-none"
          >
            <WorkspacePackageSettings
              workspace={workspace}
              onCreate={() => onCreate("package")}
              onOpenAsset={onOpenAsset}
              onSearch={onSearch}
              onNotice={notify}
            />
          </TabsPanel>
        </DialogBody>
      </Tabs>
      <DialogFooter className="justify-between border-t border-line pt-3 max-sm:flex">
        <p
          className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-fg-2"
          role="status"
          aria-live="polite"
        >
          {notice && <Check size={14} className="shrink-0" />}
          {name.trim() !== desk.name
            ? "Name changes aren’t saved yet."
            : notice || "Settings apply immediately."}
        </p>
        {!docked && <Button size="sm" onClick={onClose}>Done</Button>}
      </DialogFooter>
      <SettingsConfirmation
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation === "delete"
            ? `Delete ${desk.name}?`
            : "Reset this desk?"
        }
        description={
          confirmation === "delete"
            ? "This desk’s layout and settings will be removed. Assets and installed packages stay in the workspace."
            : "The workspace default will replace this desk’s layout and settings. Its current runtimes will stop. Shared assets are kept."
        }
        action={confirmation === "delete" ? "Delete desk" : "Reset desk"}
        destructive={confirmation === "delete"}
        onConfirm={() => {
          const action = confirmation;
          setConfirmation(null);
          if (action === "delete") deps.store.deleteDesk();
          else deps.store.resetDeskDefault();
          notify(
            action === "delete"
              ? "Desk deleted."
              : "Desk reset to the workspace default.",
          );
        }}
      />
      <Dialog open={newDesk} onOpenChange={setNewDesk}>
        <DialogContent size="sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!newName.trim()) return;
              try { deps.store.createDesk(newName.trim(), false, templateId); } catch (reason) { setError(String(reason)); return; }
              setNewDesk(false);
              notify("New desk created from template.");
            }}
          >
            <DialogHeader className="pb-4">
              <DialogTitle>New desk</DialogTitle>
              <DialogDescription>
                Choose a template. Assets stay shared.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 px-5">
              <label
                htmlFor="new-desk-name"
                className="text-xs font-medium text-fg-2"
              >
                Desk name
              </label>
              <Input
                id="new-desk-name"
                value={newName}
                maxLength={120}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="e.g. Development"
                autoFocus
              />
              {error && <p role="alert" className="text-xs text-danger">{error}</p>}
              <label className="mt-3 text-xs font-medium text-fg-2">Desk template<NativeSelect aria-label="Desk template" value={templateId} onChange={event => setTemplateId(event.target.value)}>{templates.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</NativeSelect></label>
              {(() => { try { const source = templates.find(asset => asset.id === templateId); const setup = source && parseDeskTemplate(source.files["desk.json"] ?? "").setup; const panel = setup?.dock.rootId && setup.dock.panels[setup.dock.rootId]; return panel && panel.kind === "widget" ? <WidgetPreview seed={{widget:panel.widget, defaults:{background:panel.background}}} small /> : null; } catch { return <p className="text-xs text-danger">This template is invalid. Choose another or edit its source.</p>; } })()}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setNewDesk(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!newName.trim()}>
                Create desk
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Content>
  );
}

function DockedSettingsShell({ children, className }: { children?: ReactNode; className?: string; size?: string }) { return <section aria-label="Desk settings" className={className}>{children}</section>; }

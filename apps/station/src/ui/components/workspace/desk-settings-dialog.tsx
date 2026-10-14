import { useEffect, useState } from "react";
import type { Workspace } from "../../../core/model";
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

type SettingsTab = "desk" | "appearance" | "widgets" | "packages";

/** Configuration tabs share a fixed shell; each tab has one bounded scroll region. */
export function DeskSettingsDialog({
  workspace,
  onClose,
  onCreate,
  onOpenAsset,
  onSearch,
}: {
  workspace: Workspace;
  onClose: () => void;
  onCreate: (kind: "theme" | "package") => void;
  onOpenAsset: (id: string) => void;
  onSearch: () => void;
}) {
  const desk = deps.store.desk();
  const [tab, setTab] = useState<SettingsTab>("desk"),
    [name, setName] = useState(desk.name),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState<"reset" | "delete" | null>(null),
    [newDesk, setNewDesk] = useState(false),
    [newName, setNewName] = useState("");
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
    <DialogContent size="lg" className="station-settings-dialog">
      <DialogHeader className="pb-4">
        <DialogTitle>Desk settings</DialogTitle>
        <DialogDescription>
          {desk.name} · {workspace.name}
        </DialogDescription>
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
        </TabsList>
        <DialogBody className="py-6">
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
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
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
              deps.store.createDesk(newName.trim());
              setNewDesk(false);
              notify("New desk created from the workspace default.");
            }}
          >
            <DialogHeader className="pb-4">
              <DialogTitle>New desk</DialogTitle>
              <DialogDescription>
                Start with the workspace default. Assets stay shared.
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
    </DialogContent>
  );
}

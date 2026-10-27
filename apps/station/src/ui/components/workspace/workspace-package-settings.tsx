import { useRef, useState } from "react";
import type { Workspace } from "../../../core/workspace-state";
import { deps } from "../../../composition";
import { importPackage, CONTRIBUTION_ROLES } from "../../../core/package-assets";
import { Plus, Upload, ChevronDown, Terminal } from "../../lib/icons";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { SettingsConfirmation, SettingsSection } from "./settings-section";

const capabilityLabel = (id: string) =>
  id === "station:editor/session"
    ? "Read and edit the opened asset"
    : id === "station:commands/invoke"
      ? "Invoke declared commands"
      : id;

/** Package configuration and source import never start a guest or Component command. */
export function WorkspacePackageSettings({
  workspace,
  onOpenAsset,
  onCreate,
  onSearch,
  onNotice,
}: {
  workspace: Workspace;
  onOpenAsset: (id: string) => void;
  onCreate: () => void;
  onSearch: () => void;
  onNotice: (message: string) => void;
}) {
  const desk = deps.store.desk();
  const file = useRef<HTMLInputElement>(null);
  const [bundle, setBundle] = useState(""),
    [imports, setImports] = useState<ReturnType<typeof importPackage> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [reading, setReading] = useState(false),
    [importedPackage, setImportedPackage] = useState<string | null>(null),
    [remove, setRemove] = useState<{ id: string; name: string } | null>(null);
  const review = (source: string) => {
    setError("");
    setImportedPackage(null);
    setImports(null);
    try {
      setImports(importPackage(source, workspace.assets));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Installed packages"
        description="Packages install a reviewed snapshot of definitions. Choose which contributions are available on this desk; starting or invoking them is separate."
        action={
          <Button size="sm" variant="outline" onClick={onCreate}>
            <Plus size={14} />
            New package
          </Button>
        }
      >
        {!workspace.installations.length && (
          <div className="flex flex-col gap-1 rounded-lg border border-dashed border-line-2 p-5">
            <p className="text-sm text-fg-2">No packages installed</p>
            <p className="text-xs leading-5 text-fg-2">
              Import a source bundle below, then open its package asset to
              review and install it.
            </p>
          </div>
        )}
        {workspace.installations.map((installation) => (
          <section
            key={installation.id}
            className="rounded-lg border border-line-2"
          >
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="break-words text-sm font-medium text-fg">
                  {installation.name}
                </h3>
                <p className="text-xs text-fg-2">
                  {installation.manifest.contributions.length} contributions ·{" "}
                  {installation.enabled
                    ? "Enabled in workspace"
                    : "Disabled in workspace"}
                </p>
              </div>
              <Switch
                size="sm"
                aria-label={`Enable ${installation.name} in workspace`}
                checked={installation.enabled}
                onCheckedChange={(checked) => {
                  deps.store.enablePackage(installation.id, checked);
                  onNotice(
                    `${installation.name} ${checked ? "enabled" : "disabled"} in workspace.`,
                  );
                }}
              />
            </div>
            <details className="group/package border-t border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs text-fg-2 outline-none focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-fg-3 hover:bg-hover motion-reduce:transition-none">
                Contributions and permissions
                <ChevronDown
                  size={14}
                  className="text-fg-2 transition-transform group-open/package:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <div className="flex flex-col gap-5 border-t border-line px-4 py-4">
                {installation.manifest.contributions.map((contribution) => {
                  const id = `${installation.id}/${contribution.id}`;
                  return (
                    <div key={id} className="flex flex-col gap-3">
                      <Switch
                        label={contribution.title}
                        description={`${CONTRIBUTION_ROLES[contribution.role].label} · ${CONTRIBUTION_ROLES[contribution.role].description}`}
                        checked={!desk.disabledContributions.includes(id)}
                        disabled={!installation.enabled}
                        size="sm"
                        onCheckedChange={(checked) => {
                          deps.store.patchDesk({
                            disabledContributions: checked
                              ? desk.disabledContributions.filter(
                                  (item) => item !== id,
                                )
                              : [...desk.disabledContributions, id],
                          });
                          onNotice(
                            `${contribution.title} ${checked ? "enabled" : "disabled"} on this desk.`,
                          );
                        }}
                      />
                      {contribution.capabilities.length > 0 && (
                        <div className="flex flex-col gap-2 border-l border-line-2 pl-3">
                          <p className="text-xs text-fg-2">
                            Workspace permissions
                          </p>
                          {contribution.capabilities.map((capability) => (
                            <Switch
                              key={capability}
                              label={capabilityLabel(capability)}
                              size="sm"
                              checked={
                                installation.grants[contribution.id]?.includes(
                                  capability,
                                ) ?? false
                              }
                              onCheckedChange={(checked) => {
                                const grants =
                                  installation.grants[contribution.id] ?? [];
                                deps.store.setPackageGrants(
                                  installation.id,
                                  contribution.id,
                                  checked
                                    ? [...grants, capability]
                                    : grants.filter(
                                        (item) => item !== capability,
                                      ),
                                );
                                onNotice(
                                  `Permission ${checked ? "allowed" : "revoked"} for ${contribution.title}.`,
                                );
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex justify-end border-t border-line pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:text-danger"
                    onClick={() => setRemove(installation)}
                  >
                    Uninstall package
                  </Button>
                </div>
              </div>
            </details>
          </section>
        ))}
      </SettingsSection>
      <SettingsSection
        title="Import a package"
        description="Bring in assets from a Station source bundle. Review the contents before adding them."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={reading}
            aria-busy={reading}
            onClick={() => file.current?.click()}
          >
            <Upload size={14} />
            {reading ? "Reading file…" : "Choose file"}
          </Button>
          <span className="text-xs text-fg-2">.station.json or .json</span>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Package bundle file"
            onChange={async (event) => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (!selected) return;
              setReading(true);
              try {
                if (selected.size > 8 * 1024 * 1024)
                  throw new Error("Choose a source bundle smaller than 8 MiB.");
                const source = await selected.text();
                setBundle(source);
                review(source);
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : String(error),
                );
              } finally {
                setReading(false);
              }
            }}
          />
        </div>
        <details className="group/import">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded text-xs text-fg-2 outline-none hover:text-fg-2 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg-3">
            <ChevronDown
              size={14}
              className="transition-transform group-open/import:rotate-180 motion-reduce:transition-none"
            />
            Paste JSON instead
          </summary>
          <div className="flex flex-col items-start gap-3 pt-3">
            <label
              htmlFor="import-package"
              className="text-xs font-medium text-fg-2"
            >
              Package JSON
            </label>
            <textarea
              id="import-package"
              rows={5}
              spellCheck={false}
              value={bundle}
              aria-invalid={!!error}
              aria-describedby={error ? "package-import-error" : undefined}
              placeholder={'{"format": "station-package", …}'}
              className="w-full resize-y rounded-md border border-line-2 bg-frame px-3 py-2 font-mono text-xs leading-5 text-fg outline-none placeholder:text-fg-4 focus-visible:border-fg-3 focus-visible:ring-1 focus-visible:ring-focus-ring"
              onChange={(event) => {
                setBundle(event.target.value);
                setImports(null);
                setError("");
                setImportedPackage(null);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!bundle.trim()}
              onClick={() => review(bundle)}
            >
              Review import
            </Button>
          </div>
        </details>
        {error && (
          <p
            id="package-import-error"
            className="break-words text-xs leading-5 text-danger"
            role="alert"
          >
            {error}
          </p>
        )}
        {imports && (
          <div className="flex flex-col gap-3 rounded-lg border border-line-2 bg-frame p-4">
            <h3 className="text-sm font-medium text-fg">
              {imports.length} assets ready to import
            </h3>
            <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto">
              {imports.map((asset) => (
                <li
                  key={asset.id}
                  className="flex items-start justify-between gap-4 text-xs"
                >
                  <span className="min-w-0 break-words text-fg-2">
                    {asset.name}
                  </span>
                  <span className="shrink-0 text-fg-2">
                    {asset.kind === "web-content"
                      ? "Web content"
                      : asset.kind[0]!.toUpperCase() + asset.kind.slice(1)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs leading-5 text-fg-2">
              Source assets only. Permissions and running state stay behind.
              Packages require a separate installation review.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setImports(null)}
              >
                Cancel import
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  try {
                    deps.store.importAssets(imports);
                    setImportedPackage(
                      imports.find((asset) => asset.kind === "package")?.id ??
                        null,
                    );
                    onNotice(`Imported ${imports.length} assets.`);
                    setImports(null);
                    setBundle("");
                    setError("");
                  } catch (error) {
                    setError(
                      error instanceof Error ? error.message : String(error),
                    );
                  }
                }}
              >
                Import assets
              </Button>
            </div>
          </div>
        )}
        {importedPackage && (
          <div
            className="flex items-center justify-between gap-3 text-xs text-fg-2"
            role="status"
          >
            <span>Imported. Open the package to review installation.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenAsset(importedPackage)}
            >
              Open package
            </Button>
          </div>
        )}
      </SettingsSection>
      {workspace.installations.some((item) =>
        item.manifest.contributions.some((item) => item.role === "command"),
      ) && (
        <div className="flex items-center justify-between gap-4 border-t border-line pt-4">
          <p className="text-xs leading-5 text-fg-2">
            Installed commands open in their own output widgets.
          </p>
          <Button size="sm" variant="ghost" onClick={onSearch}>
            <Terminal size={14} />
            Find commands
          </Button>
        </div>
      )}
      <SettingsConfirmation
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
        title={`Uninstall ${remove?.name ?? "package"}?`}
        description="Its runtimes will stop. Saved widgets remain as unavailable placeholders, and source assets stay in the workspace."
        action="Uninstall package"
        destructive
        onConfirm={() => {
          if (!remove) return;
          deps.store.uninstallPackage(remove.id);
          onNotice(`${remove.name} uninstalled.`);
          setRemove(null);
        }}
      />
    </div>
  );
}

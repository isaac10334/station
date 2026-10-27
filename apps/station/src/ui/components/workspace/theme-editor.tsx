import { useMemo, useState } from "react";
import { builtinIconAssets } from "../../../core/builtin-icons";
import { openInlineEditor } from "./editor-presentation";
import { useSourceEditing } from "../../lib/use-source-editing";
import type { DataAsset } from "../../../core/asset-state";
import type { Workspace } from "../../../core/workspace-state";
import {
  parseTheme,
  DEFAULT_THEME_LAYOUT,
  DEFAULT_THEME_TINTS,
  patchThemeSource,
  themeFont,
  type ThemeDefinition,
} from "../../../core/theme-assets";
import { assetFiles } from "../../../core/source-project";
import { ICON_NAMES } from "@station/capabilities/icons";
import { Icon } from "@station/ui";
import { deps } from "../../../composition";
import { ColorPicker } from "../ui/color-picker";
import { resolvedSvgIcon } from "../../../services/svg-icons";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { NativeSelect } from "../ui/native-select";
import { ThemeNumberField } from "./theme-number-field";
import { AssetReferencePicker } from "./asset-reference-picker";
import { useDockController } from "../../docking/react";

/** Visual edits use the same validated JSON source as the code pane and SDK editors. */
export function ThemeEditor({
  asset,
  workspace,
  onOpenCode,
}: {
  asset: DataAsset;
  workspace: Workspace;
  onOpenCode: () => void;
}) {
  const editable = useSourceEditing(asset.id);
  const dock = useDockController();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const icons = useMemo(
    () =>
      [...builtinIconAssets(), ...workspace.assets].flatMap((source) =>
        Object.entries(assetFiles(source))
          .filter(([path]) => path.endsWith(".svg"))
          .map(([path, content]) => {
            try {
              return {
                assetId: source.id,
                path,
                label: `${source.name} / ${path}`,
                url: resolvedSvgIcon(content),
                error: "",
              };
            } catch (error) {
              return {
                assetId: source.id,
                path,
                label: `${source.name} / ${path}`,
                url: "",
                error: error instanceof Error ? error.message : String(error),
              };
            }
          }),
      ),
    [workspace.assets],
  );
  let theme: ThemeDefinition;
  try {
    theme = parseTheme(asset.files["theme.json"]!);
  } catch {
    return (
      <div role="alert" className="p-6 text-sm text-danger">
        <p>
          The JSON needs attention. Open Code to repair it; the active theme
          keeps its last valid colors.
        </p>
        <Button onClick={onOpenCode}>Open Code</Button>
      </div>
    );
  }
  const save = (change: (current: ThemeDefinition) => ThemeDefinition) => {
    if (!deps.store.canEditSource(asset.id))
      throw new Error("This invitation grants viewing only");
    if (deps.store.active().id !== workspace.id)
      throw new Error("Workspace changed. Reopen this theme.");
    const current = deps.store
      .active()
      .assets.find((item) => item.id === asset.id);
    if (!current)
      throw new Error("Theme missing. Reopen it from the Asset browser.");
    const source = patchThemeSource(assetFiles(current)["theme.json"]!, change);
    deps.control.execute({ method: "asset.files.patch", params: { assetId: asset.id, expectedAssetRevision: current.revision, patch: { "theme.json": source } } });
    setError("");
  };
  const saveControl = (
    change: (current: ThemeDefinition) => ThemeDefinition,
  ) => {
    try {
      save(change);
    } catch (error) {
      setError(
        `${String(error)}. Open Code to repair the source or restore edit access.`,
      );
    }
  };
  return (
    <div
      className="mx-auto flex w-full max-w-3xl @container flex-col gap-8 overflow-auto p-6 text-sm"
      aria-label="Visual theme editor"
    >
      <div
        className="rounded-xl border border-line-2 p-5"
        style={{
          background: theme.colors.frame,
          color: theme.colors.fg,
          fontFamily: themeFont(theme.font),
          borderRadius: theme.radius,
        }}
      >
        <div className="mb-4 text-xl font-medium">
          A workspace, in your colors.
        </div>
        <div className="flex gap-2">
          <span
            className="rounded px-3 py-2"
            style={{ background: theme.colors.raised }}
          >
            Panel
          </span>
          <span
            className="rounded px-3 py-2"
            style={{ background: theme.colors.selected }}
          >
            Selected
          </span>
          <span
            className="rounded px-3 py-2"
            style={{ color: theme.colors.focus }}
          >
            Focus
          </span>
        </div>
      </div>
      {!editable && (
        <p className="text-xs text-fg-3">
          Viewing shared source. Fork the asset to edit your own copy.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}{" "}
          <Button size="sm" onClick={onOpenCode}>
            Open Code
          </Button>
        </p>
      )}
      <fieldset aria-label="Theme controls" className="contents">
        <section>
          <h3 className="mb-4 font-medium">Semantic colors</h3>
          <div className="grid grid-cols-1 @min-[560px]:grid-cols-2 gap-x-8 gap-y-4">
            {Object.entries(theme.colors).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3"
              >
                <span className="capitalize text-fg-2">{key}</span>
                <ColorPicker
                  label={key}
                  value={value}
                  variant="field"
                  className="min-w-0 max-w-[75%]"
                  disabled={!editable}
                  swatches={Object.values(theme.colors)}
                  onValueChange={(value) =>
                    save((current) => ({
                      ...current,
                      colors: { ...current.colors, [key]: value },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-4 font-medium">Widget tints</h3>
          <div className="grid grid-cols-1 @min-[560px]:grid-cols-2 gap-x-8 gap-y-4">
            {(Object.keys(DEFAULT_THEME_TINTS) as (keyof typeof DEFAULT_THEME_TINTS)[]).map(key => <div key={key} className="flex items-center justify-between gap-3"><span className="capitalize text-fg-2">{key}</span><ColorPicker label={`${key} widget tint`} variant="field" disabled={!editable} value={theme.tints?.[key] ?? theme.colors.focus} onValueChange={value => save(current => ({ ...current, tints: { ...DEFAULT_THEME_TINTS, ...current.tints, [key]: value } }))} /></div>)}
          </div>
        </section>
        <section>
          <h3 className="mb-4 font-medium">Code colors</h3>
          <div className="grid grid-cols-1 @min-[560px]:grid-cols-2 gap-x-8 gap-y-4">
            {(["keyword", "string", "number", "function"] as const).map(key => <div key={key} className="flex items-center justify-between gap-3">
              <span className="capitalize text-fg-2">{key}</span>
              <ColorPicker label={`Code ${key}`} variant="field" className="min-w-0 max-w-[75%]" disabled={!editable}
                value={theme.syntax?.[key] ?? (key === "keyword" || key === "number" ? theme.colors.focus : theme.colors.fg)}
                onValueChange={value => save(current => ({...current, syntax: {keyword:current.colors.focus,string:current.colors.fg,number:current.colors.focus,function:current.colors.fg,...current.syntax,[key]:value}}))} />
            </div>)}
          </div>
        </section>
        <section className="grid grid-cols-2 gap-4">
          {(
            [
              ["Mode", "mode", ["dark", "light"]],
              [
                "Typeface",
                "font",
                ["IBM Plex Sans", "IBM Plex Mono", "system-ui"],
              ],
              ["Density", "density", ["compact", "comfortable"]],
            ] as const
          ).map(([label, key, options]) => (
            <label key={key} className="flex flex-col gap-2 text-xs text-fg-2">
              {label}
              <NativeSelect
                disabled={!editable}
                value={theme[key]}
                onChange={(event) =>
                  saveControl((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              >
                {options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </NativeSelect>
            </label>
          ))}
          {(["spacing", "radius"] as const).map((key) => (
            <ThemeNumberField
              key={key}
              label={key}
              disabled={!editable}
              min={key === "spacing" ? 4 : 0}
              max={24}
              value={theme[key]}
              onCommit={(value) =>
                save((current) => ({ ...current, [key]: value }))
              }
            />
          ))}
        </section>
        <section>
          <h3 className="mb-4 font-medium">Workspace layout</h3>
          <div className="grid grid-cols-2 gap-4">
            {([
              ["pageGutter", "Page gutter", 16, 96],
              ["pageTitle", "Page title size", 24, 48],
              ["rowHeight", "Table row height", 28, 56],
              ["toolbarHeight", "Toolbar height", 32, 56],
              ["bodySize", "Body text size", 11, 18],
            ] as const).map(([key, label, min, max]) => <ThemeNumberField key={key} label={label} min={min} max={max} disabled={!editable} value={(theme.layout ?? DEFAULT_THEME_LAYOUT)[key]} onCommit={value => save(current => ({ ...current, layout: { ...(current.layout ?? DEFAULT_THEME_LAYOUT), [key]: value } }))} />)}
          </div>
        </section>
        <section>
          <h3 className="mb-2 font-medium">Icon catalog</h3>
          <p className="mb-4 text-xs text-fg-3">
            Override an icon with a static SVG file from a workspace asset.
            Static shapes only, up to 32 KB / 256 elements. No scripts, CSS,
            animation, text, links, or external resources. Icons use monochrome
            masks; multicolor artwork is not preserved. Unsupported or missing
            files use the built-in glyph.
          </p>
          <Input
            aria-label="Search semantic icons"
            placeholder="Search names or SVG references"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mb-4"
          />
          <div className="grid grid-cols-1 @min-[560px]:grid-cols-2 @min-[720px]:grid-cols-3 gap-3">
            {ICON_NAMES.filter((name) =>
              `${name} ${theme.icons?.[name]?.assetId ?? ""} ${theme.icons?.[name]?.path ?? ""}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            ).map((name) => {
              const reference = theme.icons?.[name];
              const resource =
                reference &&
                icons.find(
                  (icon) =>
                    icon.assetId === reference.assetId &&
                    icon.path === reference.path,
                );
              return (
                <div
                  key={name}
                  className="flex min-w-0 flex-col gap-2 rounded-lg border border-line p-3 text-xs text-fg-2"
                >
                  <span className="flex items-center gap-2">
                    {resource?.url ? (
                      <span
                        aria-hidden
                        className="inline-block size-8 shrink-0 bg-current"
                        style={{
                          mask: `url("${resource.url}") center / contain no-repeat`,
                        }}
                      />
                    ) : (
                      <Icon name={name} size={32} builtIn />
                    )}
                    {name}
                  </span>
                  <span className="text-fg-3">{reference ? reference.assetId.startsWith("builtin:") ? "Selected built-in" : "Asset override" : "Built-in default"}</span>
                  <AssetReferencePicker label={`${name} icon`} workspaceId={workspace.id} options={icons} value={reference} disabled={!editable} onOpen={id => dock.command({ type: "openAsset", assetId: id })}
                    onChange={(value) => {
                      saveControl((current) => {
                        const overrides = { ...current.icons };
                        if (value?.path) overrides[name] = { assetId: value.assetId, path: value.path };
                        else delete overrides[name];
                        return { ...current, icons: overrides };
                      });
                    }}
                  />
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" disabled={!editable || !reference} onClick={() => saveControl(current => { const icons = { ...current.icons }; delete icons[name]; return { ...current, icons }; })}>Restore default</Button>
                    <Button size="sm" variant="ghost" disabled={!editable} onClick={event => {
                      try {
                        const sourceId = reference?.assetId ?? `builtin:icon:${name}`;
                        const fork = deps.control.execute({ method: "asset.fork", params: { assetId: sourceId, name: `${name} custom icon` } }).result;
                        const path = reference?.path ?? "image.svg";
                        save(current => ({ ...current, icons: { ...current.icons, [name]: { assetId: fork.id, path } } }));
                        openInlineEditor(dock.command, fork.id, event.currentTarget);
                      } catch (reason) { setError(String(reason)); }
                    }}>Fork and edit</Button>
                    {reference && !reference.assetId.startsWith("builtin:") && <Button size="sm" variant="ghost" onClick={event => { try { openInlineEditor(dock.command, reference.assetId, event.currentTarget); } catch (reason) { setError(String(reason)); } }}>Edit inline</Button>}
                  </div>
                  {reference && (
                    <span className="break-all text-fg-3">
                      {reference.assetId} / {reference.path}
                    </span>
                  )}
                  {reference && (!resource || resource.error) && (
                    <span role="status" className="text-danger">
                      {resource?.error ?? "SVG file missing"}. Restore a
                      supported file or choose Built-in.
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </fieldset>
    </div>
  );
}

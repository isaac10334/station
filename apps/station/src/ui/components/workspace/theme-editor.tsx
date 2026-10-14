import { useSourceEditing } from "../../lib/use-source-editing";
import type { DataAsset, Workspace } from "../../../core/model";
import {
  parseTheme,
  themeFont,
  type ThemeDefinition,
} from "../../../core/theme-assets";
import { assetFiles } from "../../../core/source-project";
import { ICON_NAMES } from "@station/capabilities/icons";
import { Icon } from "@station/ui";
import { deps } from "../../../composition";
import { ColorPicker } from "../ui/color-picker";
import { NativeSelect } from "../ui/native-select";
import { ThemeNumberField } from "./theme-number-field";

/** Visual edits use the same validated JSON source as the code pane and SDK editors. */
export function ThemeEditor({
  asset,
  workspace,
}: {
  asset: DataAsset;
  workspace: Workspace;
}) {
  const editable = useSourceEditing(asset.id);
  let theme: ThemeDefinition;
  try {
    theme = parseTheme(asset.files["theme.json"]!);
  } catch {
    return (
      <p role="alert" className="p-6 text-sm text-danger">
        The JSON needs attention. Open Code to fix it before using the visual
        editor.
      </p>
    );
  }
  const save = (next: ThemeDefinition) => {
    const source = JSON.stringify(next, null, 2);
    parseTheme(source);
    deps.store.editFile(asset.id, "theme.json", source);
  };
  const icons = workspace.assets.flatMap((source) =>
    Object.keys(assetFiles(source))
      .filter((path) => path.endsWith(".svg"))
      .map((path) => ({
        assetId: source.id,
        path,
        label: `${source.name} / ${path}`,
      })),
  );
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
      <fieldset
        disabled={!editable}
        aria-label="Theme controls"
        className="contents"
      >
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
                  onValueChange={(value) =>
                    save({
                      ...theme,
                      colors: { ...theme.colors, [key]: value },
                    })
                  }
                />
              </div>
            ))}
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
                value={theme[key]}
                onChange={(event) =>
                  save({ ...theme, [key]: event.target.value })
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
              min={key === "spacing" ? 4 : 0}
              max={24}
              value={theme[key]}
              onCommit={(value) => save({ ...theme, [key]: value })}
            />
          ))}
        </section>
        <section>
          <h3 className="mb-2 font-medium">Icon catalog</h3>
          <p className="mb-4 text-xs text-fg-3">
            Override an icon with a static SVG file from a workspace asset.
            Unsupported SVGs keep the built-in icon.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {ICON_NAMES.map((name) => (
              <label
                key={name}
                className="flex flex-col gap-1.5 text-xs text-fg-2"
              >
                <span className="flex items-center gap-2">
                  <Icon name={name} size={16} />
                  {name}
                </span>
                <NativeSelect
                  aria-label={`${name} icon`}
                  value={
                    theme.icons?.[name] ? JSON.stringify(theme.icons[name]) : ""
                  }
                  onChange={(event) => {
                    const overrides = { ...theme.icons };
                    if (event.target.value)
                      overrides[name] = JSON.parse(event.target.value);
                    else delete overrides[name];
                    save({ ...theme, icons: overrides });
                  }}
                >
                  <option value="">Built-in</option>
                  {icons.map((icon) => (
                    <option
                      key={icon.assetId + icon.path}
                      value={JSON.stringify({
                        assetId: icon.assetId,
                        path: icon.path,
                      })}
                    >
                      {icon.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ))}
          </div>
        </section>
      </fieldset>
    </div>
  );
}

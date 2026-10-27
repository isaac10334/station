import type { Command } from "../../../core/docking";
import { builtinWidgetAssets, parseWidgetRecipe, widgetDefinitionAsset } from "../../../core/widget-definitions";
import { PropertyEditor } from "../ui/property-editor";
import { parsePropertyReference } from "../../../core/property-editors";

export type RootShellSelection = Extract<Command, { type: "setRootWidget" }>;

/** A required, compatible definition reference. Selection changes the root's
 * presentation without applying prefab children or replacing existing slots.
 * Opening the source does not install or execute authored code. */
export function ShellDefinitionField({ workspace, definitionId, label = "Root layout", onChange, onOpen }: {
  workspace: { id: string; assets: readonly import("../../../core/asset-state").Asset[] };
  definitionId: string;
  label?: string;
  onChange: (selection: RootShellSelection) => void | Promise<void>;
  onOpen?: (id: string) => void;
}) {
  const options = [...builtinWidgetAssets(), ...workspace.assets].flatMap(asset => {
    if (asset.kind !== "widget-definition") return [];
    try {
      const recipe = parseWidgetRecipe(asset.files["widget.json"] ?? "");
      return recipe.widget === "app-shell" || recipe.widget === "desktop-shell"
        ? [{ assetId: asset.id, label: asset.name }]
        : [];
    } catch { return []; }
  });
  const field = { key: "rootDefinition", label, type: "asset" as const, required: true };
  return <PropertyEditor
    field={field}
    reference={{ workspaceId: workspace.id, options, onOpen }}
    value={{ assetId: definitionId }}
    onCommit={async value => {
      const reference = parsePropertyReference(field, value);
      const asset = reference && widgetDefinitionAsset(workspace.assets, reference.assetId);
      if (!asset) throw new Error("Choose a compatible root widget definition.");
      const recipe = parseWidgetRecipe(asset.files["widget.json"] ?? "");
      if (recipe.widget !== "app-shell" && recipe.widget !== "desktop-shell")
        throw new Error("Choose an App shell or Desktop shell definition.");
      await onChange({ type: "setRootWidget", widget: recipe.widget, definitionId: asset.id, slots: [] });
    }}
  />;
}

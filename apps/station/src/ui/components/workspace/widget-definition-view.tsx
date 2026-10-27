import { patchOwnerFiles } from "../../lib/owner-commands";
import { WidgetVisualEditor } from "./widget-visual-editor";
import { SurfaceDefinitionEditor } from "./surface-definition-editor";
import { reconcileDefinitionDefaults } from "../../../core/definition-snapshot";
import { widgetDefinitionAsset } from "../../../core/widget-definitions";
import { EditorPresentationControls } from "./editor-presentation";
import { ProgramDefinitionEditor } from './program-definition-editor';
import { useState } from "react";
import type { DataAsset } from "../../../core/asset-state";
import {
  isBuiltinWidgetAsset,
  parseWidgetRecipe,
  type WidgetRecipe,
} from "../../../core/widget-definitions";
import { deps } from "../../../composition";
import { useDockController } from "../../docking/react";
import { Button } from "../ui/button";
import { EditorWorkspace, useEditorOwner } from "./editor-workspace";

function RecipeEditor({
  asset,
  ownerId,
}: {
  asset: DataAsset;
  ownerId: string;
}) {
  const session = useEditorOwner(asset, ownerId);
  return <EditorWorkspace session={session} ownerId={ownerId} />;
}

/** Built-ins are a virtual projection: never copied into storage or passed to an
 * editable source session. Forking creates source; instantiation is explicit.
 */
export function WidgetDefinitionView({
  asset,
  ownerId,
}: {
  asset: DataAsset;
  ownerId: string;
}) {
  const { command } = useDockController();
  const [error, setError] = useState("");
  const [mode, setMode] = useState("visual");
  let recipe: WidgetRecipe | undefined;
  try {
    recipe = parseWidgetRecipe(asset.files["widget.json"] ?? "");
  } catch {}
  const builtin = isBuiltinWidgetAsset(asset.id);
  const act = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (error) {
      setError(String(error));
    }
  };
  return (
    <div className="station-project-view">
      <div className="station-project-toolbar flex-wrap">
        <strong>{asset.name}</strong>
        <span className="text-xs text-fg-3">
          {builtin ? "Built-in · read-only" : "Widget definition"}
        </span>
        <span className="spacer" />
        <EditorPresentationControls panelId={ownerId} />
        {!builtin && recipe?.origin && recipe.forkDefaults && <Button size="sm" variant="outline" onClick={() => act(() => {
          const current = deps.store.active().assets.find(item => item.id === asset.id);
          if (!current?.files) throw new Error("Fork unavailable");
          const fork = parseWidgetRecipe(current.files["widget.json"] ?? "");
          const source = widgetDefinitionAsset(deps.store.active().assets, fork.origin!.assetId);
          if (!source) throw new Error("Origin source is missing. Your fork is retained; restore or select a compatible source.");
          const next = parseWidgetRecipe(source.files["widget.json"] ?? "");
          if (next.widget !== fork.widget) throw new Error("Origin renderer changed; choose an explicit migration.");
          patchOwnerFiles(asset.id, { "widget.json": JSON.stringify({ ...fork, defaults: reconcileDefinitionDefaults(fork.forkDefaults!, fork.defaults, next.defaults), forkDefaults: next.defaults, origin: { assetId: source.id, revision: source.revision } }, null, 2) });
        })}>Update fork defaults</Button>}
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={mode === "visual"}
          onClick={() => setMode("visual")}
        >
          Visual
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={mode === "source"}
          onClick={() => setMode("source")}
        >
          Source
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            act(() => {
              const id = deps.control.execute({ method: "asset.fork", params: { assetId: asset.id, name: `${asset.name.slice(0, 108)} variant` } }).result.id;
              command({ type: "openAsset", assetId: id });
            })
          }
        >
          Fork definition
        </Button>
        {recipe?.widget === "app-shell" && <Button size="sm" onClick={() => act(() => { const r = command({ type: "createWidget", widget: "app-shell", definitionId: asset.id, target: { surface: "dashboard", intent: "append" } }); if (!r.ok) throw new Error(r.reason); })}>Create instance</Button>}
        <Button
          size="sm"
          onClick={() =>
            act(() => {
              const recipe = parseWidgetRecipe(
                asset.files["widget.json"] ?? "",
              );
              const result = ["app-shell", "desktop-shell"].includes(
                recipe.widget,
              )
                ? command({
                    type: "setRootWidget",
                    widget: recipe.widget as "app-shell" | "desktop-shell",
                    definitionId: asset.id,
                  })
                : command({
                    type: "createWidget",
                    widget: recipe.widget,
                    definitionId: asset.id,
                    target: { surface: "dashboard", intent: "append" },
                  });
              if (!result.ok) throw new Error(result.reason);
            })
          }
        >
          {recipe && ["app-shell", "desktop-shell"].includes(recipe.widget)
            ? "Use as desk root"
            : "Create instance"}
        </Button>
      </div>
      <p className="border-b border-line px-3 py-2 text-xs text-fg-3">
        Source changes apply to future instances. Existing instances retain their version;
        use Update from definition in instance settings to reconcile overrides.
        Editing, placement and program activation are separate.
      </p>
      {error && (
        <p role="alert" className="px-3 text-xs text-danger">
          {error}
        </p>
      )}
      {mode === "visual" && recipe?.defaults.surface ? <SurfaceDefinitionEditor surface={recipe.defaults.surface} readOnly={builtin} onChange={surface => {
        const current = deps.store.active().assets.find(item => item.id === asset.id);
        if (!current || current.kind !== "widget-definition") throw new Error("Definition unavailable");
        const recipe = parseWidgetRecipe(current.files["widget.json"] ?? "");
        const source = JSON.stringify({ ...recipe, defaults: { ...recipe.defaults, surface } }, null, 2);
        parseWidgetRecipe(source);
        patchOwnerFiles(asset.id, { "widget.json": source });
      }} /> : mode === 'visual' && recipe?.widget === 'program' && !builtin ? <ProgramDefinitionEditor asset={asset} ownerId={ownerId}/> : mode === "visual" && recipe ? (
        <WidgetVisualEditor
          key={asset.id}
          recipe={recipe}
          authored={deps.store
            .active()
            .assets.filter(
              (item): item is DataAsset =>
                item.kind === "widget-definition" && item.id !== asset.id,
            )
            .flatMap((item) => {
              try {
                return [
                  {
                    id: item.id,
                    seed: parseWidgetRecipe(item.files["widget.json"] ?? ""),
                  },
                ];
              } catch {
                return [];
              }
            })}
          readOnly={builtin}
          onChange={(change) =>
            act(() => {
              const current = deps.store
                .active()
                .assets.find((item) => item.id === asset.id);
              if (!current || current.kind !== "widget-definition")
                throw new Error("Definition unavailable");
              const next = change(
                parseWidgetRecipe(current.files["widget.json"] ?? ""),
              );
              const source = JSON.stringify(next, null, 2);
              parseWidgetRecipe(source);
              patchOwnerFiles(current.id, { "widget.json": source });
            })
          }
        />
      ) : builtin ? (
        <pre
          tabIndex={0}
          aria-label="Read-only widget definition"
          className="min-h-0 flex-1 overflow-auto p-4 text-xs text-fg-2"
        >
          {asset.files["widget.json"]}
        </pre>
      ) : (
        <RecipeEditor asset={asset} ownerId={ownerId} />
      )}
    </div>
  );
}

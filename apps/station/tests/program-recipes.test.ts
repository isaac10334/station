import { expect, test } from "bun:test";
import ts from "typescript";
import { createGuestSdk } from "@loop-kit/scripting";
import { RecordingSurface } from "@loop-kit/ui";
import { PROGRAM_RECIPES } from "../src/core/program-recipes";
import {
  builtinWidgetAssets,
  forkWidgetRecipe,
  parseWidgetRecipe,
} from "../src/core/widget-definitions";

test("forkable recipes render through the portable SDK and their callbacks update keyed frames without IO", async () => {
  for (const recipe of PROGRAM_RECIPES) {
    const surface = new RecordingSurface();
    const denied = async () => {
      throw new Error("Recipe requested undeclared IO");
    };
    const sdk = createGuestSdk({
      invoke: denied,
      subscribe: denied,
      openSurface: async () => ({
        render: (document) => surface.render(JSON.parse(document)),
        nextEvent: async () => {
          const event = await surface.nextEvent();
          return event && JSON.stringify(event);
        },
        dispose: () => surface.dispose(),
      }),
    });
    const source = recipe.draft.files[recipe.draft.entry]!.replace(
      "import { ui } from '@station/sdk';",
      "",
    ).replace("export default", "return");
    const js = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    const entry = new Function("ui", js)(sdk.ui);
    const result = await entry(null);
    expect(result).toBe(sdk.ui);
    expect(surface.frame?.revision).toBe(0);
    if (recipe.id === "counter")
      surface.event({
        revision: 0,
        sequence: 1,
        key: "increment",
        type: "activate",
      });
    else if (recipe.id === "checklist")
      surface.event({
        revision: 0,
        sequence: 1,
        key: "task-0",
        type: "change",
        value: true,
      });
    else if (recipe.id === "notes")
      surface.event({
        revision: 0,
        sequence: 1,
        key: "note",
        type: "change",
        value: "My own source",
      });
    else
      surface.event({
        revision: 0,
        sequence: 1,
        key: "celsius",
        type: "change",
        value: "0",
      });
    await sdk.ui.update();
    const serialized = JSON.stringify(surface.frame);
    expect(surface.frame?.revision).toBe(1);
    expect(serialized).toContain(
      recipe.id === "counter"
        ? "Count: 1"
        : recipe.id === "checklist"
          ? "1 of 2 complete"
          : recipe.id === "notes"
            ? "My own source"
            : "32.0 °F",
    );
    const asset = builtinWidgetAssets().find(
      (asset) => asset.id === `builtin:program-${recipe.id}`,
    )!;
    const fork = forkWidgetRecipe(asset);
    expect(fork.id).not.toBe(asset.id);
    expect(
      parseWidgetRecipe(fork.files["widget.json"]!).defaults?.programDraft
        ?.files,
    ).toEqual(recipe.draft.files);
    expect(JSON.stringify(fork)).not.toContain('"bindings"');
    sdk.ui.dispose();
  }
});

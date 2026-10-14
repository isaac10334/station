import { expect, test } from "bun:test";
import { createStore } from "../src/core/model";
import { editorPaneTarget } from "../src/core/editor-panes";
test("closed editor panes recover into their owner without replacing other mounted pane identities", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  store.dispatchDock({ type: "openAsset", assetId: "greeting" });
  const owner = "asset-view:greeting";
  store.dispatchDock({
    type: "compose",
    ownerId: owner,
    panels: [
      {
        id: "code",
        kind: "editor-part",
        ownerId: owner,
        assetId: "greeting",
        slotId: "code",
        part: "code",
        definitionId: "station:editor/code",
        tags: ["widget"],
      },
    ],
    root: {
      kind: "stack",
      id: "code-slot",
      tabs: ["code"],
      active: "code",
      keepEmpty: true,
    },
  });
  const target = editorPaneTarget(store.active().dock, owner, "files")!;
  expect(target.ownerId).toBe(owner);
  expect(
    store.dispatchDock({
      type: "createEditorPart",
      ownerId: owner,
      assetId: "foreign",
      slotId: "files",
      part: "files",
      target,
    }).ok,
  ).toBe(false);
  const result = store.dispatchDock({
    type: "createEditorPart",
    ownerId: owner,
    assetId: "greeting",
    slotId: "files",
    part: "files",
    target,
  });
  expect(result.ok).toBe(true);
  expect(store.active().dock.panels.code.id).toBe("code");
  expect(editorPaneTarget(store.active().dock, "foreign", "files")).toBe(null);
});

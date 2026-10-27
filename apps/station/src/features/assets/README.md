# Asset editor workflow

`application/editor-document.ts` exports `projectEditorDocument(workspace, asset, panel)`. It is a pure projection of stable identity, source revision, compatible editors and selected renderer; it never opens, edits or activates. `ui/components/workspace/asset-editor-renderers.tsx` owns the exhaustive typed React adapter table. Widget renderer dispatch and instance ownership remain separate. Tests: feature-controllers, composition-policies and editor-panes.

Run `bun run repo context @station/app --json` and `bun run repo verify @station/app`.

# Station implementation plan

Baseline: `46e9a56`, branch `station-overhaul`. Stop before assets.

1. Rename product/package and preserve all storage, unit, WIT, capability and artifact identities. Verify existing workspace loading.
2. Evolve the dock document: reusable definition metadata, stable instances (the existing panel records are the compatibility representation), explicit empty slots, nested Layout ownership, atomic move/reorder/swap/split/remove operations and migration. Test invariants and recovery.
3. Render backing geometry, real Layout children, slot controls and a searchable definition/instance browser. Keep one command/history/storage boundary.
4. Use one dnd-kit coordinator with dedicated 400 ms handles and cross-container keyboard targets. Preview validated destination geometry; use Motion for position/reflow, never duplicate live content.
5. Preserve mounted presentations across transfers, verify browser interactions/responsive/reduced-motion behavior, consolidate obsolete code and update current contracts.

## Model decisions

- `DockLayout.panels` remains the instance table during migration. A panel is a presentation of that instance; `kind` and `widget` resolve a definition. Configuration belongs to that stable ID, not its current parent.
- Nested containers use an owned node in the same document and the same node/command vocabulary. Ownership participates in placement validation, traversal, cycle detection and recovery; no second layout store.
- Empty stack nodes explicitly retain slots. Grid remains an ordering group for legacy dashboards; split ratios determine resizable geometry. No persisted CSS column coordinates.
- Required home/navigation/browser instances have explicit host restrictions. Move does not clone, swap validates both directions, rejected/cancelled operations retain the original document. Container removal promotes children to the dashboard and is one undoable operation; content deletion remains separate.
- Built-in metadata is app-owned renderer information, not a new Loop Kit capability API. Loop Kit owns scoped service lifecycle, with cooperative cancellation; existing Component enforcement and artifact identity stay intact.
- Stable mounted content is separate from slot DOM. Inactive tab/carousel children remain mounted but hidden/inert; moving changes presentation bounds without restarting iframe or service state.
- dnd-kit handles cross-surface collision/keyboard input. The local Stealth sortable-grid and drop-target each own another coordinator, so they are references, not additional gesture engines. Stealth resizable panels/tabs and Motion remain view primitives.

## Verification record

Stages and browser evidence are recorded here as they complete. The checkout remains at `unit-workspace` while Codex and the Bun watcher hold active paths. Final handoff includes rename/reopen commands.

Stage 1: product/package renamed; compatibility strings retained. Typecheck and standalone build pass. Built-in browser reload shows Station and the pre-existing workspace, source unit and widget IDs.

Stage 2: v4 dock migration, owned Layout subtrees, persistent empty slots, bento backing rows, atomic swap/split/add/remove commands and child promotion are implemented. 33 tests, typecheck and build pass. Browser reload preserves prior IDs and displays migrated split rows. Legacy test corrected to reject the previously removed starter definition.

# Station implementation plan

Baseline: `46e9a56`, branch `station-overhaul`. This historical layout plan preceded the asset terminology change; broader asset architecture remains exploratory.

1. Rename product/package and preserve all storage, asset, WIT, capability and artifact identities. Verify existing workspace loading.
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

Stage 1: product/package renamed; compatibility strings retained. Typecheck and standalone build pass. Built-in browser reload shows Station and the pre-existing workspace, source asset and widget IDs.

Stage 2: v4 dock migration, owned Layout subtrees, persistent empty slots, bento backing rows, atomic swap/split/add/remove commands and child promotion are implemented. 33 tests, typecheck and build pass. Browser reload preserves prior IDs and displays migrated split rows. Legacy test corrected to reject the previously removed starter definition.

Stage 3: shared definition browser, real Layout children, asymmetric backing rows, dedicated 400 ms handles, cross-container keyboard navigation, transient full-slot previews and persistent presentation DOM are implemented. Typecheck/build and 36 model/runtime tests pass. Browser verified definition search and child creation, cycle rejection, early release/tolerance cancellation, keyboard pickup/Escape, unequal-slot swap/undo and pointer/keyboard resizing with retained divider focus. Broader transfer, iframe and breakpoint checks follow in the final stage.

Stage 4: definition/provider/renderer metadata now includes authored web and additional editor views. Source synchronization between editor instances avoids duplicate revisions, and content deletion removes all views. Inactive child keyboard reorder/transfer, pointer transfers into/out of Layout tabs, slot split/remove/undo/redo, normalized pointer/keyboard resize, floating transfer/reposition/history, iframe counter continuity and editor section/source retention passed browser checks. Reload retains IDs, owned subtrees, geometry, presentation mode and ordering; session history/visibility intentionally reset. An authored verification counter and real Clock/Snake children demonstrate composition; temporary editor and empty test slots were removed, and the initial 60/40 ratio restored.

Mouse and pen hold/cancel passed in the built-in browser; touch hold/cancel passed in Edge because the built-in browser does not expose touch dispatch. Keyboard targets are explicitly selected within the same coordinator, including tab insertion boundaries and readable rejected targets. Native horizontal wheel browsing changes real carousel children without starting a dock drag. Game arrows and authored iframe buttons remain usable. Light/dark, 375/768/1024/1440 widths and reduced motion were checked; no page-wide horizontal overflow was observed. Mobile navigation, clipped target rejection, carousel resize alignment, management focus and presentation layer stacking were corrected during these checks.

Final checks: 39 tests, typecheck and standalone build. `build:component` also passed a real pinned P3 build/inspection/invocation: 98,535 bytes, SHA-256 `3066f97957e7c77f8415c848ba686cb7205991bd4a71375a3d12d8676bded199`, output `Hello, World!`. This verifies the local sample source, not an automatic rebuild of older browser-stored asset source. Storage keys, source/grant/build boundaries, serialized IDs and artifact contracts are retained.

## UI refinement follow-up

Empty slots use tooltip icon actions revealed by hover/focus, with removal at the top right and always-visible touch controls. Widget headings and tab titles replace grip icons as the deliberate 400 ms pickup targets. Pickup highlights the widget; the inspector's optional wiggle experiment lasts only during movement and respects reduced motion. The add-slot area has idle, hover/focus and active-drag states; Motion expands its round plus into a destination without a persistent drop hint.

The docking inspector is now a catalog widget with ordinary placement, a native disclosure tree of surfaces/slots/owned children/floats, animated lucide-animated visibility icons, and locally owned Stealth switches for shared session diagnostics and wiggle. A tooltip toolbar icon and command palette focus the existing inspector or create one. No second placement or gesture system was introduced.

Verification: early heading release, full hold, Escape, keyboard pickup/navigation/commit/undo, inactive tab pickup, disclosure persistence during switch changes, live diagnostics on/off, icon visibility actions, opt-in wiggle and reduced-motion suppression passed in the built-in browser. Hover/focus tooltips and top-right slot removal geometry were checked. Layouts at 375, 768, 1024 and 1440 px and both themes were checked. The Bun watcher was restarted after its stale new-file alias cache; the compiled build resolved all imports normally. Model recovery coverage includes the new inspector definition. All 40 tests, typecheck and build pass. Tooltip icon add/split/remove actions and the round add-slot action were exercised with undo restoring the prior layout; inspector bottom visibility also collapses its backing presentation.

## Remaining bounds and next stage

Host row extents remain 380 px / 480 px on narrow screens; split ratios resize their slots. Independently resizable row extents and floating window size controls need an explicit geometry contract if added. Swap is defined for two occupied single-instance slots; multi-child stacks reorder/join instead. Inactive instances keep their services running; there is no generic provider suspension protocol. Catalog metadata is extensible, but asset/provider installation and marketplace authority remain future work. The next product stage is the asset overhaul; no asset model, remote repository or deployment was introduced here.

## Checkout rename / reopen

Keep the checkout at `unit-workspace` during this chat: Codex and the active Bun watcher reference its current path. After reviewing, stop `bun run dev` with Ctrl+C and close this checkout in Codex/other editors. The destination `C:\Users\ijhar\Desktop\station` currently exists as an empty directory. The first command below removes it only if it is still empty; it throws if content has appeared, leaving that content intact.

```powershell
Set-Location C:\Users\ijhar\Desktop
if (Test-Path -LiteralPath C:\Users\ijhar\Desktop\station) { [IO.Directory]::Delete('C:\Users\ijhar\Desktop\station', $false) }
Rename-Item -LiteralPath C:\Users\ijhar\Desktop\unit-workspace -NewName station
```

Reopen `C:\Users\ijhar\Desktop\station` in Codex, keep the `station-overhaul` branch, and run:

```powershell
Set-Location C:\Users\ijhar\Desktop\station
bun run dev
```

Use the same browser origin (`http://localhost:3000/` here) to retain localStorage; `127.0.0.1` has separate browser storage. The external Loop Kit links still point to `C:/src/ilt/loop`; no remote repository rename or creation is involved.

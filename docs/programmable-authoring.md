# Programmable authoring

Mission `STATION-PROGRAMMABLE-AUTHORING-2026-10-20-05`, October 20, 2026.

## Source, instances and execution

| Contract | Meaning and owner |
| --- | --- |
| Asset source | Editable virtual files, stable asset ID and optimistic revision. Source may be invalid while being repaired; it is never discarded because a dependency is unavailable. |
| Definition / prefab | Validated `widget.json`, defaults and bounded child/slot recipes. `defaults.surface` is a Loop semantic element hierarchy with named controller input/action bindings. |
| Variant / fork | Independent source, `origin` identity/revision and `forkDefaults` baseline. Forking copies no grants, builds, running service or activation. |
| Instance | One retained DockLayout panel ID, settings and immutable `definitionSnapshot` (source identity, revision, recipe). Composition children record `compositionOrigin`; local target keys resolve to newly allocated sibling IDs. |
| Defaults / overrides | Defaults are copied at placement. Instance updates reconcile old defaults, live settings and new defaults by leaf. Instance edits and explicit deletions win; arrays are atomic. Reset overrides is an explicit alternative. |
| Script / controller | Controllers expose typed primitive inputs and closed named actions. Structural source cannot call owner dispatch or receive service handles. JSON action scripts retain bounded QuickJS execution and explicit `scripts.run` authority. Portable programs retain external `@loop-kit/scripting`, Polyengine and immutable snapshot execution. |
| Activation / state | Editing, installing, placing and activating are separate. Built-in controller widgets retain their existing lifecycle; program definitions remain stopped until Apply/Start. Geometry does not restart a retained editor/controller. |
| Dependencies / contributions | Asset references retain identity/path even when missing. Installed contributions and program snapshots retain their existing immutable manifest, dependency, capability-binding and activation contracts. A definition recipe installs nothing. |

`core/authored-surface.ts` validates source against the installed `@loop-kit/ui`
registry and typed controller inputs. `core/surface-authoring.ts` validates each
candidate structure edit before commit. There is no authored React, HTML, CSS,
ambient provider reflection or executable host binding. Authorable controls use
the existing trusted rich controls through `PortableSurface`.

`store.dispatchDock` resolves source and captures provenance before the reducer
validates and places the entire composition. Duplicate/missing local targets,
invalid child slots and incompatible renderers reject with the original graph.
Source updates do not patch existing instances. Use **Update from definition**
to preserve overrides or **Reset overrides** to accept all current defaults.
**Update fork defaults** performs the same three-way merge on fork source;
structural child-slot changes remain manually authored, not silently merged.
**Fork or recover snapshot source** recovers deleted/invalid definitions from the
retained instance snapshot into a new independent asset.

## Built-in inventory, least to most host integration

| Built-ins | Custom presentation / host integration | Conversion |
| --- | --- | --- |
| Clock | Low structure; retained scoped Loop clock subscription | Authored date/metric/zone/error hierarchy; existing controller retained |
| Weather | Low structure; stateful location consent and cancellable forecast request | Authored forecast/action/output hierarchy; explicit location action retained |
| Action Button | Low structure; stateful confirmation, exact target actions and scoped JSON script calls | Authored action/error/result hierarchy; trusted button appearance and confirmation retained |
| AI Chat | Rich transcript, composer/model controls; secure conversation/task/provider controller | First slice: authored empty-conversation presentation. Transcript, provider and grant UI remain trusted controls |
| Snake | Game canvas, input capture and persistent high score | Existing rich host control |
| Data view | Shared source revisions, rich record controls and provider policy | Existing host renderer; shared property/reference editors retained |
| Widget list, stack | Real child instances and target references | Existing DockLayout composition; authored prefab hierarchy |
| Widget editor | Selection/instance inspection | Existing dockable editor, shared Inspector |
| Asset browser | Capability catalog, groups, selection, references and editor routing | Existing rich host collection; virtual icon source group added |
| Navigation | Search, pins, workspace switching and routed targets | Existing extracted navigation controller / authored configuration |
| IDE | Retained editor sessions, workers and independently movable source panes | Existing rich EditorWorkspace |
| Programmable widget | Source/compiler/immutable snapshot/explicit capability wiring | Existing scripting/runtime path |
| Capability inspector, docking inspector | Host diagnostics, grants and real placement selection | Trusted host tools |
| Browser tab, web browser | Granted browser lifecycle and native content geometry | Trusted native adapter / authored child composition |
| Desk settings | Workspace, package, permission and service controls | Trusted owner controls |
| Main surface, app shell, desktop shell | Protected root surfaces and retained native presentation | Existing single DockLayout authority |

The old Clock/Weather/Action Button markup and illustrative Clock/Weather preview
branches were replaced by their source hierarchies. Widget IDs, configuration,
persistence, toolbar membership and docking identity remain compatible. These
controller adapters are reusable host contracts, not a React renderer per fork.
The remaining AI Chat presentation migration is gradual and retains secure access.

## Editors and references

Semantic definitions use a shared hierarchy / responsive inert preview / Inspector
workbench. Element descriptions supply typed controls and child-slot constraints.
Selection, keyboard parent moves and drag/drop operate on stable source keys.
The element catalog uses `CollectionSource`; `CollectionView` supplies shared
tree/list/grid projections. Composition recipes retain real child/slot editing,
now with a selection hierarchy and responsive preview width controls.

All ordinary editors can switch **Compact**, **Expand editor**, **Open as tab**.
Compact anchors an existing floating panel beside the invoking property; Expand
uses the existing focus dialog; tab docking retains the same panel/session/iframe.
No second editor store or geometry override is introduced. Editor choice remains
independent, with the selected and compatible editors in **Open with**.

Theme icon defaults are explicit read-only `builtin:icon:<name>` SVG assets,
generated deterministically from the public Station icon catalog by
`apps/station/scripts/generate-builtin-icons.ts`. Themes select default or authored
asset identities through the existing picker. The icon grid shows larger previews,
names and reference state, **Restore default**, **Fork and edit**, and **Edit inline**.
Forking a built-in opens its ordinary SVG editor through the shared presentations.
Missing/invalid references preserve source and use the trusted fallback glyph.

The JSON script property supports compatible reference selection, creation,
forking, opening, input/output/effect disclosure, an expandable source editor and
explicit source saving. Saving does not execute. Markdown properties add an inert
preview as text is authored. Existing instance/source permissions still apply.

Asset Browser retains grouping, keyboard selection, search/filter, source variants,
drag/drop and configurable opening. Icons form a read-only Built-in subgroup.
Move/focus its existing panel for compact or full-size use; old desks are not reset.

## SVG recovery and evidence

Reproduced in the real browser: loading a persisted invalid initial SVG disabled
both drawing tools and Reload saved source. Repairing source could not recover
the canvas because readiness was set only after successful validation. Transport
readiness and loaded-source state are now independent; the frame acknowledges
successful loads. Reload remains enabled after invalid initial source, drawing
waits for the load acknowledgement, and stale saved source disables Apply.
The actual DOM regression test covers invalid initial source, repair/reload,
acknowledgement and stale drawing rejection. Export normalization rejects malformed
XML before stripping only inert SVG-Edit annotations. The opaque frame/CSP and
bounded static SVG validation remain intact.

The SVG viewport no longer measures its own scrollable canvas. Its fixed,
contained holder uses a block SVG root; ResizeObserver watches the document
viewport, batches writes into animation frames and skips identical geometry.
Hidden/invalid dimensions do not refit, while loading a new document explicitly
forces a fit. A regression sends 100 duplicate resize notifications and covers
hidden frames, invalid document dimensions and subsequent source/viewport changes.
This removes the scrollbar/resize feedback path associated with flickering.

## Desk and sizing follow-up

Switch desk and Configure desk open a master workspace overview. `DeskScene` captures the entire painted app shell through a named View Transition, scales it into a desk window and keeps it above the live inert scene until return or selection. The overview supplies the desk carousel and root settings; unsupported environments use an inert layout projection. The live docking graph, controller scopes and editor instances remain mounted. Keyboard and reduced-motion paths skip movement.

Tab handles use compact metadata ghosts. Widget headings keep the existing
physical pickup. Drag commits retain a vacated slot for a 500 ms refill window;
refill, another drag, explicit opt-out or unmount cancels cleanup. Intentionally
empty source slots remain. The final removal validates the latest graph through
the existing reducer. Slot settings persist `autoClose`; timers are not saved.
Cleanup is a separate undoable layout command, so two undo operations restore
both the cleanup and its preceding move. Slot collision physics and whole-slot
pickup are not implemented by this change.

Instance `contentSizing` is a validated serializable definition default and
override: grow to fill, scroll natural overflow, or clip at the slot boundary.
It changes the retained frame's content policy without replacing slot geometry.

## Verification, October 21, 2026

- `bun run typecheck` and `bun run build` passed after the final source edits.
  The browser build contains 1,579 modules. No Rust/WIT changes were made.
- `bun run repo check` passed for 10 packages with the existing 61 reviewed
  exceptions. `repo affected` reports the broader pre-existing dirty workspace;
  no files from that work were reset. `bun run repo verify @station/app` passed
  its 248 tests. The full tooling/root/Station test run passed **281 tests**,
  2,247 assertions, 60 files. Logs live under `outputs/programmable-authoring-*`.
- Browser target: isolated `http://127.0.0.1:3055`, control endpoint disabled.
  Chrome connection was unavailable in the earlier run; the built-in browser
  completed the interactions. A fresh production, non-HMR tab has no warning or
  error console entries after the final transition cancellation fix.
- Three converted controllers render through their authored sources. The JSON
  script action returned its real calculation result. Definition source edits
  remained inert until explicit instance update; instance identity survived.
  Serialization, permission denial, missing-source recovery, atomic remapping,
  override reconciliation and invalid composition paths have focused regressions.
- Real SVG import/export retained inherited stroke/fill attributes. Invalid
  initial source could be repaired and reloaded; stale saved source disabled
  Apply until reload. Compact → expanded → docked presentation retained the
  selected Ellipse tool and mounted editor. Canvas scroll dimensions matched its
  viewport through narrow and middle resizes. No resize-loop diagnostic appeared.
- Observed CSS widths included 315/376 px, 645 px and desktop 1,075 px, with no
  horizontal document overflow. Requested browser viewport sizes differ from
  observed CSS sizes on this host; the observed measurements are the evidence.
  At 376 px the overview body scrolled while its Return action stayed reachable.
- An actual keyboard tab drag showed the compact ghost, joined the clock into
  another slot, retained its empty origin immediately after drop and removed it
  after the grace period. The clock's identity remained; two Undo operations
  restored its original slot. Fake-timer tests also cover refill/drag cancellation,
  source-empty preservation, opt-out, denial and serialization.
- A separate Desktop test desk changed root types and switched back to Main
  desk without discarding its existing authored assets, instance IDs or editor
  tabs. Light/dark default tokens resolved to background/foreground
  `251,251,250 / 21,21,21` and `13,13,13 / 237,237,237`, respectively. Appearance
  was restored after checking. Authored theme references retain their own palette.
- [ArtCraft investigation](artcraft-integration.md) records the real unmodified
  VectorCraft iframe import/export and command proof, with no Station credentials.
  That earlier probe is separate from the subsequently implemented editor route.

Evidence images: `outputs/station-desk-overview.png` and
`outputs/vectorcraft-web-command.png`. Test desks/assets remain confined to the
isolated browser origin. The normal installed canary and native profiles were
not touched. Installed-native rendering, paid AI streaming, actual location
consent and pointer/touch drag gestures remain separate acceptance scopes; no
such claim follows from the keyboard, unit or web tests. The ArtCraft native
launcher and Boxy adapter remain proposed. See the current VectorCraft integration contract.

The sidebar and Data view ownership contracts are documented in [Assets, instances, services and persistence](state-and-assets.md).

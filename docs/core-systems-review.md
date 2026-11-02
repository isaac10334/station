# Core systems and adoption

Source/docs review: October 30, 2026. This is the adoption map. Read
[state and assets](state-and-assets.md) for vocabulary and [architecture](architecture.md)
for code ownership. Use the [engineering plan](engineering-plan.md) for selected work.

## Current implementation and gaps

| System | Implemented | Remaining gap |
| --- | --- | --- |
| Assets | Stable IDs/revisions, independent references, source sharing and forks | Typed references/bindings do not form a general dependency/property engine |
| Widgets/docking | One placement graph, retained instances, owned slots, definitions, windows, peeks and modal focus | General overlay layers, passthrough annotation and cursor/hold-release gestures |
| Properties | Shared typed editors, rich documents and consumer-scoped asset references with async commits | Binding evaluation, editor selection and compatibility still need consumer-specific wiring |
| Semantic UI | Loop elements/events/actions/icons/references/tokens with trusted Station DOM adapters | Many built-in settings/chrome still hand-compose React |
| Programs/services | Inert drafts, Apply snapshots, explicit instances/bindings, Start/Stop and bounded QuickJS | Some built-ins remain trusted host code; no general reactive expression engine |
| Components | Source/build currency, inspected imports, grants and run-owned workers | General WIT/resource adapters and hostile marketplace confinement |
| Host lifecycle | Typed identities, injected providers, scopes/leases and cleanup | TypeScript and Rust hosts remain separate; raw JS references require provider checks |
| Commands | Schema/effect/resource/revision checks and shared UI/agent operations | Some trusted UI still calls composition-owned helpers |
| Themes | Validated tokens, icons, type/layout/tints and shared host/guest inputs | Compatible presentation recipes and sandboxed custom renderers |
| Accounts/machines | Presence/session revocation and separate workspace agent pairing | Account sync, machine enrollment and distributed scheduling |
| Independent packages | External SVG editor, public opened-editor CAS, WIT/codegen and checked Git requests | The editor is web TypeScript; the next gate is a real async document Component in two hosts |

Do not invent an adoption percentage. Inspect real consumers. Shared entrypoints
include `core/property-editors.ts`, `ui/components/ui/property-editor.tsx` and
`ui/components/ui/asset-reference-picker.tsx`; workspace imports retain a small
compatibility export. Caller-owned commits still validate current resources.

## Selected next work

Loop's local [documentation index](C:/src/ilt/loop/docs/README.md) routes the
development alpha: a new async document-resource profile across browser and native hosts,
then safe generation replacement and bounded cloud/developer tooling. Its gates
start with reviewed source baselines. Existing Rust/TS host paths and the frozen
Station dependency set remain separate until the replacement passes acceptance.

The [independent package proof](independent-package-proof.md) already establishes
one external editor and a fresh Rust cloud build/run. Repeating the old task
“extract one SVG editor” would miss the remaining runtime/resource boundary.

## Portable widget, dock and property extraction

The user wants shared application mechanisms in Loop. Extract through public
contracts with an independent consumer, while Station keeps product choices and
its persisted workspace. The boundary is the responsibility, not the current file
location or a rule that docking must stay in this repository.

| Candidate mechanism | Station adaptation to keep |
| --- | --- |
| Instance/slot identity and ownership, placement validation/reduction | Desk roots, required panels, saved documents/migrations and product placement policy |
| Retained surface lifetime, focus/input and presentation descriptions | React/native measurement, window masking and platform focus behavior |
| Property types, compatible references, drafts and commit outcomes | Asset resolution, source formats, editor selection and command authorization |
| Shared editor-session/CAS and inspection contracts | Opened-asset policy, source fallback and consent presentation |

Start from `core/docking.ts`, `widget-actions.ts`, `widget-definitions.ts`,
`core/property-editors.ts` and their existing adapters. Prove state/revision
compatibility before replacing the current owner. Move pure mechanisms without
copying Station's singleton store or native authority into Loop. Keep one live
placement graph throughout migration. Widget slots place retained instances;
semantic element children describe one surface. Preserve that distinction.

Design decisions to settle for extraction: the minimum portable layout operations;
which policies remain injected callbacks versus serializable descriptors; reference
compatibility and missing/cyclic dependencies; draft/conflict ownership; and native
focus/occlusion guarantees. A different renderer may reject an unsupported profile.

## Creative workstation direction (2026-10-27)

Updated after the October 28 package proof. These are candidate follow-ups; the
engineering plan selects implementation scope.

| Goal | Existing seam | Next proof |
| --- | --- | --- |
| External content | Package source import/export and immutable installation | Bounded HTTPS fetch with origin/revision, digest/size, redirect/CORS/cancel behavior; feed the same review route |
| Forkable official editors | Independent SVG editor and pinned VectorCraft release | Real WIT document operation, explicit update/revocation and source-editor recovery |
| Rich-text editor contribution | Shared Notes/Markdown/inline editor | Embeddable session contract retaining revision, selection, draft and conflict semantics |
| Agent authoring | Scoped command tools and reviewed drafts | One agent edits/tests a draft and returns source/build/invocation evidence through existing policy |
| Theme presentation | Tokens, semantic catalog and authored surfaces | One compatible recipe reference with checked input/action/accessibility slots and fallback |
| Prefab overrides | Three-way leaf reconciliation and explicit source upgrades | One recipe-property update; child seeds remain copies, not live inheritance |
| Morphing | Retained instances and compact/focus presentations | One editor changes presentation with unchanged identity, draft and history |
| Widget registry | Definition discovery and source inspection | Include contextual/non-creatable entries and actual installation/compatibility state |
| Relational data | Stable source assets and independent views | Collection/record identity, declared relations, bounded traversal and reactive changes |
| Connected machines | Account/session observations | Enrolled identity and explicit resource grants; presence is not machine attestation |

Use bounded source bundles first. A URL/Git ref locates bytes; it does not establish
package identity, compatibility or authority. Pin resolved dependencies and review
updates as new snapshots. A registry may index those packages later. Official
content should use the same import/prepare/install path as third-party content.
Starter manifests become user configuration after creation; updates do not silently
reset saved work.

For themes, preserve activation, disabled/busy, accessible names, focus and hit
areas when selecting a presentation recipe. Same-origin executable renderer
replacement changes trust; selecting tokens does not authorize it. For morphing,
keep runtime/editor state and let the host measure available size. Define fallback
and suspension policies rather than retaining all hidden work indefinitely.

Recovery needs a host-owned entrypoint that can disable failing contributions,
restore a known shell and open raw source. Desk controls can stay removable; their
one-time placement marker prevents respawning. A shortcut can supplement recovery
after editor/game conflict tests, but cannot be its only discoverable route.

## Separate investigations

- Overlay layers need focus/dismissal, z-order, pointer ownership, passthrough,
  native masking and lifetime contracts before an annotation widget or cursor menu.
- Relational views need bounded traversal and stable record selection. Visual
  containment must not imply moving the related source or recursive deletion.
- Component DOM/network adapters retain independent [transport gates](explorations/render-transports-and-agents.md).
  Iroh provides connectivity; identity, grants and synchronization remain policy.
- GPU/drawing needs allocation/submission budgets, resize, device loss and cleanup.
  See [workspace surfaces](explorations/surface-system.md#source-aware-editing-drawing-and-gpu).
- A compiler replacement must pass curated TS/TSX/portable JSX, CSS, diagnostics,
  cancellation and forbidden-import fixtures. Compare cold/warm costs before
  changing engines; do not add ambient npm/network resolution as a shortcut.
- Loop's WIT codegen and TS7.1 content mapper pass real compiler checks. Precise
  WIT navigation and graphical editor completion still need their own acceptance.
  Station's browser TypeScript worker remains on its current JavaScript API.

## Static export and publishing

A future publisher should accept a reviewed source revision, exact output hashes
and a selected destination. Keep source licenses, supplied scene assets, local
fonts, responsive/static fallbacks and download links in review. Publishing needs
host-owned credentials and its own rollback/authorization path; editing an asset
or preparing a package cannot publish a website. No publisher is implemented by
this documentation cleanup.

## Dated evidence

| Scope | Evidence and limits |
| --- | --- |
| October 25 interaction | Production Chrome at 3067 verified contextual menus, retained quick-access inspector, Desk control movement/reload and light/dark rail colors. Screenshots: `outputs/widget-quick-access.jpg`, `widget-tabs-dark.jpg`, `widget-interactions-light.jpg`. Native/touch acceptance remained open. |
| October 26 references | Production Chrome at 3068 verified note source selection/create/clear/reload, root-shell changes retaining children and shortcut definitions. 278 package tests/2372 assertions and root typecheck passed. DOM tests covered denial, incompatible drops and duplicate submission. `outputs/property-reference-acceptance.jpg`. |
| October 27 catalog | Definition source inspection, compatible source forks and foreign-path drag denial. See the dated [engineering evidence](engineering-plan.md#october-27-investigation-and-bounded-follow-up). |
| October 28 external editor and compiler | Same compiled editor document in Station/standalone hosts, opened-editor CAS/denial, actual WIT/TS errors and changed Rust cloud bytes invoked through the fixed worker. See [Independent package proof](independent-package-proof.md). |

These records describe their dated targets. They do not establish later changes,
physical touch behavior, an installed-native update transaction or a general
marketplace/runtime boundary. Keep further acceptance beside the owning feature.

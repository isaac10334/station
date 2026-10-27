# Core systems and adoption

Source review: October 27, 2026. This is the current gap map, not a replacement
architecture or a claim that every built-in is runtime-authored. Start with
[state and vocabulary](state-and-assets.md) and [architecture](architecture.md).

## What is real, and where adoption stops

| System | Implemented | Remaining adoption or capability gap |
| --- | --- | --- |
| Assets | Stable IDs, revisions, independent references, source sharing, definition forks | Host settings still sometimes store local primitives where compatible typed references should be shared |
| Widget/dock UI | One `DockLayout`, retained instances, owned slots, definitions/snapshots, windows, peeks, modal focus, inspection and flip sides | General ordered overlay layers, passthrough annotation tools and cursor/hold-release gestures are not implemented |
| Properties | Shared typed editors for primitive/JSON/document values and consumer-scoped asset references, including async commit errors | Asset fields need explicit compatible options; bindings and source presentation do not yet form a universal engine |
| Semantic UI | Loop's serializable elements/events/actions/icons/references/tokens; trusted Station DOM adapters | Most built-in settings/chrome still hand-compose React, rather than consume authored property/surface descriptions |
| Programs and scripting | Explicit drafts/Apply, activation snapshots, instances, service wiring and lifecycle; bounded QuickJS formula/script execution | Not every built-in is forkable authored behavior; typed bindings are not a general expression/reactivity engine |
| WASM  Components | Source/build currency, inspected imports, explicit grants and run-owned workers | Rendering and native/remote engine adapters have independent gates; no claim of hostile marketplace confinement |
| Capabilities/host | Typed contract identities, injected providers, scopes, leases and cleanup | JS lifecycle is not permission enforcement; the TypeScript and Rust hosts are separate implementation paths |
| Commands | Schema/effect/resource/revision checks, cancellation and shared UI/agent paths | Some trusted UI still reaches composition-owned helpers; shrink that debt rather than create agent bypasses |
| Themes | Editable validated tokens, layout/type/tints, shared host/guest variables | Theme adoption does not make all React structure schema-driven |
| Accounts/machines | Account presence and session revocation; explicit workspace agent pairing | Authentication is not a workspace grant; distributed agent scheduling/artifact transport is not implemented |

There is no meaningful audited percentage of adoption. The evidence is mixed:
Data view cells, metadata, shortcuts, source editors and portable program surfaces
reuse common contracts; many widget/settings fields still assemble their own
control/commit logic. `core/property-editors.ts`, `ui/components/ui/property-editor.tsx`
and `ui/components/workspace/asset-reference-picker.tsx` are the relevant seams.

## This interaction slice

- Widget content no longer has a blanket right-click handler. Native text/editor
  menus and widget-owned contextual actions keep their meaning. The ellipsis
  button owns full widget settings.
- Table chrome uses horizontal hierarchy and a separated toolbar/header. Shared
  dock rails use the page surface for active tabs in light and dark themes.
- Desk controls become an ordinary compact floating widget. Placement, dragging,
  instance inspection, hiding/removal and persistence use the existing graph.
  A one-time desk reference prevents removed controls from respawning on reload.
- Shortcut definitions already targeted widget-definition assets. They now select
  bounded quick-access or full focus presentation over the same retained instance.
  New workspace defaults include `Mod+Alt+I` for the Widget inspector. Existing
  saved bindings remain unchanged; add a widget binding in Keyboard shortcuts.
- Root shell selection in desk settings, overview and widget settings uses a compatible definition
  asset reference, with source opening and workspace-bounded drop. Changing shell
  presentation preserves current children; applying prefab children is separate.

Compact overlay windows are a presentation of existing floating placements, not a
new general layer document. No interaction passthrough or security authority is
inferred from a visual layer. Native webviews still require host masking and
geometry coordination; DOM z-index cannot cover a separate native surface.

## Next bounded slices

October 26 follow-up: `PropertyEditor.reference` now supplies shared asset editing
for root shells, shortcut widgets/capture inbox and note sources. The shared picker
awaits commits, reports denials and prevents duplicate submissions. Read-only and
required intent share the property contract; existing IDs/storage and authorized
commit owners are preserved. [State and vocabulary](state-and-assets.md) owns the
reference context and creation/commit boundary. This closes the display-only gap
for those consumers, not the entire property engine.

1. Generalize the shared property reference context: compatibility, source/editor
   selection, bounded typed bindings, drafts/conflicts and consumer-owned commits.
   Migrate widget/settings fields against real consumers, not a new parallel form store.
2. Define overlay input/lifetime contracts before ordered layers: stable instances,
   focus/dismissal, z-order, pointer ownership, passthrough, native masking and
   authorization. Then prototype one annotation widget and one cursor menu.
3. Add source-based control configuration for remaining shell chrome. Keep explicit
   definition upgrades and stateful edit modes alongside WYSIWYG/morphing views.
4. Investigate Component DOM/network adapters independently. See the linked
   [research and gates](explorations/render-transports-and-agents.md).

No large renderer, capability, persistence or agent-harness redesign is decided by
this slice. [Engineering plan](engineering-plan.md) owns verification/integration;
[widget system](widget-system.md), [shortcuts](shortcuts-and-capture.md),
[programmable authoring](programmable-authoring.md) and [agent control](agent-control.md)
own their respective behavior contracts.

## Creative workstation direction (2026-10-27)

The ideas below are investigation results and candidate slices, not approval for
one coordinated rewrite. The priority is a useful widget/authoring loop, followed
by one independently owned installable editor. Keep the existing command, dock,
permission and persistence owners while proving each extension point.

| Goal | Current source evidence | Missing proof / bounded next step |
| --- | --- | --- |
| External content | `core/package-assets.ts` imports/exports source bundles; `services/package-runtime.ts` prepares immutable installs and sandboxed editor sessions | Fetch a bounded HTTPS bundle into the existing import/review flow, with resolved origin/revision, digest and byte-size receipt; no remote execution on import |
| Forkable official editors | Package forks and editor contributions exist; VectorCraft is already an independently owned pinned release | Extract one SVG editor into its own repo, install through the same public path as third-party content, fork/edit/reinstall and recover to source editing |
| Rich text outside the host | One shared editor serves Notes, assets and inline properties | Full editor replacement fits today's contribution role; inline replacement needs an embeddable editor-session/presentation contract preserving revision, selection, draft and conflict semantics |
| Agent inside Station | AI task tools use the scoped command runtime; live CLI/MCP pairing and isolated headless profiles exist | One agent creates a draft, edits, tests, requests activation and returns verified artifacts; headless orchestration and parallel merge policy remain separate |
| Headless scripting | The application factory can be created without DOM; independent Node/V8 scripting proof exists | Inject an execution provider and resource transport. Bun cannot run the current multi-memory P3 engine; a headless store is not a complete portable-program harness |
| Theme presentation recipes | Validated theme data, semantic elements/actions and authored surfaces exist | One typed theme role referencing a presentation recipe, with checked input/action/accessibility slots and a fallback; no arbitrary React renderer registration |
| Prefab overrides | `core/definition-snapshot.ts` already performs three-way leaf reconciliation; source upgrades are explicit | Reuse that behavior for one recipe property. Child seeds are embedded copies today; live inherited reference graphs, cycles and propagation are not implemented |
| Morphing widgets | Retained instances, quick-access/focus presentation and compact-to-dialog editors exist | One image or editor instance with compact/regular variants and host-measured sizing; prove unchanged identity/draft/history across transitions |
| Widget registry and composition | The creation picker resolves built-in, authored and installed definitions; many built-ins still dispatch to React | Expose source inspection first. A complete registry must include contextual/non-creatable entries and actual compatibility/installation state, not just the menu's filtered list |
| Relational Data views | Stable source assets, independent views and synchronous provider snapshots exist | Add stable collection/record identity, declared relations, bounded traversal and reactive changes before per-node view overrides |
| Machines | Account presence, device sessions, ping and revocation exist | Show another authenticated session's presence first; a session observation is not attested machine identity or filesystem/terminal authority |

### Distribution and development

Treat a locator as a way to obtain bytes, not package identity or permission.
Start with HTTPS source bundles; GitHub is an adapter resolving a URL/ref to
immutable reviewed bytes. Keep transport, package format, dependency compatibility,
provenance and authorization distinct. CORS, redirects, cancellation, bounded
downloads, digest checking and unavailable origins need explicit behavior.
Updates produce a new reviewed snapshot; a moving branch must not silently replace
installed code. A catalog/marketplace can index the same packages later without
becoming the only host or a prerequisite for installation.

Develop official content in independent repositories against public SDK/contracts.
A local source adapter should feed the same preparation/review/install route as
remote content. Versioned development installs may refresh explicitly; privileged
host imports or bypassed grants would invalidate the test. Default setups can be
reviewed starter manifests referencing pinned packages and configuration assets.
Treat their state as owned user configuration after creation, rather than silently
overwriting it on updates. Keep opt-in content separate from a minimal working
recovery experience.

### Presentation, sizing and recovery

A semantic element specifies behavior, properties, actions and accessibility;
a presentation recipe specifies composition. A theme may eventually select a
compatible recipe by typed asset reference. A glass-button recipe must preserve
keyboard activation, disabled/busy behavior, focus, naming and hit testing.
Arbitrary same-origin React replacement would change execution trust. A different
implementation can instead live behind a sandbox contribution or a reviewed host
renderer contract; changing colors does not establish that boundary.

For morphing, preserve the content/runtime instance and select its presentation
from available dimensions. Start with minimum/preferred sizes and explicit compact
variants. The host decides whether to reject a placement or use a disclosed
fallback; a child cannot deadlock layout. An image shown as a list row is normally
a reference/representation of the image, not a requirement to move its entire
running widget into every list. Start without live inheritance or physics.

Smoothness needs measured drag/resize/frame budgets and explicit retention or
suspension policy. Retaining every hidden editor and service indefinitely is not
a performance strategy. Ordered layers need input ownership, focus, hit testing,
passthrough and native-webview masking before a physics or inspection lens.
Keep view transforms separate from saved placement and authorization.

Desk controls are already removable in this checkout; `core/desks.ts` prevents
their one-time default placement from respawning after removal. An older installed
canary may differ. Moving desk overview into navigation can reuse the existing
overview, but recovery must work without that widget or a valid authored shell.
Prefer a host-owned recovery command and fixed entry point that can restore a
known shell, disable failing contributions and open raw source. A triple-Escape
gesture may supplement it after testing editor/game conflicts; it must not be the
only discoverable recovery path. Recovery does not mint guest grants.

### Data, networking and tooling boundaries

For Data views, distinguish containment from relation traversal. A node may expose
an explicit relation such as "Related assets" with its own view override; it must
not look like moving/reparenting stored content. Define cycle/depth/record limits,
stable selection, subscription cleanup and write authority before arbitrary graph
expansion. A deterministic connector script producing a collection/change feed
would prove more than another hardcoded integration table.

Iroh is a candidate connectivity provider, not the identity, collection-sync or
workspace-authorization model. Existing presence can deliver the mild starter
without a transport replacement. Its [official binding overview](https://www.iroh.computer/blog/iroh-language-support)
describes the platform paths; browser/native behavior needs its own acceptance.
Filesystem access, terminal execution, wake-on-LAN and VM lifecycle remain separate
capabilities with explicit resource grants, revocation and disconnect semantics.

Rolldown is a plausible compiler-provider experiment. Its
[official introduction](https://rolldown.rs/guide/introduction) describes a Wasm
build, but that is not a drop-in replacement for Station's curated virtual files,
resource embedding, workers and sandbox policies. Run the same TS/TSX/portable JSX,
CSS, diagnostics, cancellation and forbidden-import fixtures, then compare cold
startup, memory and repeated builds in browser/WebView2 before switching engines.
Do not introduce an ambient remote/npm resolver as part of that change.

TypeScript compiler speed, editor intelligence and schema-derived declarations are
different concerns. `services/typescript-worker.ts` and repository policy tooling
consume the JavaScript TypeScript API today. Microsoft's
[native-port API notes](https://devblogs.microsoft.com/typescript/progress-on-typescript-7-december-2025/#emit-watch-and-api)
explain why a native compiler upgrade is not automatically a browser-language-service
upgrade. No reviewed evidence establishes the proposed "type providers" feature;
generate declarations from checked Station contracts as a separate first step.
Keep a TypeScript-version upgrade independent of a bundler and renderer migration.

## Verification evidence for this slice

Chrome, built artifact at `http://127.0.0.1:3067/`, no HMR: table-cell right-click
left widget settings closed; Ctrl+Alt+I opened one retained inspector in a
720x520 quick-access modal; repeated invocation retained its instance ID. Widget
inspector picking exited modal focus, selected References on the desk and exposed
its instance properties. Desk
controls moved from (16,720) to (352,240), persisted after reload, and subsequently
moved to (500,8). Shared active-tab and toolbar computed colors matched in dark
(`rgb(13,13,13)`) and light (`rgb(251,251,250)`) application appearance.
Screenshots: `outputs/widget-quick-access.jpg`, `outputs/widget-tabs-dark.jpg`,
`outputs/widget-interactions-light.jpg`. Console warnings/errors were absent.
Logs: `outputs/interaction-verify.log`, `interaction-root-typecheck.log`,
`interaction-build.log`, `interaction-boundaries.log`. Installed-native and
physical touch-device acceptance remain separate, unperformed gates.

Loop's documentation review also ran its full TypeScript verification: 80 tests,
packed consumers, builds/typechecks and zero architecture violations/exceptions.
Its Rust/native/remote paths were not exercised by that documentation-only change.

October 26 property-reference acceptance: Station package verification passed 278
tests / 2372 assertions, package typecheck/build and root `bun run typecheck`.
Architecture checks passed with the existing 62 reviewed exceptions. Chrome loaded
the production artifact without HMR at the isolated `http://127.0.0.1:3068/`.
Changing a note source, creating/binding a new compatible note, clearing its
reference without deleting the asset, restoring the original reference and reload
all worked. App/Desktop/App shell selection retained desk contents. A shortcut
widget reference to Local time survived reload. Required root/shortcut pickers had
no Clear action. Application warnings/errors were absent; browser-extension
autoconsent warnings are unrelated and excluded. Async denial, foreign/incompatible
drops and duplicate submission were exercised by DOM tests, not inferred from
successful browser selection. Evidence: `outputs/property-reference-acceptance.jpg`,
`outputs/property-reference-verify.log`, `outputs/property-reference-typecheck.log`
and `outputs/property-reference-build.log`. No installed-native acceptance or Loop
runtime changes belong to this slice.

# Station architecture consolidation

Mission `STATION-ARCHITECTURE-CONSOLIDATION-2026-10-20-03`, started October 20, 2026.
One integrating owner; this is the living plan. The package foundation is complete;
its baseline is summarized below and its current workflow is in [Loop Kit dependencies](loop-kit-packages.md).

## Selected independent-package proof, 2026-10-28

The user authorized implementation of one independently developed package, stronger
WIT-backed development contracts and concrete Rust compiler reliability fixes.
One integrating owner coordinated bounded compiler, WIT tooling and independent
editor work. Owned changes preserve existing workspace/WIT IDs, grants, docking,
installed profiles and unrelated edits. No registry publication or remote GitHub
write is part of the acceptance evidence.

Implemented: upstream source/build/change-request contracts and GitHub adapter;
official WIT codegen plus actual TS7.1 content mapper; independent SVG editor source
repository; opened-editor snapshot/CAS methods with denial checks; transactional
Vercel snapshot setup and error/cancellation fixes. See the executable commands,
dated evidence and remaining gates in [Independent package proof](independent-package-proof.md).

## Proposed Loop development alpha, 2026-10-30

The architecture/task pack is owned upstream at
`C:/src/ilt/loop/docs/development-alpha/README.md`. It proposes one real async
document Component across native/browser hosts, safe development replacement,
and bounded cloud, documentation and Station adoption. The October 30 planning
turn changed documentation only. Implementation begins with reviewed baselines
of the current dirty checkouts and a toolchain feasibility gate; do not create
worker worktrees from old HEAD and silently omit current untracked code.

Keep this file as the integrated ledger, upstream specifications as the design
owner, and Loop's engineering plan as its local evidence. Station retains its
permissions, workspace state, desks/docking and product experience. Select one
authored tool for adoption after its upstream runtime gate; no Station rewrite,
account migration, marketplace launch or new desktop product is implied.

## Package foundation baseline (2026-10-19)

Historical evidence, consolidated on 2026-10-27 from the separate package audit.
At the baseline, all four Loop Kit libraries resolved to checked-in
`vendor/loop-kit/*` copies, not upstream links. Build preparation also hardcoded
those paths. The old import guard resolved only relative paths and `@/`; it did
not establish export validity, realpath ownership, cycles or rejection fixtures.
The browser composition singleton had 42 importing files; `application.ts` was
already a composition factory despite its name. These findings motivated the
injected controllers and compiler-graph policy recorded in this plan.

The baseline script review retained distinct server, Component, desktop, site,
agent and release tasks; redundant `build:sdk` aliases were removed. The ordinary
npm dependency graph had no declared cycle. Since October 20, versioned artifacts
replace vendor copies, optional links are reversible, and production rejects links;
see [the dependency workflow](loop-kit-packages.md) for current resolution rules.

Loop's Rust CLI, Wasmtime host, embedded templates, Windows installer and release
assets were active independent implementations, not obsolete TypeScript-host
copies. Their gates belong to Loop's CI. The baseline did not justify deleting
runtime probes or claiming native/browser acceptance. Retained architecture
exceptions and later acceptance results are recorded below; baseline coupling
counts and toolchain versions do not describe the current checkout.

## October 27 investigation and bounded follow-up

Scope: repair dependency resolution after the checkout move, inspect the
creative-workstation direction, improve definition discovery in the creation
picker, and reject foreign source-editor path drags. The
[core-system review](core-systems-review.md#creative-workstation-direction-2026-10-27)
owns the findings and proposed sequence; this work does not approve a renderer,
package-trust, networking or persistence redesign.

Five stale per-workspace dependency directories were relocated to a recovery
folder under Windows Temp, then the frozen hoisted install was repeated. A scan
found zero dependency junctions targeting the prior checkout. No dependency
manifest or lockfile change was needed. One Component test now resolves its
translator resource from the installed package instead of assuming the process
working directory is the repo root; its real-byte rejection assertion is retained.

Verification on 2026-10-27: root typecheck/build and architecture policy passed
(62 existing reviewed exceptions). `repo verify @station/app` passed 285 tests,
2,404 assertions and its package build/typecheck gates. Focused composition,
definition-lifecycle and drag validation: 13 tests / 77 assertions. No Rust/WIT
or Component runtime implementation changed.

Chrome was unavailable. The built-in browser exercised a production-mode server
at the isolated `http://127.0.0.1:3071/`, without HMR, including a fresh final tab.
Keyboard inspection opened the built-in Local time source without creating a
clock instance; the separate creation action made one. The instance and definition
survived reload. Removing Desk controls persisted after reload. Requested viewport
widths 375/768/1024/1440 kept the picker inside the CSS viewport without page
overflow. Warnings/errors were absent. Screenshot:
`outputs/widget-catalog-inspection.jpg`. Foreign editor-path denial is covered by
tests; physical cross-editor/nested drag acceptance and faithful live previews
remain open. The installed canary was not changed or used for acceptance.

Next bounded product proof: an externally owned SVG editor installed through the
existing import/prepare/review path, with immutable provenance and a source-editor
recovery route. Widget sizing/morphing needs an independent one-instance demo;
physics, generic layers, theme renderer replacement and distributed agents are
not bundled into that task.

## Ownership and compatibility

Owned: Station feature controllers/contracts/presentation adapters, application wiring,
AST policy/tooling, regression tests and their documentation. Public dependencies:
Loop Kit capabilities/host/ui/scripting and Station public package exports. No upstream
Loop source copies, identity/storage/WIT changes, grant expansion, second store or
placement model. Existing uncommitted work is preserved. Normal installed canary is
outside the acceptance target. No Rust/Component ABI change is planned.

## Audit and priorities

The reproducible compiler graph census is `bun tooling/responsibility-audit.ts`.
Before evidence: `outputs/architecture-consolidation/before.json`. It inventories every
major source directory, incoming/outgoing edges, subscriptions, browser references,
singleton imports, exceptions and oversized modules. Interpret textual browser counts
as inspection leads, not proof of an illegal effect.

| Area | Responsibility and problem | Priority / locality |
| --- | --- | --- |
| core | model (69 consumers), DockLayout reducer (38), source validation, serialization; model/store orchestration and a 17-module type cycle remain mixed | highest reach, migrate through explicit ports; preserve state/identity |
| command-runtime | authoritative schema/effect/revision/resource policy and operations; application code in core directory | high reach; move owner with imports, preserve registry |
| contracts | capability schemas plus application ports; legacy contracts reference domain types | inward application ports must be classified explicitly |
| services | compiler/network/storage adapters mixed with editor, chat tools, package/program controllers | split concrete feature ownership; shared services only for multi-consumer lifetime |
| providers | capability implementation, compatibility aliases, acquisition-bound cancellation; WorkspaceCapabilityRuntime is misplaced here | extract contract, keep provider registration at composition |
| asset authoring | source-project, routing and package-assets are pure; editor choice branching and source mode mixed into JSX | extract feature projection and typed renderer dispatch |
| widgets | pure definitions, UI icon catalog, renderers, retained dock ownership | isolate scoped clock controller; renderer table separate from instances |
| presentation | 42 files import bootstrap, 30 edges to services, five to providers; chat owns task/review/cancellation | chat + navigation + editor + shell first, reduce exact exceptions |
| adapters | desktop, server/accounts, browser contexts, compiler transports and workers | infrastructure, no authority in transports; preserve native lifecycle |
| composition | application.ts wires host/store/providers; browser composition.ts initializes singleton | keep one session instance; inject selected feature ports at root |

Repeated operation polling and subscription ownership in UI command helpers are
consolidated behind one injected command adapter. Existing installed commands
and capability calls remain distinct: declarations are contributions, bindings are
configuration, acquisitions are scoped handles. No second command registry.

## Internal gates

- [x] Audit all major source directories and capture baseline graph.
- [x] A: layer and public-entrypoint enforcement, actionable errors, negative fixtures.
- [x] B: React-free injected controllers instantiated in regression tests.
- [x] C: chat, navigation, asset editor and scoped runtime widget wired to real views; Chrome scope recorded below.
- [x] D: movement, workspace/desk changes, revocation, cancellation and cleanup tests.
- [ ] E: focused and aggregate tests, typecheck, build, fresh browser interaction;
  installed-native acceptance reported independently.
- [x] F: repeat graph census, document simplifications and declarative UI prerequisites.

## Completion evidence

Aggregate `bun run verify` completed with exit 0 on October 20, 2026:
architecture/import policy, rejection fixtures, package/tooling typechecks,
257 tests / 1,752 assertions, production web build (1,562 modules) and six packed
public consumers/private-import rejection. The required root `bun run typecheck`
also passed. Logs: `outputs/architecture-consolidation/verify.log`. Focused new
controller/binding suite: 11 tests / 53 assertions. Existing program tests prove
shared consumers, stop, subscription cancellation, task/resource intersection and
contract rewiring. No Rust/WIT/Component ABI change; no Component/native claim.

Gate C is source-wired, headlessly tested and now exercised in Chrome as recorded below.
Gate D is checked for automated lifecycle semantics only; actual retained native
movement remains part of E. The original Gate E attempt was **blocked on browser tooling**: in-app Browser
creation timed out; Edge and Chrome each returned `Browser is not available`.
No normal installed canary was launched, updated, stopped or otherwise changed.
No live renderer was discovered or paired, so no live command target is claimed.
Browser/native visual acceptance cannot be inferred from build or unit tests. The subsequent Chrome run below supersedes the browser-tool blocker only.

## Measured simplifications

Baseline and after census plus `metrics.json` live under
`outputs/architecture-consolidation/`; paths are current-run evidence, not release
artifacts. The root context command lists feature READMEs/layers without source.

| Metric | Before | After |
| --- | --- | --- |
| All browser-bootstrap importers, including main | 42 | 38 |
| Ordinary UI bootstrap importers | 41 | 37 |
| Reviewed architecture exceptions | 79 | 61 |
| Module cycle groups | 4 | 2 |
| Core module cycle groups | 1, 17 modules | 0 |
| Inspector/renderer cycle | 1 | 0; separate action contract |
| WorkspaceApp lines | 1,309 | 794 |
| AI Chat JSX adapter lines | 695 | 426 |
| AssetEditor lines | 92 | 58 |
| Duplicate asynchronous command-wait implementations | 2 | 1 subscription owner |
| Authoritative command registries / workspace stores | 1 / 1 | 1 / 1 |
| All resolved import edges | 1,200 | 1,295; splitting mixed imports exposes more explicit type edges |

The changes remove composition imports from chat, shell, dashboard and widget
renderer selection. AI settings/tools/catalog move to a cohesive feature with
injected conversation ownership. Program lifecycle dependencies become mandatory;
compiler/worker/service factories are wired at composition. The command registry
moves out of core. Pure asset/workspace shapes and helper functions are separated
from the persistence/migration store, removing the former core cycle entirely.
Slot identity/schema and resolution ownership are separated without duplicate
algorithms. Typed asset editor and widget renderer maps replace kind ladders;
DockLayout still owns every retained instance. Shell dialogs, creation workflows,
command descriptors and navigation history are independently owned modules.

## Service/provider classification and remaining consolidation

The full source census records every major directory and each module's dependency
reach, size and subscription leads. Current shared service implementations classify
as follows; this is an ownership map, not a proposal to create a service for each file.

| Modules | Actual role / owner |
| --- | --- |
| account-client, agent-control-client, desktop-updates, root-credential, trusted-app-request | Browser/native/network infrastructure and session transport; keep authority outside transports. |
| browser-contexts | Native browser capability transport and disposal, distinct from presentation. |
| web-build, web-build-worker, typescript-worker, worker-client | Compiler/worker infrastructure, shared by concrete authoring consumers. |
| program-activation, program-compiler, program-build-worker, program-engine | Program build/engine infrastructure, now injected into the program controller. |
| quickjs-engine, script-execution, script-worker | Bounded evaluator infrastructure and queue ownership. |
| package-runtime, guest-bridge | Installed contribution application lifecycle plus concrete guest adapters; further split requires a dedicated port migration. |
| editor-session | Authoring controller plus CodeMirror/worker adapters; current shared retained editor remains authoritative. |
| widget-grants, component-grants | Station permission intersection and retained-method checks; intentionally not replaced by host lifetime. |
| capability-inspection, lifecycle-telemetry | Read-only diagnostics projections and shared runtime observation. |
| svg-icons, svg-edit-source | SVG validation/normalization infrastructure; no new validation copy. |
| workspace-sharing | Network connection and source-conflict workflow; separate from account and private layout state. |
| program-acceptance | Acceptance harness, not an application feature service. |

Provider registration remains in application composition. Workspace/AI/Component
providers implement existing public identities; compatibility aliases preserve
exact grants. Named program services use shared Loop Kit registrations and exact
scope bindings. Configured preferences, source-free diagnostics and acquired
handles are distinct; missing/incompatible/stopped exact services never fall back.
No new command operation or authority pathway was added. Installed command
invocation retains existing task/resource restrictions and fail-closed delegation.

## Before declarative UI migration

This mission has delivered a substantial coordinated refactor, **not complete
repository-wide consolidation**. Do not start declarative rendering on the assumption
that the following remaining work has been accepted:

1. Finish injecting the 37 ordinary UI bootstrap consumers listed exactly in
   `after.json`. Highest reach: editor/session/source policy, program authoring,
   package contribution surfaces and permission/agent settings. The now-unused
   editor-workspace singleton import is included in that count; remove it with its
   complete editor dependency migration. Legacy command helper wrappers still wire
   the shared application client from bootstrap; they no longer own polling.
2. Split editor-session and package-runtime concrete adapters from application
   orchestration, then narrow the remaining services/UI exceptions. Two exact
   cycles remain: docking presentation (three modules) and server compiler adapters
   (three). No new cycle exception was authorized.
3. Extract the remaining shell-owned navigation/browser panel adapter registration
   from WorkspaceApp. Built-in widget dispatch and asset editor dispatch are typed
   maps now; the protected shell still contains its specialized panel selection.
4. Chrome now covers chat/catalog/grant/model controls, navigation/history, asset
   editor/source persistence, workspace switching and clock float/dock (see below).
   Paid AI streaming, browser-driven provider stop/revocation, desk switching and
   installed WebView2 movement remain separate acceptance work; automated
   cancellation/revocation tests remain the evidence for those runtime paths.
5. Only then introduce a declarative renderer behind existing controller/view
   contracts, preserving the one DockLayout, revision policy, authority and resource
   ownership. A cohesive `@station/ai` extraction is evaluated in the feature README;
   no independent consumer currently justifies exporting Station task/asset policy.

No tool availability or elapsed time marks these items complete. The web browser
blocker is resolved; broader source consolidation and scoped native/runtime
acceptance remain open.


## Chrome follow-up acceptance, October 20, 2026

Chrome connected through its browser extension after the user restored access.
Target: `http://127.0.0.1:3048/`, title **Station**, a fresh origin-local guest workspace
on a separately launched loopback server in production mode. This exercised the
current source bundle served by Bun, not an installed desktop or the static dist
file. The previous aggregate verification separately built production artifacts.
Control discovery at that exact origin returned HTTP 404 (agent control disabled);
all interactions used visible UI, without paired commands or privileged reflection.
No normal canary or acceptance installation was changed.

Verified through real UI and fresh DOM/screenshot evidence:

- Guest entry and meaningful dashboard/navigation rendering, without a framework
  error overlay. Console warning/error capture remained empty, including after reload.
- Greeting navigation opens the registered editor; Back restores Overview and
  Forward selects the same Greeting editor.
- New asset -> SVG creates **Architecture acceptance SVG**, opens the SVG adapter,
  and exposes shared Files/Code/Problems via Source. A comment typed into CodeMirror
  survived switching to a second workspace, returning and reloading the page.
- Add widgets -> AI chat renders the new conversation adapter. Public model catalog
  search and selection work. Cancelling staged asset-list grants leaves the count
  at zero. Send stays disabled without a key; New chat clears an unsent draft.
  No credentials were entered and no model request was sent.
- Clock floats and docks with owner `widget:clock:legacy-0`; its live time content
  remains visible when the docked row is revealed. Docking appends a row, so an
  initially clipped placeholder is not treated as failed rendering. This proves
  visible movement/identity, not an instrumented proof of no React remount.
- Creating **Architecture acceptance workspace** removes the former chat surface;
  switching back restores the original layout and assets. Both test workspaces
  remain confined to this isolated origin's browser storage.

Evidence: screenshots `station-chrome-source.png` and
`station-chrome-acceptance.png` under
`C:/Users/ijhar/.codex/visualizations/2026/10/20/01a1592e-a81c-7193-b17f-dd84883c4baa/`.
Only this web scope is accepted. Paid/live AI streaming, UI-driven task/provider
revocation and installed-native interaction are not inferred from these controls.

## Selected semantic UI follow-up, October 20

Mission `LOOP-STATION-SEMANTIC-UI-2026-10-20-04` is owned by one integrating owner.
Owned: external Loop ui contracts/tests, Station semantic host adapters, shell
actions/palette controller, source tree/property inspector, package snapshot and
[semantic UI documentation](semantic-ui.md). No Rust/WIT/storage identity, grant
expansion, second command registry/store or native lifecycle changes. Existing
dirty work is preserved. That document owns current acceptance and remaining scope.

## Programmable authoring follow-up, October 21

Mission `STATION-PROGRAMMABLE-AUTHORING-2026-10-20-05` remains one coordinated
refactor. [Programmable authoring](programmable-authoring.md) owns its contracts,
built-in inventory, source/instance reconciliation and acceptance evidence.
The October 21 steering adds SVG viewport stability, an inert desk/root overview,
tab-sized ghosts, cancellable empty-slot cleanup and instance sizing policies.
[ArtCraft integration](artcraft-integration.md) owns the unmodified embedded web
editor, command/session contract, explicit SVG Apply and separate native-launcher
boundary. [Rich text authoring](rich-text-authoring.md) owns note/Markdown assets,
the Notes widget and expandable Inspector properties. No ArtCraft fork, native
launcher or expanded grants are implied.

### Workspace presentation continuation (2026-10-22)

The current authoring pass also owns compact morphing property overlays, a whole-shell desk overview, shared floating window controls, widget-owned sidebar areas and nested/pinnable Data view settings. Page outlines reference note assets independently of Asset browser groups. See [state and assets](state-and-assets.md) for the persistence boundary. Acceptance must include real browser interactions, persisted outline/order settings, single/multiple sidebar rails, exact-revision source editing and reduced/narrow presentations; installed native acceptance remains a separate gate.

### Default desk presentation (2026-10-25)

October 26 property-reference slice: one integrating owner extends the shared
property editor and store-free reference picker, migrating root/shortcut/note
consumers. Owned files are `core/property-editors.ts`, those shared controls,
their consumer adapters/tests and linked owner docs. No new persistence store,
wire identity, Loop package, grant or execution change. Acceptance covers required/
read-only references, incompatible/foreign drops, asynchronous denial, duplicate
submission and real browser selection/reload. See [state and assets](state-and-assets.md)
for the contract and [core-system review](core-systems-review.md) for remaining gaps.

The follow-up interaction slice replaces blanket widget context interception,
aligns shared active tabs/table chrome, migrates desk controls to a compact floating
widget, adds shortcut quick-access presentation and adopts definition references
for root-shell selectors. The [core-system review](core-systems-review.md) owns the
current adoption inventory and deferred property/layer/agent work. No transport,
WASM execution, capability identity or package ownership redesign is selected.

The widget-workspace concept informs the default App desk: a References data view,
two asset-backed notes and Navigation's owned Pages view. New workspaces receive
ordinary editable theme/data/Markdown assets; restoration preserves saved layouts
and source. Built-in App desk creation supplies missing starter sources without
overwriting existing IDs. Shared widget chrome, note tools and data controls retain
the existing DockHost and explicit source commits. The theme asset owns sidebar
color and bounded page gutter/title, row/toolbar and body typography metrics.
[Semantic UI](semantic-ui.md) documents the renderer boundary and acceptance.

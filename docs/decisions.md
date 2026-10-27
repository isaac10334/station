# Architectural decisions

| Choice | Reason and known alternative | Reconsider when |
| --- | --- | --- |
| Identity references and inert editor-decision assets | Typed IDs survive renames; bounded first-match rules are configurable without executing code or granting capabilities. Variants are independent source with provenance. | A second real policy consumer requires a reviewed decider provider; durable automations need a journal and workflow contract. |
| Bounded session diagnostics and virtual source-file task grants | Metadata-only lifecycle history supports debugging; exact paths and directory prefixes constrain atomic reads/patches while whole-source bypasses fail closed. | Persistent audit requirements, OS filesystem grants or per-file guest execution need separate contracts and acceptance. |
| Better Auth for optional hosted identity; Bun commands plus ephemeral SSE | Database-checked revocation and shared typed account operations support sessions without granting local/native authority. SQLite locally, Postgres adapter for hosting. One process owns the realtime bus. Workspace sync remains separate. | Multi-replica hosting needs a shared realtime provider; account-scoped caches and encrypted backup need separate design/acceptance. |
| User-owned Gateway keys and per-widget AI tool grants | Direct browser AI SDK requests support the local prototype. Credentials default to memory; plaintext persistence is opt-in. Session-only widget grants gate advertised tools and checked provider acquisition. Draft saves require source review and never execute content. Existing WIT authority stays separate. | A deployed multi-user product needs authenticated server mediation, a credential vault, budgets, or untrusted extension isolation. |
| Call stored authored content assets | Asset browser, source model, commands and docs use asset terminology. Legacy workspace fields and dock references migrate on load; authored content and WIT/grant/artifact identities remain intact. | A specific asset type needs a more precise name; the umbrella term remains asset. |
| One localhost Bun server and a standalone HTML app build | Keeps local development and distribution simple. The old single-file source was replaced with TypeScript modules, while output stays one HTML file. | A real backend service, multi-user access, or additional routes need durable storage or deployment. |
| React UI with a local headless dock document | shadcn and selected registry components require React. Pure validated commands keep placement policy and persistence separate from views; the store still separates runtime behavior from rendering. | A genuinely portable host contract needs a second consumer. |
| Tailwind v4, shadcn source, Stealth tokens, and a neutral theme | The new dashboard and interaction components now share a concrete design system. Registry code is owned locally; Fonttrio assets are bundled for the standalone build. | Component maintenance or bundle size becomes costly, or a second theme needs distinct semantic tokens. |
| One searchable catalog for the command palette and saved navigation | Scope prefixes narrow assets, panels, and actions in the existing palette. Navigation saves a live content query with pins and exclusions, separately from dock placement/history. A pin picker provides a keyboard alternative to dropping assets. | Source-content indexing, new asset types, or multiple independent navigation widget instances require richer search/provider contracts. |
| Persist a versioned local grid/split/stack layout per workspace | Stable panel instance IDs, pure commands, and migration preserve existing workspaces while allowing duplicate widget types, tabs, nested splits, and the same browser in either dock. dnd-kit coordinates gestures while Stealth source provides rendering parts. Loop Kit stays focused on generic host and capability lifecycle. | A second application needs the same layout contract or a plugin UI capability has a verified end-to-end use case. |
| Keep instance configuration separate from backing geometry | v4 retains color and child presentation per stable instance, including legacy size fields for compatibility. Slots and normalized split ratios own geometry; flip, selection and previews remain transient. Host row extents give a predictable scrolling bento surface without a second coordinate store. | Independently resizable row extents require an explicit node contract and migration. |
| Real Layout ownership in the existing dock graph | `containers[instanceId]` references ordinary nodes. One validator, command boundary, drag coordinator and history serve all placements; cycles and duplicate placements are rejected. Removing a Layout promotes its children recoverably. | A second host proves this is a reusable Loop Kit contract. |
| Persistent instance DOM with measured slot anchors | Chromium here lacks state-preserving DOM moves. A keyed host layer changes bounds and clipping instead of reparenting live iframes/editors/services. Inactive instances stay mounted and inert; source edits, deletion and workspace changes retain their existing lifecycle semantics. | State-preserving browser moves are supported across target browsers, or measured-layer accessibility/scrolling warrants another implementation. |
| Deliberate heading pickup and one cross-placement drag coordinator | dnd-kit supports pointer delay/tolerance and keyboard targets across nested containers and docks. Motion provides readable position reflow; Stealth's independent grid/drop engines are references only. Accepted drops commit one atomic operation; previews never change persistent geometry. | A demonstrated gesture or collision requirement cannot be represented in this coordinator. |
| Station branding without contract renames | Package, title and current product prose use Station. The desktop checkout is `C:/Users/ijhar/Desktop/station`. Storage keys, serialized IDs, capability/WIT namespaces and artifact identities retain compatibility. External service project names remain independently configured. | A deliberate compatibility or external service migration is required. |
| Host-owned surface policy and session layout recovery | Typed policy caps leaves and validates every placement. Sidebar navigation is a singleton panel; eligible built-in widgets may float with their IDs. The store keeps bounded per-workspace history in memory and clears it on deletion. Surface visibility is session-only. | More surfaces or external widget providers require a proven placement metadata contract. |
| Discriminated Component and web content asset kinds | Components retain source, grants, and built artifact identity. Web content stores authored HTML and runs it as an opaque-origin sandboxed iframe, including dashboard widget instances. The two kinds have different execution and permission contracts. | A third asset kind proves its own source and execution path. |
| Keep authored web widgets local and isolated | `allow-scripts` without `allow-same-origin` blocks host DOM and storage access. A restrictive CSP in the authored document limits resource requests; backend Origin and Fetch Metadata checks reject opaque-origin API access. This does not yet establish a marketplace network or resource boundary. | Separate-origin serving, authenticated APIs, navigation controls, quotas, and review make third-party installation viable. |
| WIT imports are explicit, per-Component grants | Host logging and a bounded text surface show how a Component can act as a plugin without arbitrary DOM access. | A richer surface is needed and its resource, permission, and lifecycle rules are designed. |
| Acquire a profile-specific runtime with Loop Kit | `unit:workspace/component-runtime-polyengine` is selected deterministically from inspected P3 metadata. The linked host manages acquisition/revocation; Station enforces WIT grants. A failed run never retries another provider. | A second runtime passes the same artifact and browser contract. |
| Inspect application lifecycle independently of asset grants | Loop Kit reflects documented contract definitions, named scope ownership, provider registrations and pending/active/releasing acquisitions as immutable data. Definitions are grouped by namespace and contract package from existing IDs and can exist without providers. Station retains all workspace scopes and binds catalog access privately; the inspector lists each Component's grants explicitly in a separate tab. New built-in JS providers do not expand guest authority. | A verified guest bridge or another host requires a richer permission/reflection contract. |
| Ship source-only sample and build P3 dynamically | Static generated bindings would execute artifact-specific JavaScript. The source-only sample makes the current source → Sandbox → verified bytes path explicit. The build uses pinned nightly Rust, `wit-bindgen` 0.60.0, locked WIT dependencies, and an offline snapshot; both P3 and incidental P2 imports are recorded. | A stable Rust toolchain can emit the same P3 contract or another build provider proves equivalent provenance. |
| Translate verified bytes inside a fixed Polyengine worker | Polyengine 0.6.7 passed the local P3 future/stream fixture and browser invocation. The translator asset is pinned by SHA-256. A worker and import membrane bound locally authored guest authority; termination is the hard cancellation path. This is not sufficient for a hostile marketplace guest. | A second runtime proves the same contract or a separate-origin runner is added for untrusted installs. |
| Defer `@loop-kit/component` | A small runtime-neutral artifact identity, compatibility, selection, and scoped-invocation contract is plausible. A second production runtime boundary has not yet been proven; WIT grants, browser transport, Vercel build, and concrete adapters stay in Station. | Another consumer or runtime demonstrates the shared contract without app-specific fields. |
| Remove the incomplete Wanix browser lab | The Alpine i686 guest lacked Rust and Cargo, package installation stalled, and no Component build succeeded. Vercel Sandbox is the implemented build path. | A browser-local provider proves source-to-Component bytes and repeatable builds in the guest. |

Update this file only when a durable choice changes, with its reason and a practical condition for revisiting it.

## Browser contexts (2026-10-15)

Use native Windows WebView2 rather than CEF. Hide retained native views for host overlays, occlusion and dragging; mask hole punching is not required. Keep root sandboxing, Bun and one dock placement system. Browser contexts are acquired resources with bounded serializable operations and explicit session authority; keep the contract in Station until a second provider justifies Loop Kit extraction. Pin the latest published Electrobun release (2.0.3-beta.26 at this check) and rebuild its app-local Windows wrapper to remove unsafe flags and enforce native policy before effects. Installed native probes, not driver fixtures alone, gate upgrades. Download receivers and agent page automation require separate grants. See [browser context implementation and verification](native-browser.md).

Component grants use approval on invocation and a shared permission ledger. One-run authority is private to its invocation and expires on completion; remembered decisions retain existing asset-scoped boolean grant storage. Revocation cancels active authority, including a one-run approval with no saved grant. The approval snapshot must match the current revision and artifact. Revisit revision-wide remembered approval if assets gain third-party updates or a broader import profile.

Desktop distribution uses pinned Electrobun 2.0.3-beta.26 with bundled Bun and native Windows WebView2. A fixed desktop loopback origin preserves browser workspace storage; artifacts and backend credentials live in user data outside the installed bundle. Every main push publishes an unsigned canary to a fixed GitHub Release URL, retaining delta patches and an immutable build release. Downloads are automatic; applying requires an explicit restart. Revisit signing, authenticated release hosting, additional platforms and credential UX when distributing beyond the local prototype.

## 2026-10-11: local extensions and desks

- Keep one dock document per desk and one dnd-kit coordinator. Editor/contribution ownership extends the existing container graph; there is no second layout store.
- Use CodeMirror and small worker services for local TypeScript authoring. Curated dependencies and esbuild-wasm keep execution independent of a remote IDE runtime.
- Install immutable, reviewed package snapshots from authored assets. Source edits do not silently update running packages; Component plugins remain on-demand commands.
- Use opaque frames and a narrow private-port membrane. Loop Kit lifecycle is not itself a guest permission boundary. Shared owner state is scoped and declared.
- Desks share assets but copy configurations and restart runtimes on switching. Theme assets contain validated data; selection and token propagation happen live.

Revisit arbitrary npm packages, remote distribution, WASM UI and background services when their distribution, security and lifecycle contracts have a verified consumer.

## 2026-10-13: application workspace and public contracts

- Keep a private root coordinator and one `apps/station` application, with independently packable SDK and capability-contract packages. Do not create placeholder packages for every internal layer.
- Keep core state/reducers headless; isolate private contracts, trusted providers, services, React UI and composition within the app. Guest builds resolve the public SDK and declarations through package exports.
- Keep existing artifacts, storage/WIT identities, fonts, workers and desktop resources intact when relocating source. Development runs with the repository watch root and root environment files.
- Use the existing themed tree for built-in Files. [Semantic UI](semantic-ui.md) owns the implemented portable element/event contracts. Source-aware editing, drawing and GPU execution retain separate [exploration gates](explorations/surface-system.md#source-aware-editing-drawing-and-gpu).

## 2026-10-14: forkability, shared UI and bounded collaboration

- Fork installed source snapshots into new package identities; keep install/update and authority review explicit. Preserve source-only export semantics and traverse theme icon dependencies.
- Share semantic icon names as contracts and trusted/guest React renderers in a private UI workspace. Guest rendering remains separate from host UI capabilities. Static SVG icons are a validated image subset; richer animation is deferred.
- Prototype collaboration with same-origin, invitation-bound WebSockets, independent local desks, exact source revisions and conflict copies. Do not claim CRDT editing, E2E encryption, cloud accounts, native execution grants or agent control. Network exposure disables Component APIs.
- Keep marketing as a static app with a fixed-canary download and optional Pages deployment, separate from the workspace runtime. Export/publish from Station is a later capability.

## 2026-10-14: explicit chat knowledge and shared presentation

- Default new chat settings to the checked Gateway GPT-6 Luna ID while preserving saved choices. Static product knowledge is separate from live, grant-bound workspace context; model features do not grant tool authority.
- Chat owns a bounded message scroller; no outer generic widget scroll wrapper. Theme inputs keep local intermediate strings and commit valid settled values.
- Combine sole-instance/slot removal through one reducer command and undo entry, preserving existing child promotion and authored assets.
- Share default token/font CSS and theme reveal through private UI package; use canonical monochrome SVGL brand geometry and one deterministic S asset family. Retain Bun and keep tray/browser/command-plane work in explicit acceptance-driven prompts.

## Desktop tray and updates (2026-10-15)

Keep Bun as the Electrobun main process. Hide the persistent window through `will-close`, retaining last-window exit for real destruction and tray failure. Updates use one private immutable state service across native menus/tray and Settings. Only the trusted top-level app receives bounded check/apply HTTP access; SDK guests receive no desktop authority. Confirmation precedes stopping backend work; desktop disposal waits for the pinned updater's committed helper handoff. Windows OS session-end has no Bun callback in this pin and cannot claim async cleanup. See `docs/desktop.md` for managed installed acceptance and evidence.

Import the application factory independently from browser bootstrap. Package
services declare their own dependency ports, and recursive import tests enforce
core, UI and public package direction. Add a shared persistence/command transport
only with an authenticated second consumer; do not expose native HTTP operations
as general agent authority. Native browser bounds use root page zoom followed by
Electrobun's monitor DPI conversion. Acceptance installs use a separate identity,
data profile and loopback port, while normal canaries retain their existing origin
and GitHub feed. Revisit HTML webview tags when the sandboxed parent can own them
without restoring broad internal bridge authority.


## 2026-10-15: composable widget controls and browser pages

- Keep standard/compact/seamless chrome as instance metadata, with host recovery controls and shared settings in menus, the flip side and the selected-widget inspector. Single-child Layouts avoid redundant tab rails and nested Layouts default to compact headers.
- Represent browser pages as ordinary movable child widgets in the existing Layout graph. Each tab's grant/acquisition belongs to its stable instance; moving it never grants authority to a new owner. Migrate legacy bookmark arrays once and retain recoverable child promotion on owner removal.
- Focus the existing presentation layer through a native modal dialog and scoped overlay portals, preserving React parentage, placement and service scopes. Focus, menus and inspector selection stay transient. Revisit this mechanism if a target browser cannot retain its native dialog contents or a second host proves a different reusable focus contract.


## Widget composition and definition recipes

Keep slots as layout nodes in the existing dock graph. Use Layout instances to
compose their grids, splits and tabs; defer extracting packages until there is a
second real consumer. Expose pure commands and controlled React composition rather
than persisting callbacks or adding a parallel state store. Built-in definition
assets are a read-only code projection. Forks are validated configuration recipes
for trusted renderers. State-preserving definition changes require the same
renderer; arbitrary code/state adapters remain future contracts. Root shells and
source-only desk templates now use that same instance/asset foundation. See [Widget system](widget-system.md).


## Bounded domain automation and panel destinations

Share validated domain commands between headless CLI and live development control;
keep the renderer's existing persistence, service grants and native trust boundaries.
Start with metadata and layout parity, expose schemas/revisions, and leave production
MCP/native transport until the actual command contract has a second tested consumer.
Do not substitute successful state mutation for browser/native visual acceptance.

Side peeks are retained presentations of individual panel instances, including
Layout owners. They are not mirrors of whole docks. Preserve stable IDs, mounted
content, saved return destinations and protected legacy shell lifecycle. Root
layout widgets configure the desk shell; arbitrary modal definitions and inspector
selection-context composition remain exploratory;
see [Agent control and shell direction](agent-control.md).


## 2026-10-17: shared command policy and explicit agent delegation

Keep one live renderer store. Authenticate external clients in the Bun broker,
then dispatch with application-created opaque task contexts. Zod 4 schemas and
resource/effect descriptors drive discovery, CLI, MCP and internal model tools;
JSON-RPC/MCP transport identity is not application permission. Preserve exact
capability IDs and Loop Kit lifecycle ownership without claiming it is isolation.

Task grants expire after 60 minutes and intersect package declarations, reviewed
grants and resource bindings. Owner UI alone issues/renews tasks and decides exact
expansions. No model text or transport payload approves itself. Task installations
lose authority on Stop/reload/restart; source remains. Keep secrets in protected OS
storage, not URLs/assets/repositories. Windows requires ACLs before credential
writes. Hold source/version preconditions, cancellation, uncertain outcomes and
explicit target identity across every adapter. Defer delegated package-command
calls until callee effects can be intersected; fail closed meanwhile.

Use a generated stdio MCP adapter and explicit-profile headless backends. Do not
move desktop persistence or add public remote HTTP/OAuth in this delivery. Default
internal chat retains reviewed drafts; broader operation tools require an explicit
internal task. Runtime-authored workspace tools are the proof, with actual MCP,
SDK denial and browser acceptance; native installed acceptance remains independent.
See [Agent control](agent-control.md) for contracts, workflow and current limits.


Do not serve a desktop owner secret inside public loopback HTML. Header checks
cannot authenticate an OS process that can download that page. Deliver the secret
through a fixed host-to-root native bootstrap, retain the sandbox, and fail closed
until it arrives. This fixed bootstrap is not an agent-controlled JavaScript API.
Development HTTP bootstrap assumes a private local development environment.

## 2026-10-17: root shells, templates and visual widget defaults

Use one persisted root widget in the existing dock document, with named shell
surfaces and the same floating/presentation lifecycle. App shell preserves the
current dock layout; Desktop shell adds spacious windows, a background and a task
dock. Do not duplicate stores, native views or service ownership when switching.
Keep compatibility host identities recoverable and shell rendering trusted.

Desk templates are source assets, including virtual Built-in choices. Snapshot
allowlisted configuration and allocate fresh instance/node IDs. Keep editing a
template, creating a desk and selecting a workspace default explicit actions.
Visual widget definitions edit nested slot-default seeds through the shared source
operation. Preview catalogs remain inert so browsing cannot start services or
acquire authority. Flipping requires explicit opt-in; other settings remain usable.

## 2026-10-18: data sources, runtime actions and bounded JavaScript

Keep record identity/storage in source assets and query/presentation state in each
view widget. Reuse table, board and graph projections without copying records.
Start with explicit trusted provider registrations; authored IDs never install
host code or grant IO. Use a bounded QuickJS WASM worker for synchronous JSON
formulas and script assets, separately from the P3 Component runtime. A fresh VM
per evaluation avoids retained globals while one queued worker bounds engine
count. Toolbar actions are configured instance data, not arbitrary owner dispatch.
Decouple Component compilers from common inspection/provenance; add an explicit
OCI provider with no ambient host-build fallback. Container acceptance remains
pending while the local Docker daemon is unavailable.


## 2026-10-18: toolbar placement and the P3 scripting gate

Use a real compact-widget toolbar surface in the existing dock document and
presentation registry. Creating an action elsewhere never registers a second UI.
Visible labels and tooltips are independent. Required shell controls remain
protected, unlisted host definitions.

The broader programmable foundation remains blocked at its agreed runtime gate:
componentize-qjs 0.4.5 cannot compile custom async imports (upstream issue 89).
Keep the reproducible Loop Kit experiment and Node/Polyengine evaluator control;
do not widen the production Component import verifier or silently substitute
another engine. The user subsequently authorized and selected the alternative
recorded below. See [Programmable workspace foundation](programmable-workspace-foundation.md).

## 2026-10-18: select wasm-rquickjs and retain the compiler workaround

Continue the programmable foundation with pinned wasm-rquickjs v0.4.13 on
Polyengine 0.6.7. Retain componentize-qjs 0.4.5's failed async-import reproduction
and document the possible fixed-Wasmtime development build separately. Switching
back requires an explicit engine/profile change and repeated acceptance; there is
no automatic fallback or transfer of authority.

The isolated lifecycle proof uses fixed workers, outside-worker resource ownership,
explicit fixture bindings, per-effect checks and late-result rejection. Bound the
QuickJS heap and actual Wasm memory, payloads, logs, resources and execution time.
Record source/dependency/build identity at compilation, then verify it at use;
computing a fresh source hash beside stale bytes is not provenance. Keep proof
profiles separate from the existing Component verifier. Passing the probe does
not imply that editor, service, portable renderer or installed desktop integration
is implemented.

## 2026-10-18: Reusable TypeScript and portable UI execution

Use pinned wasm-rquickjs 0.4.13 on Polyengine 0.6.7 for the programmable workspace. Keep the componentize-qjs investigation/workaround documented as an explicit alternative. Inline TypeScript and packages share one activation path; reusable definitions never export bindings or live state. Portable UI requires its own inspected execution profile and explicit instance surface approval. Named shared services are workspace instances, not artificial data assets. Canonical authoring contracts use station:/loop: and portable WIT uses loopkit:; existing unit: identities retain explicit compatibility providers without expanding their effects. GPU display integration remains an independently reviewable adapter experiment.

## 2026-10-19: shared property editing and exact development sessions

Resolve host field presentation from serializable type/editor intent, with scoped
trusted overrides and safe fallback. Reuse the same field widgets for settings,
records and document forms. Commands retain validation, revisions and authority;
rendering a field cannot grant access. Share syntax tokens across source/JSON
editors and keep authored drafts on validation/conflict errors.

Canonical providers now own current implementations; deprecated Unit identities
adapt to them without translating grants or changing WIT/storage contracts. Bind
broker pairing, jobs, replies and revocation to each root renderer. A second tab
cannot replace the first. Prefer a dedicated loopback development origin and
owner-reviewed task pairing; account presence never substitutes for that review.

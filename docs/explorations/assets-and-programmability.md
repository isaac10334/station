# Assets and runtime programmability

Status: exploration, October 8, 2026. Only the terminology rename and its compatibility migration are implemented by this change. This is a proposed direction and a record of open product questions, not an SDK or runtime specification.

Station should make creating, installing, editing and using extensions ordinary workspace operations. It is a concrete Loop Kit host, with a small trusted core and replaceable contributions. AI-assisted asset creation is a particularly useful next vertical slice.

## Current evidence

- Assets currently have two kinds: Rust/WIT Component projects and authored HTML web content. They live in browser storage; there is no account-backed asset service or real account authentication yet.
- Component source builds from the browser through the Bun server and Vercel Sandbox. Compilation is remote; inspected P3 bytes execute in a fixed browser worker with futures/streams and bounded host effects. A browser-only offline compiler is not implemented.
- Composition registers one Component runner with Loop Kit, acquires it per run and revokes the scope afterward. WIT effects have explicit grants; source freshness, byte integrity, cancellation and worker termination are checked separately.
- Built-in widgets and asset editors are host React code. The catalog describes their renderer/provider metadata but does not provide general installable capability contributions.
- Web content runs in an opaque-origin iframe with no Station SDK or host bridge. Existing containment is a local authoring boundary, not a proven hostile marketplace boundary.
- The linked Loop Kit host manages typed provider lifecycle, exact versions, one provider per capability ID, handles and scopes. Its ordinary JavaScript values and cooperative signals are not a permission membrane. General grant policy, transport enforcement, discoverable invocation schemas and inspector instrumentation remain to be designed.

## Proposed vocabulary

| Concept | Meaning | Example |
| --- | --- | --- |
| Asset | An addressable, typed, versioned definition or document; it need not execute | Theme, icon set, web source, Component source, widget definition |
| Asset type | Versioned data schema, reference rules and validation contract | Theme v1 requires semantic colors and named icon roles |
| Revision/artifact | Immutable content identity for one revision or built output | Source digest, inspected Component bytes |
| Contribution | Something an installed package makes available to the host | Editor, widget definition, capability provider, startup service |
| Widget | A placeable interactive surface; an instance refers to a definition and has its own configuration/lifecycle | Two weather instances with different locations |
| Editor | A surface contribution that opens supported asset types and edits through granted document operations | Theme editor, Component editor, raw document fallback |
| Package | A versioned distribution/install boundary declaring assets, dependencies and contributions | Theme studio containing an editor, icons and an optional generator |
| Capability | A versioned service contract whose implementation is a provider | Read one asset, invoke a model, open an editor |
| Grant | Authority for a principal to use specified operations/resources under constraints | This editor may update this theme for this session |

An editor can use the same docking/surface machinery as widgets while having a distinct role and lifecycle. It does not have to appear in the dashboard widget picker. A background provider has no surface. An application can initially be a package with an entry point and coordinated contributions, without introducing another execution runtime. Reserve “driver” for actual hardware/platform integration; use startup service for ordinary background work.

Keep ownership, visibility, provenance and authority separate. An asset can be workspace-owned, account-owned or package-owned; visibility can be normal, supporting/dependency or system. Supporting assets can be hidden in the default browser but always inspectable. Hiding does not authorize access or prevent deletion. The host must handle dependents before uninstall/deletion. Official provenance should be verified against a trusted publisher identity; a package cannot assert its own trust.

## Proposed theme slice

A theme should first be declarative data: semantic tokens, dark/light variants, typography references and named icon-role mappings. Reference an icon asset with an exact revision/digest; avoid silently following “latest” for installed dependencies. Keep data themes free of arbitrary script and unrestricted CSS. If a later theme needs programmable behavior, ship a separate executable contribution with separate grants. Rendering isolated widget content also needs an explicit token-delivery contract; host CSS cannot directly style opaque iframes.

Validation happens at multiple boundaries:

1. Save/import: validate schema/version, required roles, allowed token values and reference shapes. Permit incomplete drafts with diagnostics.
2. Resolve/install: fetch and verify dependencies, versions, hashes, resource types and limits. Validate a constrained icon representation or sanitized SVG; do not trust an extension or MIME label. Detect dependency cycles where disallowed. Bound font/image sizes and avoid unexpected network loads from visual resources.
3. Apply: resolve a complete candidate for this host version, validate host-required roles and accessibility warnings, then atomically replace the active theme. Failed application keeps the previous valid theme. Dependency changes require revalidation before activation.

Bundle a known-good official theme as a cached copy of the same asset format. Resolve the selected theme on startup, using cached pinned dependencies before fetching updates. A tiny boot/recovery stylesheet keeps navigation and rollback usable while resolution is pending or broken. The source of default assets may eventually be an asset backend and fetched during a reproducible build; shipping a default does not require a different runtime contract. Treat official, required, bundled and active as separate facts. The host owns which recovery pieces cannot be disabled.

The theme editor opens a draft, previews it in a bounded surface, reports diagnostics and applies through a distinct theme activation capability. Editing a theme and changing the active workspace appearance should be separately grantable. Keep a safe fallback editor/reset path if the selected editor or theme fails.

## Proposed opening and execution model

An “open asset” service resolves its type/revision, finds eligible editor contributions, uses a user/workspace default or prompts when necessary, and creates a scoped editor instance. Give the editor a document handle and operation-limited access, rather than a whole workspace store. Multiple views share the document but own separate selection, navigation, undo presentation and service scopes. Document revision/conflict handling belongs to the document service, not a React component.

A contribution manifest should declare supported types, entry point/runtime, required capabilities, optional capabilities and host compatibility. Downloading or installing data must not silently activate a background service. Activation acquires a scope; closing, revoking, uninstalling or updating disposes it according to explicit lifecycle rules. Registering a provider needs delegated authority limited to declared namespaces/contracts, collision handling and removal rules. Do not allow a package to replace the permission broker by registering a provider with its ID.

The host retains identity, grant enforcement, isolated runtime/transport dispatch, lifecycle, placement policy and recovery. Editors, browsers, themes, agent UI and widgets can increasingly be contributions. Built-in providers can implement the same contracts; dynamically replacing everything is not a prerequisite for runtime programmability.

## Proposed capability and SDK work

Useful initial service families: asset read/create/update/watch; type validation and dependency resolution; editor opening and bounded surfaces; Component build/invoke; theme preview/apply; scoped storage; logging/events; model inference; and capability inspection. Native filesystem, clipboard, process execution, screen capture and remote machine services come later with explicit resource constraints.

Design shared service semantics and schemas, then expose them through two adapters:

- Web SDK: validated request/response/event messages over an instance-bound channel. Bind the channel to the exact isolated frame/port; opaque origin strings alone cannot identify a caller. Validate every payload, operation and resource, enforce quotas, and close authority on navigation/revocation.
- Component SDK: WIT imports/exports, resource handles and async functions/streams mapped to those same semantics. WASI/Component portability helps reuse logic on desktop/backend, but those hosts still need compatible worlds, versions, providers and policy. Portability does not mean access to browser DOM or native APIs. Backend hosting is not implemented here.

Authoritative grants live at the host/provider boundary. Both SDKs carry handles/requests, not self-issued permissions. Avoid a promise of identical ergonomics for every browser/WIT type; test the common subset first. Package transport, generic scopes/grants/descriptor machinery and remote dispatch are plausible Loop Kit work when demonstrated by an end-to-end Station slice. Station owns its asset schemas, editor selection, layout and consent presentation.

The inspector needs read-only discovery of identities/contracts/providers, scopes, effective grants and constraints, active instances, dependencies, calls and revocations. Distinguish declared, available, requested and granted. Typed TypeScript service values alone cannot generate an invocation form: exposed operations need runtime input/output schemas and policy metadata. Invocations from the inspector use the same authorization path as guest invocations, record their actor and show side effects. Discovery must not instantiate providers just to enumerate them.

Consent should group concrete effects into host-defined, versioned presets such as “Edit this asset” or “Use this model with this budget.” Show the requester/publisher, resource/machine, read/write effects, duration and consequential operations up front. Expand to exact operations and constraints. Required and optional access differ; provide deny/limited/one-use/session/workspace choices where meaningful. Presets do not auto-include newly added privileges after an update. Package updates and delegation require authority no broader than the parent grant and should show privilege differences. Revocation must reach the transport/provider and hard-stop isolated execution where cooperative cancellation is insufficient.

## Proposed AI first slice

Recommended experience: ask an agent inside Station to create or edit a web widget in a staging draft, inspect its source/diff and preview, then place it. Give it scoped asset operations, validation and preview tools. Keep activation, publication, provider registration, secret access and native operations separately authorized. Start with one real model provider, cancellation, streamed progress, a visible budget and a record of calls/artifacts. Credentials belong in a service/native credential store rather than authored assets or guest-readable settings.

This slice proves assets, edits, runtime preview, scopes and useful consent before requiring a marketplace. Next, use the same tools to generate a theme and open its specialized editor, then build a Component provider. Existing external coding agents can later use the same operation contracts through an adapter. Broader desktop automation is a separate authority expansion.

## Proposed desktop, machines and sessions

Electrobun is the requested Windows desktop shell. Reuse the Station UI and put native implementations behind a narrow main-process service boundary. Typed RPC is transport, not authorization; an untrusted contribution must never inherit the full native bridge. Pin and verify the chosen release/WebView behavior when implementing. Electrobun's current BrowserView docs describe a sandbox option disabling its RPC for untrusted content: [official API](https://github.com/blackboardsh/electrobun/blob/main/docs/src/content/docs/electrobun/apis/browser-view.mdx). Mobile needs a separately evaluated shell; do not assume a desktop framework supplies it.

Define a machine as an enrolled device/agent identity with its own key, provider inventory and revocation. Define an account session as one authenticated Station login with an expiry and device association. A running contribution instance has its own execution scope/lease; do not overload account session to mean all three. A browser session can request services from a machine; sharing an account does not automatically authorize native access.

Start with real authentication/enrollment, “where am I signed in,” machine presence and logout/revocation. Then offer one explicitly enabled remote capability, such as reading a user-selected folder. A machine agent can connect outbound to an authenticated relay. Route to a named machine/provider explicitly: the current one-provider-per-ID Loop Kit host does not already solve distributed selection. Authenticate both ends, bind grants to actor/target/resources/expiry, audit invocations, enforce locally and remotely, and handle disconnects without duplicating side effects. Screen sharing/control and unattended process execution should be distinct later capabilities.

## Suggested sequence and unresolved product choices

1. Add one useful capability-backed asset read/edit/preview flow, runtime descriptors and an inspector that explains its scopes and grants.
2. Build the AI asset authoring slice on that flow; develop the web SDK around real usage.
3. Prove editor resolution and dependency validation with a declarative theme, icon references and a theme editor.
4. Introduce package manifests, installation/update/uninstall, contribution registration and startup services. Apply the same contracts to official bundled contributions.
5. Build the Windows shell and local native providers. Account services/enrollment can develop separately; require them before cross-session desktop access.
6. Add remote providers and mobile hosts after local lifecycle/revocation behavior is clear.

Open choices: should AI begin inside Station or by connecting an existing agent? Are assets local-first with optional sync, or account-first with offline caching? Does an editor normally present as a document tab, with optional dashboard placement? Which visual/theme changes need preview versus global activation? How much native access should require an active person at the target machine? These choices affect priority and consent UX; none needs a speculative universal OS abstraction today.

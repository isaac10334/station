# Composable UI, product trim and Codex control

Review: October 27, 2026. Recommendations below are proposals. No widgets,
editors, saved assets or compatibility identities were removed by this review.
Current contracts remain [Semantic UI](../semantic-ui.md),
[Programmable authoring](../programmable-authoring.md) and
[Agent control](../agent-control.md).

## Recommendation

Make one existing authored surface useful end to end before adding another UI
system. Reduce exposed entry points, preserve underlying capabilities, and use the existing CLI for Codex. MCP can remain a thin optional adapter.

## What to trim first

| Surface | Proposed trim | Preserve |
| --- | --- | --- |
| Widget picker | Stop mixing every asset's editor with reusable widget definitions. Open existing content through the Asset browser / Open with. | Existing editor panels, source identity and routing. `widgetDefinitions()` currently emits `editor:<assetId>` for every asset. |
| Widget editor / Widget inspector / definition Visual editor | One Edit UI entry point with Structure, Properties and Source; inspect-instance and edit-definition remain explicit modes. | Definition/instance separation, explicit Update from definition, shared EditorWorkbench and source recovery. |
| IDE / script playground / program editor | Put source and runtime controls behind contextual developer workflows instead of treating each as a competing starting point. | EditorWorkspace, Files/Code/Problems, immutable activation, grants and deliberate Run/Start. These already share some machinery. |
| Capability and docking inspectors | Move diagnostic discovery under Developer tools. | Inspection, revocation and recovery. Hiding a menu entry is not removing the security system. |
| Clock / Weather / Snake | Ship as examples or optional content once equivalent authored/package versions pass acceptance. | Saved widget IDs and readable old definitions; keep working adapters until replacement exists. |
| Notes / Markdown / SVG editor choices | Present one default editing route per content kind, with alternatives under Open with. | Independent storage formats and valid specialized engines. Do not delete the SVG recovery editor before another engine is accepted. |
| Station agent | Make optional if Codex is the primary authoring interface; avoid expanding a second general agent harness now. | Explicit model/context disclosure and shared command policy for people using it. |

Do not merge Layout slots with semantic element children. A slot places retained widget instances; an element tree describes one widget's UI. Do not delete the source editor, Asset browser, permission review or minimal trusted recovery shell.

## Existing foundation and actual gaps

Loop `@loop-kit/ui` already exports JSON-compatible keyed frames/events, an element registry, property defaults, child constraints, accessibility metadata, icons, token descriptors, validation and a recording surface. Its WIT prototype is `loopkit:ui@0.1.0`: owned surface resources with render/next-event/open. That file is a contract, not proof that Station's arbitrary Component runner hosts it.

Station `SurfaceDefinitionEditor` already adds, edits and reparents semantic
elements using the Loop catalog and shared property controls. Its preview is
inert; drag/drop is in the structure tree, not a full direct-manipulation canvas.
`WidgetVisualEditor` separately composes widget instances/slots. Clock, Weather
and Action button have forkable surface JSON; controller inputs and actions are
still restricted to built-in enumerations in `core/authored-surface.ts`.

Portable TypeScript programs can publish semantic UI through the existing
QuickJS/WASM-backed scripting path. That does not establish a general user WASM
Component-to-semantic-surface adapter. The ordinary Component grant catalog still
exposes a bounded plain-text surface. Runtime element contributions cannot load
arbitrary React renderers: current registry extensions are trusted host code.
Themes supply tokens/icons, not executable renderer registrations.

## Smallest editable-UI slice

1. A plain authored surface definition, independent of a specific Clock/Weather
   controller. Start with row/column, text, metric, input and button from Loop.
2. One Edit UI workbench over the same source: tree, canvas selection, typed
   properties, palette insertion, ordered movement, undo and source recovery.
   Canvas selection identifies stable element keys; it does not select dock slots.
3. Typed inputs and named events. UI editing and AI generation produce inert
   candidate JSON. Validated source commits use asset revisions; applying a
   changed definition to a live instance remains explicit.
4. One WASM Component consumes an authorized surface handle, publishes a frame,
   receives a button event and publishes the next frame. Test actual bytes,
   imports, grants, revocation, disposal, stale events and browser/native input.

Generic descriptors, child slots and portable validation belong in Loop. Station
owns saved assets, the visual editor, theme selection, package install/review,
docking, concrete DOM/native adapters and authorization. No upstream ownership or
wire identity change is decided by this review.

## json-render and Signals

[json-render](https://github.com/vercel-labs/json-render) already separates catalog,
specification, rendering, actions and generation. Core supports custom schemas;
the React schema uses a flat keyed element map and has richer state/binding
facilities than today's Loop surface. It is a credible dependency, not something
to dismiss because a smaller local system exists.

Evaluate `@json-render/core` in one adapter against the same six-element example.
Prefer reusing generation/streaming/prompt facilities if they fit. Before adopting
it as the canonical format, compare stable identities, source edits, typed
bindings, resource references, event revisions, budgets, accessibility and WIT
transport. Do not keep two permanent independently editable UI documents/state
stores. Its renderer/action handlers still need Station policy checks.

[Jev composition](https://json-render.dev/docs/jev) is experimental, available from
0.21.0, with the inspected guide pinning matching 0.21.1 packages. It selects from
prepared atomic candidates; it does not invent missing text/data. Its composer
accepts the standard flat spec, not arbitrary custom schemas. These limits matter
if Loop remains canonical. Keep any model provider optional; ordinary editing
must work offline without AI. No dependency was installed in this review.

[Signals](https://signals.snowplow.io/) supplies live behavioral context to a
product/model. Its [System One guide](https://signals.snowplow.io/use-cases/system-one-models)
discusses Jev; the reviewed pages do not establish that the entire site is built
with json-render. The useful Station pattern is constrained composition from a
catalog. A telemetry/personalization platform is not needed for this authoring slice.

## Contributions, themes and graphics

Separate a contribution's role from its artifact format. A UI element or surface
contribution could be backed by declarative UI source, a WASM controller emitting
semantic frames, or a separately authorized drawing implementation. A WASM binary
is not itself a UI role. This extension to the contribution registry is proposed.

Begin with namespaced, versioned declarative compositions over known elements.
Validate dependencies, cycles, slot/property schemas and removal behavior.
Theme packages can reference compatible element variants and tokens through this
catalog. Selecting a theme must never implicitly execute a Component or authorize
GPU/network access. Executable renderer contributions require explicit install,
activation, scoped resources and revocable grants independently of visual choice.

Semantic UI and GPU drawing are distinct surface implementations. The former
retains host accessibility/focus and common controls. The latter needs explicit
device/context resources, extent and memory/work budgets, resize/input ownership,
device-loss handling, cancellation and disposal. A widget cannot create an
unrestricted OS window or draw over other widgets by acquiring a surface handle.

[wasi:webgpu](https://github.com/WebAssembly/wasi-webgpu) is currently a Phase 2
proposal; inspected revision `6a776bada0b66d3dbf9da304a49ff2947ce4e1f8`
declares `wasi:webgpu@0.3.0-rc.2`. Window/display presentation is outside its scope.
[wasi-gfx-runtime](https://github.com/wasi-gfx/wasi-gfx-runtime), inspected revision
`9c79e69dbb00fd04f04eb7feee3804c8eec73392`, provides separate graphics/frame-buffer/
surface machinery and examples. Its manifest uses Wasmtime 46–50 and wgpu 29;
this is a different integration boundary from Station's current browser runtime.
Neither is implemented or tested in Station by this review.

Use WASI-style resource ownership and independently granted interfaces where they
fit. Do not rebrand private Station APIs as standardized `wasi:*` contracts or
make raw GPU a prerequisite for the first editable widget.

## Control readiness evidence

On this desktop during the review, port 3000 was the checkout's Bun development
server; `station:control --discover --instance http://127.0.0.1:3000` returned 404
because control is opt-in. Do not swap the user's `localhost` tab to `127.0.0.1`:
they have different storage origins. Current CLI/broker bootstrap accepts the
explicit numeric loopback workflow, so an existing localhost session is not
silently controllable by that path.

Port 43158 belonged to the verified `com.isaacharvey.station.acceptance` installed
Bun executable. Discovery returned one connected native renderer. No listener was
found on normal-canary 43157 or desktop-development 43159. This proves discovery,
not authorization. No paired CLI credential was available to execute commands.
Native UI reads succeeded but attempted input did not alter the app; no task was
authorized, no window was closed, and no live workspace was modified.

The existing CLI and MCP adapter share the command registry. Fresh focused tests:
4 control/broker/MCP tests and 8 semantic-UI tests passed. These do not substitute
for a paired live `commands.list` + `state.inspect` or installed rendering proof.
The next required user action is reviewed pairing in the intended renderer; see
[Agent control](../agent-control.md#codex-workflow-cli-first).

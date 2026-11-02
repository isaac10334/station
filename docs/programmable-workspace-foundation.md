# Programmable workspace foundation

Status: integrated foundation, October 18, 2026. Station now authors TypeScript and portable JSX through a reusable wasm-rquickjs Component on pinned Polyengine. Source drafts, immutable activations, saved instances, running services, contributions and explicit bindings have separate ownership.
componentize-qjs and its potential Wasmtime workaround are retained as a deferred,
explicit option, never an automatic fallback.

## Integrated authoring and execution

- Loop Kit now exposes immutable method/input/output/effect descriptors, explicit named service selection, and public scripting/UI packages with WIT surface resources. Default acquisition remains compatible and never guesses a named instance.
- New script assets use TypeScript; the existing main.js/formula evaluator remains a separate bounded compatibility path. CodeMirror uses script-specific SDK types without DOM/Node globals. Curated SDK/local/selected source dependencies are bundled without npm or remote resolution.
- The editor saves inert drafts immediately. Apply pins source, dependencies, compiler/engine identity and compiled code; invalid drafts retain the last activation. Start/Run and Stop explicitly own execution. Save as definition exports source/configuration without bindings, credentials or live state.
- Portable JSX, direct composition and generated descriptions use one bounded keyed semantic model. Station owns accessibility, icons, focus, popovers and DOM rendering. Guest callbacks stay inside the Component. The independent recording/event adapter needs no DOM.
- Scripting and portable UI have separately inspected profiles. Surface composition additionally requires explicit instance approval and the portable UI profile. Instance ownership, allowed placement and service/resource authority are rechecked on calls; moving a widget does not create a second runtime.
- Services persist configuration separately from assets. Desk settings includes Services with status, provenance, consumers, bindings, startup preference, source and diagnostics. New services start stopped; owner services may opt into startup, and task instances need renewed authority after restart/revocation.
- Asset metadata, activity and Navigation selection are scoped built-in services. Document tables keep records in their asset. Shared authored services use named Loop Kit leases; caller resources and declared effects intersect with the service's own bindings. Stop invalidates dependent consumers and subscriptions.
- Local and package activation share prepareProgram. Package contributions include services, settings and namespaced custom document types. Host-rendered Extension settings never grant authority. Custom documents preserve source and a recovery editor when their extension is unavailable. Package updates require explicit instance selection/update.
- Each Navigation instance owns its filter, pins, selection and list/tree/compact presentation. Existing desk filters migrate once. Navigation variants can be saved as widget definitions without copying live selection.

The real MCP cockpit authoring driver is apps/station/scripts/author-programmable-cockpit.ts. It uses the discovered schemas and paired task context to build a shared service, two portable dashboards, an icon-only toolbar script scoped to one test asset, settings and a custom asset type. MCP schema references are rebased when nested under tool params, and discovery describes input defaults correctly.

## Validation and experiment boundaries

Final acceptance on October 18:

- Station: 200 behavioral tests pass (1,546 assertions), plus `bun run typecheck`, `bun run build`, `bun run build:component`, and the managed desktop build. The unchanged legacy Component verifier executes its real greeting bytes.
- Loop Kit: 20 tests, typecheck/build, and the four packed packages' external TypeScript/ESM consumer check pass.
- The final paired MCP cockpit completes 106 calls, denies unrelated source access, and activates a shared service, coded JSX and generated dashboards, settings, custom document type and scoped toolbar action. Browser interaction confirms shared query state survives floating the existing JSX widget, and the toolbar edits only its selected test asset. Definition editing saves into the reusable recipe's source; extracting a definition includes configuration defaults and excludes bindings.
- Service bindings pin the reviewed method schema/effects. Changing a service's contract requires explicit rewiring; supplied contract stamps are ignored. Rewiring also checks the caller's activity/selection/mutation capabilities. Subscription disposal cancels pending delivery, and disabled custom types preserve their documents while rejecting extension operations.
- Browser layout checks at 375/768/1024/1440px retain the viewport's document width. Real P3 bytes produce matching DOM and recording-adapter interactions. The independent Node adapter completes 20 warm interactions in about 15ms, with about 527ms total startup/execution, and terminates a runaway guest.
- The registered installed `com.isaacharvey.station.acceptance` build, port 43158, reports actual portable rendering, button interaction, unrelated-source denial, and dependent-widget invalidation when its shared service stops. Native tray ownership, X/hide, three same-HWND restores and Quit cleanup pass separately. Only this managed installation is updated by the guarded installer helper; its profile is preserved.

The installed opt-in fixture is enabled only by `STATION_PROGRAMS_VERIFY=1` on that managed profile. Its fixed task uses the normal operation schemas and explicit scope; the private root-authenticated result endpoint accepts only its bounded report. It is not a general execution endpoint. Receipts and the cockpit screenshot live under `.desktop-test` locally; credentials remain outside authored/exported content.

Bun's JavaScriptCore runtime cannot execute this multi-memory P3 engine. Production browser/WebView2 workers and the independent Node/V8 adapter are verified; a Bun headless scripting execution provider is unavailable. Compilation in Bun remains supported. Station never silently falls back to the compatibility evaluator.

Focused policy tests and the full Station suite cover authority denial, stale revisions/events, shared service ownership, invalid draft retention, toolbar identity/persistence and compatibility. Run bun run typecheck, bun run build and bun run build:component; Loop Kit additionally provides scripts/check-typescript-packages.ts for packed external TypeScript/ESM consumers. Local test receipts are kept in .desktop-test and contain no credentials.

The independently reviewable portable-graphics experiment uses real P3 guest calls to drive Canvas 2D and a WebGPU display adapter. It exercises input, resize, actual device destruction/loss, recovery and cleanup. It pins wasi-webgpu at 6a776bada0b66d3dbf9da304a49ff2947ce4e1f8. Direct wasi:webgpu imports, arbitrary guest shaders and native GPU adapters are explicitly unsupported by this experiment; the upstream proposal leaves screen/window management out of scope.

The reusable production engine is built from the resolved @loop-kit/scripting package by prepare-scripting.ts. Compiler bytes, authored and generated inputs, actual engine bytes/imports and memory declarations are checked. Station packages the fixed engine and both profile manifests for desktop use. No edit componentizes another engine. The existing general Component verifier remains unchanged.

## Earlier compatibility investigation (historical evidence)

## Implemented slice

Action Button has independent visible label and tooltip, including icon-only
presentation. The main toolbar has an ordered compact-widget destination in the
existing v5 docking document. Creation elsewhere no longer projects a second
action into the toolbar. Movement, ordering, keyboard pickup, cancellation,
context settings, undo/reload and legacy pin migration share the existing model.
Protected fixed tools use unlisted internal definitions. See
[Data sources and scripting](data-sources-and-scripting.md).

## Runtime experiment and exact blocker

Loop Kit contains `experiments/station-p3-scripting`: a reusable no-import
evaluator control and a custom async service/surface probe. The following records
the October 16–18 investigation; its initial Station drivers were retired on
October 30 after the lifecycle proof and production engine replaced them.

Pinned compiler: componentize-qjs v0.4.5, source commit
`e563c6d6ae50b087980414015663ca9c948c09bb`. The official Windows x64 archive SHA-256
is `77b0dd43fe54f8090e26430486ae90eba0fd4dc2910d5cd7a5ce7eedd4fb2314`;
the extracted executable SHA-256 is
`7b4e240a2cd110306144c3a69badb9b05bf08a6e7b3eb841367c8f1dab8f508a`.
The historical driver verified the latter before executing it.

The required custom async import fails during compiler linking, with and without
`--stub-wasi`:

```text
component imports instance `loopkit:script-probe/services@0.1.0`, but a matching implementation was not found in the linker
instance export `invoke` has the wrong type
type mismatch with async
```

[Upstream issue 89](https://github.com/andreiltd/componentize-qjs/issues/89)
reports the same failure. On October 16 the maintainer identified Wasmtime fixes
13821 and 14396 and said the compiler update was waiting on Wasmtime 50. This is
an observed compiler blocker, not a conclusion that Polyengine cannot support
async UI or service contracts.

The no-import evaluator compiles and runs through Polyengine 0.6.7 under Node
25.9/V8. It executes newly transpiled TypeScript without re-componentizing;
returns `42`; completes ten changed-source evaluations; retains counters `1,2`
in one instance and returns `1` in another. A local sample measured approximately
101 ms translator setup/translation, 60 ms TypeScript-to-first-result, and 1.9 ms
for ten warm calls. These are diagnostic samples, not performance guarantees.
Actual component and translator hashes are printed per run.

Bun 1.3.14's JavaScriptCore cannot instantiate the control's multi-memory Wasm;
the same control passes with Node/V8. This is recorded separately from the async
compiler failure. Browser/native execution of the control is not established.
For this compiler, custom async imports and surface events/disposal remain
blocked. Resource budgets, cancellation and DOM/headless UI parity are unproven.

The retired probe exited nonzero after reporting the successful control and
compiler failures. This history does not establish compatibility with newer
compiler releases and does not authorize an automatic engine fallback.

## Selected compiler and bounded lifecycle proof

The user explicitly selected wasm-rquickjs for continued implementation.
Wasmtime 50.0.0 stable is not published as of October 18; 49.0.3 is current stable
and 50.0.0-rc.1 is published with the resource-alias fix. componentize-qjs still
publishes v0.4.5 and embeds Wasmtime 47. Installing a newer standalone Wasmtime
does not update that dependency. A compiler rebuild against the release candidate
is possible but untested here.

An isolated wasm-rquickjs v0.4.13 build implements the same custom async service
and owned surface WIT world. The retained upstream experiment includes its
compiler hash checks, source fixture, Cargo lock and preparation script. Build
with `--target wasi-p3`, enable `p3,encoding` without default features, and remove
`inter-task-wakeup` from the generated wit-bindgen 0.58.0 features. The default
feature otherwise traps on delayed host calls in Polyengine 0.6.7 with
`stream.cancel-read: synchronous cancel on an end that is in a waitable set`.
The same-thread async executor passes with that feature disabled; cross-task
wakeup behavior has not been validated.

Station's initial Node and browser-worker drivers used the same probe
implementation and unchanged Polyengine 0.6.7. Actual
bytes pass in Node/V8 and the in-app Chromium browser: transpiled TypeScript,
delayed async service result `42`, ten changed-source runs, retained/fresh
instance isolation, surface render/event/disposal, session Start/Stop and unwired
binding denial. HTTP/socket imports linked by the generated runtime are supplied
only throwing denial shims; baseline WASI has no real filesystem or inherited
environment. Production verifier profiles and grants remain unchanged.

The extended `lifecycle.wit` / `rquickjs-lifecycle.js` proof adds owned subscriptions,
async surface acquisition, host-side resource ownership and a fixed Wasm worker.
The host stays outside the worker, so Stop and workspace closure cancel actual
host work even if the guest loops forever. The separate experimental inspector
requires bounded owned core memories and validates scripting exports/imports
without widening the existing Component verifier.

The preparation script defaults to this lifecycle profile. It uses pinned Rust,
a 16 MiB QuickJS heap and a 64 MiB Wasm linear-memory maximum. It records source,
all generated source/WIT, dependency lock, build recipe, compiler and byte identity
at compilation. The invocation driver rejects stale builds and tampered bytes or
import profiles; it cannot mint a new source identity for old bytes.

The same Node/browser acceptance suite covers subscriptions, retained handles,
Stop/revocation/workspace closure, late service results, denied source/metadata
bindings and network calls, heap/output/log/resource limits, runaway termination
and fresh/session state. The host uses only explicitly named fixture bindings and
empty WASI filesystem/environment providers. These are real P3 bytes, but the
resources and policies are fixtures, not real Station asset authority or shared
production services. The text surface is not the planned portable DOM renderer.

The current suite passes twenty real-byte lifecycle checks in Node and Browser,
plus five focused schema/memory/host tests. A separate CLI negative test confirms
that source edits reject an existing engine before invocation. Reports include
cold startup, edit-to-run and warm-run timings and zero-resource cleanup
snapshots. Installed desktop acceptance has not been performed for this probe.

The upstream experiment README owns the retained lifecycle reproduction commands
and limitations. The compiler pins and failure above are dated evidence, not an
active fallback implementation. No automatic engine fallback or production
grant/profile migration was added.

## Investigation retirement

On October 30, the five initial compatibility drivers were removed:
`probe-p3-scripting.ts`, `probe-rquickjs-scripting.ts`,
`probe-rquickjs-browser.ts`, `rquickjs-runtime-probe.ts` and
`serve-rquickjs-probe.ts`, formerly under `apps/station/scripts`.
They had no product, build, CI or test consumers; the rquickjs entrypoints only
shared the retired probe implementation. Compiler pins, the async-link failure,
the feature workaround and the original execution limits remain above.

Production still uses `prepare-scripting.ts` and the resolved Loop scripting
engine. The owned-resource lifecycle drivers, `scripts/scripting-proof` fixtures
and `tests/scripting-proof.test.ts` remain. Current contracts live in
[programmable authoring](programmable-authoring.md); current gaps live in
[the core review](core-systems-review.md). This retirement changes no runtime
profile, installed state, grants or authored content.

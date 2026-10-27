# Semantic UI and shared actions

Mission `LOOP-STATION-SEMANTIC-UI-2026-10-20-04`, October 20, 2026.

`@loop-kit/ui` owns the renderer-independent description/event contract. Its
external source lives in `C:/src/ilt/loop/packages/ui`; Station consumes a checksummed
package artifact, with reversible links during development. Existing short element
IDs, revisioned frames/events, legacy string icons and WIT identities remain compatible.

## Ownership

| Contract | Owner / implementation |
| --- | --- |
| Descriptions, stable IDs, property schemas/defaults, children slot constraints, events, accessibility | Loop `createElementRegistry`, `defineElement`, `elementProperties`, `validateFrame` |
| Trusted rendering/extensions | Station `PortableSurface`, `stationElementAdapters`; matching definition and adapter are both required |
| Portable icons | Loop `IconRef`: symbol, SVG asset identity/path, registered provider; semantic sizes, decorative/image role and required image label |
| Icon resolution | Station `IconResolutionContext`; theme symbols, injected validated SVG resolver and explicit provider map |
| Action metadata | Loop `ActionDescriptor`; shell `application/actions.ts` projects built-ins and enabled contribution descriptors |
| Invocation | `createActionRouter`: versioned application command port or closed trusted shell controller |
| Observable palette | React-free `createPaletteController`; stable immutable snapshots via `useSyncExternalStore` |
| Collections | Loop `CollectionSource` / `collectionView`; Station `collectionTree` adapts the existing TreeView |
| Property references | Loop `PropertyDescriptor`, `ValueReference`, `readReference`; PropertyInspector retains existing commit validation |
| Theme | Loop `SemanticTokens`; Station `semanticTheme` resolves explicit preference, system appearance and validated asset inputs |

Required-authority metadata never grants authority. `dock.apply` visibility actions
retain existing schemas, resource checks and current epoch/revision. Sidebar relocation,
overlays, layout history and palette opening are local shell actions. Installed
command actions derive from enabled contributions and open the existing input/output
widget. Opening never executes the contribution; Run retains package authority.
Missing contributions and unknown shell action IDs fail closed.

Palette, toolbar, account menu and settings navigation share descriptor identities.
`SemanticActionMenuItem` uses the same Base UI row as dropdown/context menus.
Rendered actions expose identity/provenance attributes; descriptors retain required
authority. Conditions recheck at invocation. Shortcuts yield to editors, text inputs,
games, dialogs, composition and already-handled input.

## Renderer boundary

Default desk styling (October 25, 2026): version 1 theme assets optionally include
`colors.sidebar` and a bounded `layout` object (`pageGutter`, `pageTitle`,
`rowHeight`, `toolbarHeight`, `bodySize`). The shared parser and `themeVariables`
export these to host and guest frames; older assets inherit renderer defaults.
Optional named `tints` preserve the widget tint controls as editable theme data,
with semantic fallbacks for older assets instead of embedded CSS palettes.
The visual Theme editor edits the same JSON with revision checks. Typeface aliases
honor authored fonts. The toolbar opens the selected theme asset when one is
assigned; otherwise it retains the application appearance toggle.

The default App desk is serialized dock/view configuration, with a local table
and two independently editable Markdown assets. Navigation retains its own Pages
widget. A plain single-widget slot omits its rail; an explicit tab presentation
keeps its rail visible at rest, and multiple children always receive a rail.
Context menus and widget controls remain
available, and compact notes disclose text/source/export tools without auto-saving.
Existing workspace restoration does not apply new starter content or layouts.

October 25 acceptance: Chrome loaded the built `dist/index.html` directly at
`http://127.0.0.1:3057/` without HMR. Data-cell edits survived reload; the visual
theme editor changed the rendered title token from 34px to 36px and restored it;
widget editing revealed removal/placement controls and keyboard Space opened the
widget settings. Document overflow checks passed at 375, 768, 1024 and 1440px.
The final console had no warnings/errors. Screenshot:
`outputs/workspace-style-final.jpg`. Package verification and the explicit root
typecheck/build logs are in `outputs/workspace-style-*.log`. Installed-native and
physical touch-device acceptance were not performed.

Registry extensions are trusted host registrations, never runtime-package code
loading. Persist IDs and typed properties, never React components or ReactNode.
`children` is the ordered default slot: menus accept button children, leaf controls
reject children and grid columns use a bounded enum. Missing elements or renderer
adapters fail explicitly. Descriptions cannot carry HTML, CSS or remote image URLs.

DOM adapters own drafts, focus, Base UI menu/popover presentation, tree navigation
and list keyboard movement. Disabled/loading controls reject events in DOM and
recording adapters. Events carry the emitting revision and monotonic sequence;
controllers publish a new frame after state changes. Normalized key/pointer input
contains no DOM objects. Local pointer coordinates are measurements, never placement.

Docking, `observeResize`, native presentation geometry and overlay positioning stay
in the host. No second store, global geometry patch or placement model is added.
Another renderer consumes the same definitions/events with its own focus/measurement.

Theme resolution is pure and explicit. Colors, typography, spacing, control/row
sizes, radius and icon sizes share `SemanticTokens`; portable elements map them to
existing semantic CSS variables. Authored themes retain the existing validated
parser and guest variable export. `ThemeAssets` remains the outer DOM compatibility
adapter for older host glyphs; new icons use explicit scoped inputs. Invalid edits
retain that asset's last valid theme without leaking themes between assets. Provider
references resolve only already registered providers; unknown icons are visibly missing.

## Proof and scope

`semantic-ui.test.tsx` and `fixtures/semantic-proof.tsx` consume the same definition.
Tests cover actual DOM markup and independent Loop RecordingSurface, missing
elements/adapters, extension defaults, icons/accessibility, light/dark themes,
references, routing denial, serialization and source boundaries. Loop tests cover
keyboard ownership, invalid paths, child constraints, snapshots/disposal and replay.
The architecture policy forbids React/platform imports in application contracts
and Station imports upstream.

Run `bun apps/station/tests/fixtures/semantic-proof-server.ts` for Chrome acceptance
at `http://127.0.0.1:3025/`. It uses the actual DOM adapter and feeds emitted events
into RecordingSurface, alongside migrated SourceFileTree and PropertyInspector.
This fixture is outside the product entrypoint and exposes no control endpoint.

October 20 Chrome evidence: isolated Station at port 3024 loaded shared toolbar and
palette and applied visibility through `dock.apply`. At port 3025, DOM activation
and keyboard selection reached RecordingSurface; tree ArrowDown selected
`src/view.ts`; Enter committed `Semantic Station`; explicit light mode resolved
`rgb(251, 251, 250)`. Final automated results follow the frozen-package gate.
Installed-native, mobile-device and another graphical renderer are separate acceptance.

## Final verification, October 20, 2026

Station `bun run verify`: 264 tests / 1,843 assertions, zero failures, package and
application typechecks, architecture enforcement, production build and six outside
packed consumers/private-import denial passed. Explicit `bun run typecheck` passed.
Upstream `bun run verify` passed 80 package/tooling tests plus external Bun/Node
consumers and declaration checks. Logs are in `outputs/semantic-ui/`. The upstream
UI-focused suite contains 8 tests / 35 assertions. No new architecture exception
was added; Station retains the existing 61. The active packages resolve inside
Station node_modules with no development links.

Final Chrome parity proof ran without HMR and had no warning/error console entries.
375, 768, 1024 and 1440px checks passed without horizontal content overflow after
wrapping the fixture diagnostic output. Earlier development HMR hook/root warnings
are superseded by the fresh production-bundled proof. The light button resolved
foreground `rgb(21, 21, 21)` on `rgb(251, 251, 250)`. Screenshot:
`outputs/semantic-ui/chrome-proof-light.jpg`. Native acceptance was not attempted.

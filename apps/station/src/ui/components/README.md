# Built-in UI components

`workspace/account-settings.tsx` owns optional hosted account enrollment, login,
browser names, presence and reviewed remote logout. `ui/lib/use-account.ts`
subscribes to the account transport service; server identity and authorization
remain outside React. Local desks/assets are not account-scoped or synchronized.

Before changing UI, inventory the existing components:

```powershell
rg --files apps/station/src/ui/components
```

Choose a responsibility-named component before inventing another style or control.

`ui/shortcut-recorder.tsx` adapts Stealth's recorder to Station's shared keycaps,
canonical combinations and caller-owned persistence. `workspace/shortcut-settings.tsx`
owns the same property-backed manager in the settings dialog and docked Desk
settings widget; use the docked presentation for Asset browser drag/drop.
`workspace/shortcut-host.tsx` resolves configured actions through the existing
docking owner. `workspace/quick-capture.tsx` is an ordinary widget using injected
revision-checked data mutations. Native registration is an injected service port,
not a guest capability or a separate shortcut record store.

| Location | Owns |
| --- | --- |
| `workspace/desk-scene.tsx`, `workspace/desk-overview.tsx` | Whole-shell View Transition snapshot, desk carousel and root configuration; inert projections are the fallback, with one live controller/service tree. |
| `workspace/asset-reference-picker.tsx` | Compatible identity references, search, clear, source opening and workspace-bounded asset drops. |
| `workspace/editor-presentation.tsx` | Compact reference anchoring, expanded focus dialog and persistent dock tab over one retained editor instance. |
| `workspace/editor-workbench.tsx`, `workspace/surface-definition-editor.tsx` | Selection-driven semantic hierarchy, typed Inspector, validated composition and inert responsive preview. |
| `workspace/authored-surface.tsx` | Shared authored structure and closed controller input/action bindings over PortableSurface. |
| `workspace/script-binding-property.tsx` | Compatible JSON script references, contract/effect disclosure and explicit expandable source editing. |
| `ui/collection-view.tsx` | Contract-defined CollectionSource projections into tree/list/grid with caller-owned selection. |
| `workspace/widget-target-picker.tsx` | Live slot references, compatible search and slot-reference drops, distinct from definition assets. |
| `workspace/svg-canvas.tsx` | Validated image preview, Station-owned selection geometry, pointer drawing/transforms and atomic gesture commits. |
| `workspace/asset-open-dialog.tsx` | Compatible editor choice independently of tab/peek/modal/full presentation. |
| `workspace/svg-asset-editor.tsx`, `workspace/svg-edit-canvas.tsx` | Retained source/drawing presentations, bounded SVG import/export and revision-guarded Apply over an opaque SVG-Edit frame. |
| `workspace/decision-asset-editor.tsx` | Inert editor decision rules with test traces. |
| `workspace/runtime-timeline.tsx` | Redacted lifecycle and command history from the shared diagnostics query. |
| `workspace/layout-widget.tsx` | Shared Layout presentation: `ownerId` renders real movable child widgets; controlled `pages` render local view sections. |
| `workspace/widget-frame.tsx`, `workspace/widget-settings.tsx` | Recoverable standard/compact/seamless chrome, hover actions, ellipsis controls (child context menus remain owned by their content), and the same settings on the flip side or selected-widget inspector. |
| `workspace/widget-definition-picker.tsx`, `workspace/widget-definition-view.tsx` | Folder-aware definition choices; read-only built-in recipes and editable source forks. |
| `ui/toggle-group.tsx` | Adapted Stealth toggle groups with icon tooltips, required selection, a shared animated wash, and instant keyboard/reduced-motion updates. |
| `ui/overlay-container.tsx` | Keeps menus, tooltips and dialogs within a focused widget's native dialog top layer. |
| `ui/icon-action.tsx`, `ui/action-tooltip.tsx` | Labelled icon controls and tooltips on real buttons/menu triggers. |
| `ui/dropdown-menu.tsx`, `ui/popover.tsx`, `ui/dialog.tsx` | Stealth/Base UI focus, dismissal, positioning, and keyboard behavior. |
| `ui/command-palette.tsx` | Ranked command UI; controlled raw query and optional separate matching query. |
| `ui/content-toolbar.tsx` | Composable left, center and right tracks; equal side tracks center search independently of actions. |
| `ui/collection-hierarchy.tsx` | Group disclosures in tree/grid presentations, independent zoom history and breadcrumbs over stable item IDs. |
| `workspace/asset-inspector.tsx` | Selected asset metadata editing, explicit editor opening and visual group membership. |
| `ui/table-toolbar.tsx` | Asset search, facets, selection tools; its parts require `TableToolbar`. |
| `ui/tree-view.tsx`, `workspace/source-file-tree.tsx` | Shared accessible tree and editor file actions; expansion and selection motion follows interaction. |
| `ui/inspector-branch.tsx` | Native collapsible inspection rows; disclosure state is local, using the shared docking tree geometry. |
| `workspace/component-permissions.tsx` | Component approval dialog and shared inspect/revoke ledger. |
| `workspace/side-dock-resize.tsx` | Accessible desktop side-dock edge; previews geometry and delegates saved width to the app. |
| `workspace/main-surface-toolbar.tsx` | Main surface control layout; accepts action descriptors and composed controls. |
| `workspace/dashboard-controls.tsx` | Direct widget creation, workspace width presets/exact sizing and entry into the existing widget arrangement mode. Heading controls stay outside the resized content grid. |
| `workspace/workspace-palette.tsx` | Integrated asset/panel/action search and scope controls. |
| `workspace/workspace-navigation.tsx` | Saved search, pins, exclusions, and filter editor in the navigation panel. |
| `workspace/navigation-filter-editor.tsx` | Search facets, ordering, restoring exclusions, and keyboard pin picker. |
| `ui/native-select.tsx` | Native single-choice fields with shared semantic tokens and visible focus. |
| `workspace/editor-controls.tsx` | Editor selection, contextual pane recovery, defaults and installed-source forking. |
| `workspace/theme-editor.tsx`, `ui/color-picker.tsx` | Visual theme edits over validated JSON and the Stealth picker. |
| `workspace/workspace-sharing.tsx` | Invitation forms and transient participant cursor presentation. Transport and state mutation are services. |
| `workspace/desk-controls.tsx`, `workspace/desk-settings-dialog.tsx` | Removable desk switching/search widget and the bounded, tabbed settings shell; recovery must not depend on this widget remaining placed. |
| `workspace/settings-section.tsx` | Shared settings hierarchy, rows, and nested confirmations. |
| `workspace/desk-widget-settings.tsx`, `workspace/workspace-package-settings.tsx` | Desk menu visibility, package availability/permissions, and reviewed source import. Commands open through the palette. |
| `../../widget-browser.tsx` | Widget creation and existing-instance movement in separate tabs; independently accessible source inspection, provenance, placement denials, fixed search controls, reset on dismissal, and app-owned reveal after placement. This is a placement picker, not the complete contribution registry. |

Use Tailwind utilities and semantic Stealth tokens for component appearance and states. Use existing Button, Input, and IconAction APIs. Put behavior on accessible primitives; do not build custom focus/dismissal handling. Forward native props and refs where components are reusable.

`apps/station/src/ui/tailwind.css` and `apps/station/src/ui/styles/station.css` retain geometry and connected dock chrome. `apps/station/src/ui/styles.css` contains legacy app styles; inspect the relevant rules before changing them. Avoid new global selectors or an override per caller. Move shared appearance into components when touching it; keep CSS for geometry, complex selectors, and animations that need it. `apps/station/src/ui/generated.css` is output, never source.

Search data and parsing live in `apps/station/src/ui/workspace-search.ts`, ranked matching in `apps/station/src/features/navigation/domain/command-search.ts`, saved navigation filters in `apps/station/src/core/navigation-filter.ts`, and persistence in `apps/station/src/features/workspace/application/store.ts`. Views receive callbacks; storage and dock mutations remain in the app/store. Built-in React components are distinct from authored or future capability-provided surfaces.

`ui/model-picker.tsx` adapts Stealth’s accessible select to headless Gateway metadata. `workspace/theme-number-field.tsx` preserves intermediate numeric drafts and commits valid values on blur/Enter; Escape restores the stored value. `workspace/widget-removal-actions.tsx` shares instance-only and atomic instance/slot removal. Theme reveal, fonts, and default color CSS are shared through `@station/ui`; the host retains tooltips and persistence ownership.

`ui/streaming-text.tsx` adapts Stealth's inert Markdown/code renderer with safe links, bounded nesting, reduced motion, copy and terminal reply states. `ui/copy-button.tsx` owns clipboard feedback. `workspace/chat-model-catalog.tsx` owns expanded public discovery/custom selection; catalog validation/cache/network bounds live in `features/ai/infrastructure/model-catalog.ts`. `workspace/chat-grants-dialog.tsx` stages multiple session grants atomically; dismissing never changes authority. Chat's message viewport follows only near the bottom, preserving upward reading and keeping all controls outside its scroll region.

`ui/settled-input.tsx` owns text drafts, IME, blur/Enter validation, Escape restore,
and adjacent errors. It is shared by spacing/radius and picker color/channel fields.
Source validation and bounded color parsing live in `core/theme-assets.ts` and
`core/theme-color.ts`; visual source patches always read the current store value.
SVG validation and its bounded content cache live in `services/svg-icons.ts`.

`workspace/desktop-update-settings.tsx` owns the App settings update presentation.
Its private client in `services/desktop-updates.ts` subscribes to the desktop's
immutable state via a session-secret HTTP membrane; it is never an SDK/provider
capability. Native lifecycle and updater effects remain in `desktop/`.

`../../browser-widget.tsx` composes the shared tabs, address input, icon actions and
explicit session grant for browser contexts. Bookmarks persist through the existing
dock reducer; provider transport and leases are services. `browser-presentation.ts`
observes existing geometry and hides retained native views for overlays/clipping;
it is not a placement system. Native Windows uses the patched WebView2 provider;
web fallback does not embed remote pages. Popup selectors mark their native-layer
occlusion explicitly with `data-native-overlay`; ordinary asset listboxes do not.


Asset groups are optional workspace metadata (`core/asset-groups.ts`), separate
from asset IDs, source paths and grants. The browser provides a virtual read-only
Built-in group, nested authored groups, expand/collapse, zoom, back/forward and up.
Removing a group preserves its assets and promotes child groups to its parent.
The asset inspector follows selection without invoking an editor. On narrow
surfaces an empty inspector yields its space to the collection.


`ui/property-inspector.tsx` renders serializable field descriptors from
`core/inspector-schema.ts`. String and multiline drafts use SettledInput; the core
metadata command repeats validation and source-access checks before persistence.
Read-only assets render text. `ui/status-badge.tsx` adapts the inspected Stealth
badge source into a static compact row label. TreeView's optional trailing actions
retain their own input ownership and stay in the same 28px row.

Grid groups use the same tracks and tile dimensions as assets. Expanded children
follow their group inline with a continuous run treatment across row wraps;
collections page at 20 direct children using a keyboard-accessible more tile.
There is no secondary nested grid or oversized group card.


`workspace/agent-access-settings.tsx` is trusted owner consent UI: task resource
selection, one-use pairing/protected credential-file handoff, renewal/revocation,
exact expansion review and redacted activity. Never render it inside an untrusted
contribution or treat a model-produced approval as an Apply action. Command policy
and connection secrets remain outside React.

`workspace/app-shell-widget.tsx` owns root App/Desktop geometry and composes named
surfaces, retained windows, task dock and overlay children. `widget-visual-editor`
edits definition slot defaults with inert `widget-preview` sketches;
`widget-instance-editor` shares the existing hierarchy/settings and live focus
surface. `desk-template-view` exposes source, forking and explicit desk creation.
Template snapshots/validation remain in `core/desk-templates.ts`, not these views.

`workspace/data-view.tsx` projects authorized data commands into table/board/graph
views; `data-source-editor` edits schema/provider source, while `record-graph`
contains reusable React Flow presentation with transient positions.
`script-playground` edits source and observes cancellable script operations; VM
and worker ownership remain in services, never in React. `action-button` renders
configured bounded commands and their toolbar pin/overflow projections.

`ui/property-editor.tsx` resolves shared typed editing/read-only controls and scoped
trusted editor overrides. `core/property-editors.ts` owns portable field intent;
asset fields take an explicit consumer-owned `reference` context. The store-free
`ui/asset-reference-picker.tsx` owns search/drop and one pending async submission;
the workspace path is a compatibility export. References remain inert identities;
creation/opening and authorized commits belong to their consumer, not the control.
commands retain validation. `ui/code-input.tsx` is a controlled store-free code
widget; it and SourceEditor share `ui/code-editor-theme.ts` and semantic syntax
tokens. JSON properties retain drafts on errors/conflicts and apply explicitly.
Data view uses these editors inside its record dialog, with paged tables and
source-bounded board moves. Custom document forms resolve active schema properties;
JSON and source recovery stay available. The asset-reference picker's optional
creation callback must invoke the consumer's compatible authorized create command.


Authoring/settings refresh (2026-10-19):
- `ui/inline-edit.tsx` composes SettledInput for click/keyboard rename, validation,
  Escape and focus return. Overview uses it for the workspace name.
- `ui/code-format-button.tsx` is shared by SourceEditor and CodeInput. Local
  Prettier parsers handle JS/TS/JSON/HTML/SVG/CSS; unsupported languages remain
  explicit. Formatting is one undoable transaction and rejects stale results.
- `workspace/new-asset-menu.tsx` supplies the toolbar and background/item context
  submenus. Built-in browser categories are virtual, read-only grouping metadata.
- `workspace/slot-settings.tsx` owns slot layout/contents controls. WidgetSettings
  location links navigate between widget, slot and parent; the inspector can
  select slots separately. Protected shell properties remain inspectable.
- DeskSettingsDialog renders the same content in a modal or a movable Desk
  settings widget. The Dock settings action reveals an existing settings instance.
- `workspace/svg-edit-canvas.tsx` uses pinned SVG-Edit 7.4.2 in an opaque frame;
  no Station SDK or network is available. Its clipboard is memory-only. Apply
  validates static SVG and checks the saved-source baseline. Drawing undo/redo
  belongs to SVG-Edit; file edits retain the shared IDE and source recovery.
- EditorSession's host-only source adapter lets TypeScript program drafts reuse
  EditorWorkspace's real movable panes without treating drafts as stored assets.

`workspace/ide-widget.tsx` exposes EditorWorkspace as a retargetable catalog widget.
Its shared dock operation retires the previous target panes before composing new
ones. Source permissions remain with the asset, and opening never executes it.


The application root injects ChatServices and shell ports. `ai-chat-widget.tsx` is a
conversation snapshot adapter; its application controller owns turns/reviews/tasks.
`shell-overlays.tsx` owns shell dialogs; the shell application workflow owns source
creation/opening. `asset-editor-renderers.tsx` is the exhaustive asset-kind adapter
map, distinct from widget renderer dispatch. `clock-widget.tsx` subscribes to one
retained scoped controller. Existing editor pane and DockHost ownership is retained.

Semantic UI (2026-10-20): `workspace/portable-surface.tsx` resolves the external Loop
element registry through trusted host adapters. `ui/semantic-action.tsx` renders
shared descriptors in menus and navigation; main toolbar and palette use the same
action identities. `../semantic-icons.tsx`, `../semantic-theme.tsx` and
`../collection-adapter.tsx` adapt explicit references, tokens and data sources.
See [Semantic UI](../../../../../docs/semantic-ui.md) for ownership and proofs.

| Component | Responsibility |
| --- | --- |
| `ui/morphing-editor.tsx` | Compact value field, lazy editor mounting, retained drafts and focus-managed overlay; reduced-motion and keyboard paths are immediate. |
| `workspace/window-controls.tsx` | Shared floating-window Close, Dock and optional Minimize controls. |
| `workspace/data-view-settings.tsx` | Nested settings and pinned toolbar menus sharing the same panel content. |
| `workspace/note-pages.tsx` | View-local page placements referencing note assets, recovery and manual ordering. |

Widgets with their own toolbars may opt into `WidgetFrame.integratedToolbar` and render `useWidgetToolbarControls()`. Host controls then occupy real toolbar space instead of overlapping content. Floating widgets retain their window titlebar.

`workspace/adaptive-widget-surface.tsx` gives compact authored Clock and Weather
content a bounded, centered presentation. Container queries use real available
width and height, keeping controls and controller state mounted while enlarging
metrics in roomy views. The shared scroll wrapper supplies definite height;
docking still owns placement. This is presentation adaptation, not a serialized
breakpoint or min/max-size contract. Alternate authored layouts and docking size
constraints remain future work.

`workspace/workspace-settings.tsx` owns the shared App, Workspaces and Keyboard
shortcuts settings shell. Workspace switching retains the selected section through
the shell overlay descriptor. Desk management reuses DeskScene and the existing
spatial overview. `workspace/workspace-deletion.tsx` shares the owner confirmation
between the switcher and settings; `ui/type-to-confirm.tsx` adapts the inspected
Stealth registry component using existing tokens, motion and utilities. The store
revalidates workspace identity, current name and the last-workspace guard.

# Widget system

Station keeps one headless placement document and a controlled React renderer.
This remains inside the app while its public contracts settle; there is no second
widget store or package extraction. `core/docking.ts`, `core/widget-actions.ts`
and `core/widget-definitions.ts` have no React dependency.

Desk controls are a compact overlay widget in that same graph, not a fixed shell
pill. Its grip uses normal window dragging; ellipsis opens instance/slot/source
controls. A persisted one-time reference prevents removal from being undone by
reload. This compact floating presentation does not yet implement arbitrary
ordered layers, passthrough or screen annotation.

WidgetFrame no longer intercepts content right-clicks. Child editors/records own
contextual actions; full widget settings stay on the ellipsis/inspector.
Shortcut bindings target definition assets and select full focus or bounded
quick-access presentation without remounting a second widget instance. See
[shortcuts](shortcuts-and-capture.md) and [adoption gaps](core-systems-review.md).

## Identity and ownership

A definition describes reusable behavior. A `Panel` is an instance with a stable
ID and saved configuration. The existing `Panel` and `stack` wire names remain
compatibility contracts. A slot is a layout node, not another content instance.
Layout widgets own slot trees in `DockLayout.containers`; the dashboard uses the
same row grid, splits, resize handles and drag coordinator. Moving an instance
changes its placement, not its mounted React parent or runtime scope.

Browser is a Layout composition whose default child factory creates ordinary
`browser-tab` instances. Its horizontal tabs, vertical tabs and carousel reference
the same children. Browser pages can move into other Layouts. Closing a Layout
promotes its children; package/editor ownership closes its owned subtree. Source,
placement and runtime authority have separate lifetimes.

## Commands

`reduceDock(layout, command, policy)` is pure. The controlled host decides when to
persist a successful result. The store adds bounded per-desk undo/redo. Rejected
commands retain the input layout; a `batch` commits all operations or none, as one
undo step. Batches deliberately accept only appearance, placement and removal
commands, so they cannot bypass asset/contribution service validation.

```ts
store.dispatchDock({
  type: "createWidget", id: "research", widget: "web-browser",
  chrome: "compact", target: { surface: "dashboard", intent: "append" },
});
store.dispatchDock({
  type: "configureWidget", panelId: "research", stackMode: "sidebar",
});
store.dispatchDock({
  type: "setLayoutArrangement", panelId: "research", arrangement: "rows",
});
store.dispatchDock({ type: "resizeRow", cellId, height: 480 });
store.dispatchDock(widgetCloseCommand(store.active().dock, id, {
  removeSlot: event.ctrlKey,
}));
store.dispatchDock(widgetBulkCloseCommand(store.active().dock, selectedIds, {
  removeSlot: true,
}));
```

Ctrl-close removes a sole backing slot; shared slots and floating instances fall
back to ordinary close. Bulk removal plans each close in order so the final
selected tab can remove its now-empty slot. Required shell instances remain
protected. Resizing a dashboard/Layout row stays local during a pointer gesture
and commits once on release. Arrow keys adjust 20 px, Shift+arrows 100 px; Home or
double-click restores automatic size.

## React composition

`DockHost` accepts the document, command dispatcher, policy and `renderPanel`.
`useDockController` exposes the controlled integration; `useDockDrag` separately
exposes high-frequency feedback. `LayoutWidget` renders an owner's real slots or
controlled local pages. `WidgetFrame` owns the standard chrome and flip state.
`WidgetSettings` is the same component in the menu, back and inspector.

```tsx
<DockWidget
  panel={panel} workspace={workspace} actions={actions}
  frame={{
    header: ({ title, dragHandle, actions }) => (
      <WidgetHeader heading={title} dragHandle={dragHandle} actions={actions}>
        <ConnectionStatus />
      </WidgetHeader>
    ),
    back: ({ panel, settings }) => (
      <><MyWidgetDetails id={panel.id} />{settings}</>
    ),
  }}
/>
```

The header callback can replace the heading, middle, actions, or whole header.
Callbacks and components never enter the saved document. `WidgetHeader` supplies
a complete drag surface with independently interactive controls. The back and
front stay mounted after first use; settings forms initialize only when opened.
Custom/seamless chrome retains ellipsis and inspector recovery controls.
Floating framed widgets use this same header with a compact docking action.
Float dragging repositions; Alt+drag enables docking targets. Keyboard pickup
uses Space/Enter, arrows, Alt for docking, and Escape to cancel.

`DockHost` also accepts `definitions`, `onOpenDefinition` and `onForkDefinition`;
the React controls request these operations without owning asset storage.

## Definition assets and compatibility

The [programmable authoring contract](programmable-authoring.md) owns authored
semantic structures, source/version snapshots, explicit upgrades/reconciliation,
source recovery and compact/expanded/tabbed editor presentation.

`BUILTIN_WIDGET_DEFINITIONS` is the code registry. The Asset browser projects its
entries as read-only `widget-definition` assets with a `widget.json` file. They
are not copied into workspace storage, granted services, or made editable.
Forking creates a fresh ordinary source asset. It does not install packages or
execute new host code. Editors validate recipes and the create overlay lists
valid authored recipes.

```json
{
  "version": 1,
  "widget": "web-browser",
  "title": "Research browser",
  "description": "Browser with vertical tabs",
  "defaults": {
    "chrome": "compact",
    "stackMode": "sidebar",
    "childWidget": "browser-tab"
  }
}
```

Instantiation snapshots the source identity, revision and recipe into the instance.
Later source edits affect future defaults. `setWidgetDefinition` explicitly applies
another compatible recipe with three-way override reconciliation (or an explicit
reset). It retains the instance ID,
children and live state only when the trusted renderer matches. Switching between
different renderers is rejected. Arbitrary schema adapters, editable built-in
React implementation source and package migration are not implemented by recipes.

## Interaction and performance

The creation surface is an anchored overlay with categories, search, definition
folders and an existing-instance tree. An append target creates the slot and
widget together; Empty slot remains an explicit choice. The Widget inspector
reuses Asset browser DragSelect for checkboxes, marquee, Ctrl/Shift and keyboard
selection. Escape exits direct selection. Shift+Q and Shift+W toggle the side and
bottom docks without selecting the Asset browser.

Drag feedback is isolated from widget content context. Mounted content is memoized;
unchanged destination feedback does not publish new objects. Collision checks
reject distant rectangles before recursive policy checks. Geometry still uses the
existing event-driven presentation registry. Portaled menu focus never scrolls a
backing slot, and nested popup layers inherit their parent's paint order.

Production builds explicitly use `--production`; development remains available
through the normal dev server. A local short-drag sample fell from approximately
610 ms to 160 ms of JavaScript work in development after these changes. This is
diagnostic evidence, not a frame-rate guarantee or native desktop benchmark.

## Root shells and desk templates

Each desk's dock document names a `rootId` in the same panel table. App shell and
Desktop shell are trusted root layout widgets. Their named main, sidebar, bottom
and dashboard surfaces reference the existing trees; floats and peeks retain their
instances and presentation host. Migration supplies an App shell root to old desks.
The root is configurable and selectable but cannot be moved, nested or removed.
Legacy navigation/home/browser identities keep their compatibility lifecycle.
Ordinary Navigation, Asset browser and Main surface widgets can also be created;
the Main surface renderer owns normal Layout slots rather than recursively mounting
the global main surface. Navigation instances currently share the desk's filter.

Desktop shell presents retained floating windows over a configurable solid
background, with a task dock that raises, minimizes and reopens those same IDs.
New top-level dashboard widgets on a desktop become windows in the same transaction.
Changing the root renderer retains placements; templates select initial placements.
Drawers and dialogs are React composition owned by the root; they are not arbitrary
executable guest surfaces or independent authorable modal definitions.

`desk-template` assets store `desk.json` with a version, title and source-only desk
setup. Built-in App desk/Desktop templates are virtual read-only assets in the
Built-in group. New desks explicitly choose a template. Save as template creates an
ordinary asset; Save as default also records that asset for future desks, retaining
the old default setup as a compatibility fallback. Instantiation clones root,
instances and slot identities. Editing source never silently changes existing desks.
Snapshot panel fields are allowlisted; no grants, task credentials, runtime output
or live services are exported. Invalid authored layouts are rejected before migration.

## Visual editing and previews

Widget definitions have optional `slots`, an array of tab lists of child seeds.
Each seed selects a trusted widget renderer, defaults and optional nested slots.
Shell definitions use four named slots in order: sidebar, main, bottom, dashboard.
Explicitly applying shell defaults adds these children to the existing surfaces;
current instances remain recoverable. Desk templates capture the complete layout.
Instantiation is atomic, allocates fresh IDs and checks depth and widget-count bounds.
Compatible definition switching preserves the existing instance's children. The
visual definition editor reads current source and uses the shared revision-checked
source operation on each change. Source remains available as a separate editor mode.
The editor offers catalog-to-slot copies and same-editor child moves; select
children to edit their defaults. A path from a different mounted editor is rejected
rather than interpreted against the receiving tree. Catalog definitions can still
be copied between editors. Built-in definitions must be forked before editing.
This source editor uses HTML drag payloads separately from live dock gestures;
its inert sketches are not a faithful live preview. Broader nested drag composition
and preview fidelity remain acceptance gaps after the user-reported failures.

The creation picker shows icons, descriptions and source provenance, with a
separate Inspect action. Placement denial disables creation, not source inspection.
Inspection opens the existing definition/content editor; it does not instantiate
the selected widget or grant runtime access. Missing original package source is
reported separately from the installed snapshot, which remains usable.

Widget editor is an ordinary widget, reusing the hierarchy/instance controls and
supporting direct selection, definition opening and the existing live focus surface.
Catalog/editor previews are explicitly inert renderer sketches: they never mount
live guest content, acquire capabilities, request location or start AI/browser
sessions. They are not screenshots or proof of a live renderer. Use Show live widget
for the real instance. `flippable` is an opt-in definition/instance default; ellipsis,
ellipsis and inspector settings remain available when flipping is off.

Arbitrary renderer source/state adapters and package extraction remain future work.

## Shared property widgets (2026-10-19)

`core/property-editors.ts` describes serializable text, number, boolean, choice,
JSON, Markdown and reference intent. `ui/components/ui/property-editor.tsx`
resolves editable and read-only presentation through one contract. Metadata
inspectors, Data view record dialogs, extension settings and custom document
properties use it. Numeric drafts reject empty coercion, hex and non-finite values;
optional empty numbers become null. Document strings preserve whitespace. Settled
fields support IME, Enter/blur, Escape restoration and async denial without losing
the draft. JSON uses CodeMirror, explicit Apply/Reset, and detects source changes
while a draft is open. Commands still repeat validation and revision checks.

Trusted host composition can provide a scoped `PropertyEditorsProvider` registration
with an ID, compatible types and component. A descriptor's optional `editor` picks
that registration; unknown or incompatible IDs fall back to the built-in type.
This is a host UI seam, not permission to install package JavaScript as React.
Sandbox-backed field-editor contributions and broader WYSIWYG surface editing remain future work; rich note editing is implemented.
Asset-reference editing retains the shared workspace picker, with consumer-supplied
compatibility and optional create/open actions through application services.

Source sessions and JSON properties share `code-editor-theme.ts`. Theme assets may
optionally specify `syntax: {keyword, string, number, function}` literal colors;
older themes derive these from existing colors. The theme editor exposes them.
Global legacy CodeMirror colors no longer override these semantic tokens.

Data view has sortable headers, bounded table pages, board counts/cards and a
keyboard-accessible record dialog. Its optional `readOnly` setting only narrows
presentation; provider/task policy remains authoritative. Board drag payloads bind
workspace/source/record IDs, and record properties also provide a keyboard path
to change grouping. Choosing another source never displays the previous source's
records. A source can be created directly from the reference picker.

Programmable widgets offer Counter, Checklist, Scratchpad and Temperature converter
as inert TypeScript source recipes, also visible as forkable Built-in definitions.
They acquire no workspace services. Create a stopped draft, review surface/service
access, Build snapshot, then Start. Source, input/schema, access and output have
separate sections. Runtime state in these examples lasts for the running instance;
saving a definition does not export its current state or bindings.

Verification on 2026-10-19: 227 tests passed, plus root typecheck, production build
and Component build. Browser checks used the dedicated local origin on port 3012:
inline source creation, sorted/filterable records, shared edits with retained focus,
invalid numeric drafts, read-only properties, JSON draft retention/reset, dark/light,
reduced motion and widths 375/768/1024/1440. A real wasm-rquickjs checklist build
rendered its surface and updated progress through a guest callback. Fresh-renderer
console checks reported no errors. This does not establish installed desktop or
live account pairing acceptance.


### Settings and slot inspection (2026-10-19)

Widget settings show location links to their parent and slot. The slot settings
surface owns split and contents controls; appearance and behavior stay on the
widget. Slots remain graph nodes, not duplicated widget instances. The hierarchy
can select a slot directly. Protected shell widgets show read-only properties.
Desk settings can be opened as a modal or docked as an ordinary settings widget;
its tabs and effects use the same settings content and services.

New app desks begin with a References data view and two asset-backed notes. Existing valid
saved desks retain their layout; creating/resetting from the built-in template
uses the new default. Desktop templates inherit the theme surface rather than
forcing a color.

The IDE widget can target an asset by stable ID, independently of its placement.
Changing targets retires the old Files/Code/Problems subtree atomically, preserving
the IDE instance and authored assets. Each target has a new editor session.
Task retargeting requires target-asset read authority and the current layout
revision; source writes still require their own permission. Opening the IDE never
builds or executes code.

# Docking system

The persistent presentation registry retains all backing slots for an instance and selects the connected, visible slot during measurement. Mobile navigation and the desktop sidebar can temporarily register the same singleton; detaching one slot must not unregister another. Resizing across the mobile breakpoint retains the mounted navigation content and changes only its measured placement.

The **dock** is the visible UI region. A **surface** is a placement region (`main`, `dashboard`, `sidebar`, `bottom`, or `toolbar`). A **stack** is a tab container with ordered panel IDs and one active ID. A **split** is a layout node joining two children. A **panel** is one placed instance with a stable ID. A **widget type** is a reusable content definition; multiple panels may use the same widget type.

```text

main surface

└─ split horizontal

   ├─ stack:main → workspace-home (active), asset-view:greeting

   └─ stack:second → asset-view:notes

sidebar surface → stack:sidebar → workspace-navigation

dashboard surface → grid:dashboard → cells → stacks → widgets

bottom surface → stack:bottom → asset-browser

```

`../../core/docking.ts` is headless. The v5 `DockLayout.panels` table is the compatibility representation of widget instances, separate from reusable definitions in `widget-catalog.ts`. `containers[ownerInstanceId]` owns a Layout, editor or contribution subtree in this same document. Every instance occurs exactly once, in a surface/owned subtree or floating placement. A Layout cannot contain itself or an ancestor. `validateDock` checks the entire graph after every structural command. Main allows four leaves, bottom one, and sidebar/dashboard/each Layout 100. Required navigation, home and browser instances retain their singleton IDs. Home stays in main, navigation stays in sidebar; the Asset browser can move between main tabs, dashboard/Layout slots and docks, but cannot be closed or floated. The bottom stack retains an empty slot after its last panel leaves and can be shown or hidden independently.

```tsx
const policy = {
  ...DEFAULT_DOCK_POLICY,

  main: { ...DEFAULT_DOCK_POLICY.main, maxLeafStacks: 4 },
} satisfies DockPolicy;

const store = createStore(storage, policy);

<DockHost
  layout={workspace.dock}
  policy={policy}
  onCommand={store.dispatchDock}
  renderPanel={renderPanel}
>
  <DockMainTabs />

  <DockSurface surface="main" />

  <DockSurface surface="sidebar" />
</DockHost>;
```

All placement routes call `dropReason` before `reduceDock` commits. Rejection returns the original layout reference. Target `ownerId` routes into an owned subtree; `nodeId` identifies its backing slot. Same-stack moves adjust insertion indices after source removal. Occupied single-instance slots swap atomically after validating both directions; multi-child stacks use explicit tab/reorder semantics. Ancestor/descendant swaps are rejected. Whole-stack relocation stays disabled; a Layout moves as its owning instance with its subtree.

`splitSlot` retains the existing children in one half and creates an intentional empty half. `addSlot` creates an empty backing slot; `removeSlot` rejects occupied slots, then collapses the removed empty branch. Closing a Layout promotes direct children to dashboard slots and retains their nested subtrees. Closing a composed editor/contribution removes its owned descendants atomically; closing a plain web widget removes only its instance; deleting asset content removes every referencing instance. These are distinct operations. Retained empty slots never disappear merely because their child moves away.

`migrateDock` repairs v1–v4 documents: deduplicates instance/node IDs, restores required instances, rejects incompatible locations and excessive/cyclic ownership, and retains existing content. v3 dashboard cells become asymmetric split rows. Serialized `stack` remains the Layout definition identity; old canned pages become an empty real child slot. Legacy `unit`/`unitId` metadata and browser/editor panel references migrate to `asset`/`assetId` and asset panel IDs, including tabs, nested containers, floats and maximization. Node and cell IDs remain stable. Workspace storage remains `unit-workspace.v4`, independently of dock version 4. Existing WIT/capability/artifact IDs are unchanged.

`react.tsx` owns drag, pointer previews, and rendering. The shared TabRail owns connected-tab styling wherever it renders. The single-stack main surface lends its real tab rail to the shell row; each split leaf renders its own rail while global controls stay in one toolbar. The app store persists successful layout commands. Surface visibility is saved in the active desk with its tree. The bounded, per-desk undo/redo stacks are in-memory layout history and exclude source edits, grants, and deletion. Continuous resize commands for one divider coalesce into one history step. The app clears history when underlying assets are deleted. Transient drag, diagnostics and tree disclosure state stay in React. The Widget inspector is a catalog widget using ordinary placement and removal; its disclosure tree includes Layout-owned children, floating instances, visibility icon actions, and shared diagnostics and editing switches.

One dnd-kit context serves all placements. Mouse/pen pickup starts after 6 px of heading movement. Touch holds for 400 ms within 6 px, then picks up in the same gesture; early release, movement or pointer cancellation cancels pending touch pickup. Holding no longer enters a separate edit gesture. Space/Enter picks up directly; arrows visit slot/rail targets, Enter commits and Escape cancels. The dashboard's Customize > Arrange widgets action and inspector switch expose quiet removal outlines; Done or Escape exits editing. Content controls, scrolling and games keep their own input. Dashboard width presets and an exact percentage field dispatch the same `resizeDashboard` command as its accessible edge grip; the heading and creation controls stay at the surface width.

`DockHost.widgetDragMode` defaults to `"physical"` for built-in and web widget headings. It accepts `"badge"` or a `(panel: Panel) => WidgetDragMode` resolver; `WidgetDragHandle.dragMode` overrides it for a particular handle. Tab handles, including mobile tabs, explicitly use the compact title badge. Physical pickup translates the existing mounted presentation and its Layout descendants without reparenting or cloning content. The backing slot remains a placeholder. Inactive content uses the compact metadata badge. Accepted drops update geometry through one validated command; cancellation restores the original frames. Occupied slots swap on release, Alt joins tabs and Shift selects a split edge. Normal dragging keeps target regions invisible and shows one subtle destination highlight with a short action label. Incompatible targets, including the source slot, are excluded from pointer and keyboard targeting after resolving Alt/Shift. Drop-zone diagnostics opt back into the complete borders and rejection reasons. Previewing never changes the document or history.

Closing, moving or floating the last tab retains its empty slot. There is no
delayed cleanup. Remove it explicitly with slot controls or Ctrl-close (one
atomic close-and-remove command). The legacy `autoClose` and `deferEmptySlot`
fields remain accepted for saved-document and command compatibility; neither
enables automatic removal.

Embedded dashboard and owned-layout rails use quiet underline navigation; shell
tabs retain connected chrome. Tab focus does not activate content: a pointer
click activates on release, leaving an inactive tab draggable without replacing
the current view. Arrow keys still activate tabs; Space/Enter retain dock pickup behavior.

Instance `contentSizing` selects `fill`, `scroll` or `clip` inside WidgetFrame.
The backing slot remains authoritative for geometry in every mode. Desk overview
uses an inert graph projection and optional View Transition snapshots; it does
not transform live retained frames or install a second docking model.

```tsx

<DockHost {...hostProps} widgetDragMode={(panel) =>

  panel.kind === "web-widget" ? "badge" : "physical"

} />

// A particular heading can override the host's default:

<WidgetDragHandle panelId={panel.id} title="Weather" dragMode="physical" />

```

The dock uses the locally owned Stealth tabs and controlled resizable panels. Grid orders bento rows; splits own normalized geometry inside each host-sized row. Ratios are bounded to 20–80% and rounded to four decimals. Narrow horizontal splits present vertically without changing the document. Native scoped scrollers retain content input and carousel swipes. The inspected Stealth sortable-grid/drop-target engines are not separate coordinators in this system.

`presentations.tsx` mounts each instance once outside slot parentage. Slot anchors supply measured fixed bounds, inherited clipping and interactivity. Batched reads and direct frame style writes follow native scrolling without React content rerenders or positional animation. Cached ancestor geometry predicts nested owner translation before the write, keeping children aligned in the same frame; resized owners receive a settling measurement. Observation ignores presentation writes and unrelated animation/scrollbar styles. `geometry.ts` shares visible bounds with collision/keyboard targeting, so clipped slots cannot receive drops through toolbar/dock chrome. Geometry observation is event-driven. Transfers and resize preserve iframe/editor/service state; inactive tabs stay mounted hidden/inert, and carousel pages stay mounted with only the active page interactive. Stealth ScrollArea owns the dashboard, widget content/settings and asset editor viewports, with thin overlay bars. The native browse strip accepts horizontal swipes; a non-passive wheel listener forwards heading/background input once to its backing scroller, while content-owned scrolling stays contained even at an edge. Native dnd-kit auto-scroll is disabled to avoid viewport jumps at pickup. Use the strip or tabs around opaque iframes, which retain their own input. Deletion unmounts, workspace or desk switching disposes the old host, and reload starts fresh sessions. Focus restoration reveals outer slots before nested content. Floating actions retain IDs and return-to-surface metadata; the shared header handle freely repositions its chrome and live subtree, ignoring dock targets unless Alt is held. Alt enables eligible docking targets without forcing tab intent. Keyboard arrows move a float by 10 pixels (Shift: 50); Alt visits docking targets. Escape restores the captured displayed bounds. Position commits are independent undo steps. Windows start at 420 by 360 with viewport clamping. The corner grip previews pointer resizing on the same geometry owner, commits one `resizeFloat` command on release, and cancels on Escape. Arrow keys resize by 10 pixels (Shift: 50). Saved dimensions survive reload and layout undo.

The built-in React widgets here are separate from WebAssembly Component execution. The exploratory [surface system](../../../../../docs/explorations/surface-system.md) is a proposal, not a plugin capability contract.

Built-in widget instances store optional `displayName` and `hideDisplayName` through
`configureWidget`, including layout history and reload recovery. Empty names restore
the catalog title. Hiding the heading retains an accessible name and compact pickup
and settings controls. Dock rails and the instance picker retain the chosen name.

`components/workspace/layout-widget.tsx` is the reusable React presentation used by
the Layout widget and other built-ins. Supply `ownerId` for a real owned dock tree, or controlled `pages`, `value`, and
`onValueChange` for local tab content.
Stable page IDs keep inactive content mounted; removing a page unmounts it. A local page can omit content when its view is rendered externally. Browser tabs
use real owned child instances instead of local pages.
Callers own selection, data, persistence and effects. This component adds no dock
instances or authority: actual movable children still use `DockOwnedLayout` and
the existing reducer, placement graph and coordinator.

Empty slots reveal tooltip icon actions on hover or keyboard focus (always available on touch), with removal at the top right. The add-slot area reserves its footprint and expands from a round plus into a destination only during pickup. Widget edit mode exposes undoable instance removal badges at the top right on hover/focus, always visible on touch. Edit mode uses a static outline without continuous wiggle. The optional legacy host wiggle prop applies only to dock tabs during drag.

Desktop side docks have a saved pixel width (`sidebarWidth`, default 310, bounded 220–520). `resizeSidebar` uses the same reducer/persistence/history as other geometry commands; continuous commands coalesce. The edge supports pointer preview, keyboard resize, Escape cancellation and double-click reset on either side. Mobile presentation retains the saved width without showing the desktop handle.

Editor parts and contribution children carry a logical `ownerId`. The reducer rejects cross-owner moves and invalid named-slot definition membership. `compose` creates an owned tree atomically; `setEditor` replaces its presentation subtree without changing the source asset. Editor parts are contextual definitions, never ordinary create-menu entries. See [local extensions](../../../../../docs/extensions.md).

Owned horizontal splits stack vertically below 560px of their measured width, as well as on narrow viewports. The responsive presentation balances the two panes without mutating the saved layout. Explicit resizing still commits through the same reducer. Backing slots and mounted content remain the same when orientation changes.

Editor recovery chooses an eligible slot in the same owner and dispatches `createEditorPart`; existing children retain their identities and mounted state. Reset pane layout is separate and still replaces the owner subtree. Desk controls are an ordinary compact floating widget in the same graph, with normal dragging, inspection and removal. Their one-time desk migration reference prevents removed controls from respawning; no parallel placement document is added.

`closeAndRemoveSlot` removes a sole docked instance and its backing slot in one validated, undoable command. Multi-tab slots and floating instances reject this operation; shell panels cannot close. Layout children retain the existing close/promotion policy. Authored assets remain untouched. AI Chat owns its message scroll region; wrapping it in the general widget ScrollArea would make its toolbar scroll with the parent.


## Composable widget controls and browser pages

`WidgetFrame` retains front content while the back is visible. Its ellipsis and
context menu share `WidgetSettings` with the flip side and Docking inspector's
selected-widget section. A seamless instance has no reserved header, but retains
hover/focus/touch controls. The inspector can select it directly or through the
tree and float alongside it; Escape cancels selection. Single-child Layout slots
omit a duplicate tab rail; nested Layouts default to compact chrome. Owned layouts
fill their available height without an extra ScrollArea, padding or trailing
add-slot footprint. Slot creation remains available in shared settings.

Host APIs use the existing graph and reducer:

```tsx
command({ type: "createWidget", widget: "stack", chrome: "seamless",
  childWidget: "browser-tab", target: { surface: "dashboard", intent: "append" } });
command({ type: "configurePanel", panelId, displayName: "Research", chrome: "compact" });
command({ type: "configureWidget", panelId, childWidget: "clock", stackMode: "tabs" });
// childWidget: null restores the picker for each new child.
<LayoutWidget ownerId={panelId} />
```

`useDockController` also exposes transient `openWidgetControls`, `focusPanel`,
`selectedWidget`/`selectWidget`, and `selectingWidget`/`setSelectingWidget`.
Focus promotes the existing presentation layer into a native modal dialog. It
changes measured bounds and interactivity without changing placement, React
parentage, or service ownership. Escape/Exit restores the original slot. Nested
menus/dialogs use the same top layer through `OverlayContainerContext`.

Web browser is a Layout configured to add ordinary `browser-tab` widgets. Each
page owns a one-page browser configuration and its own explicitly granted browser
acquisition. Tabs can move into another browser or a general Layout with the same
ID, draft UI and live service scope. Browser owners accept ordinary widgets too;
there is no new type restriction. Legacy browser bookmark arrays migrate once to
child panels, retaining the active bookmark. Closing an owner promotes its
children recoverably; closing a tab disposes that tab's scope. No native session
or authority is serialized. This is a built-in React/host API, not a new guest
capability or permission grant.


See [Widget system](../../../../../docs/widget-system.md) for the headless action
API, atomic bulk commands, row grids, customizable React header/back composition,
virtual definition assets and compatible recipe switching. Slots remain layout
nodes; Layout is an ordinary widget owning those nodes. Drag feedback has its own
context so pointer movement does not rerender every mounted settings/content tree.
The Widget inspector reuses Asset browser selection and bulk actions.


## Inspection and panel opening modes

The Widget inspector uses the shared Stealth TreeView with keyboard navigation,
inline status badges and actions in the same row. Header, tabs, search and selected
instance summary stay fixed; hierarchy, properties and diagnostics scroll within
their own pane. The eyedropper picks once, Ctrl/Shift adds, and selection reveals
ancestor rows. Selected settings reuse the widget chrome's settings component.

Side peeks contain individual panel instances, not entire existing dock surfaces.
`presentPanel` moves an eligible panel into a retained drawer placement represented
by the existing floating table, with an edge and visibility. Peeks can contain a
Layout owner with real child panels. `peekVisibility` hides/reopens without deleting
content; `activate` reveals hidden peeks; `dockFloat` restores the saved destination.
The context menu opens assets in a side peek, native-dialog modal focus, full-screen
main presentation, or their normal editor tab. Ownership/required-shell protections
still apply. Direct free dragging is disabled while inside a peek; existing placement
controls dock/move the panel. Native web content still follows the conservative
host-overlay occlusion policy; installed acceptance is separate.

The side dock supports vertical rows through the existing grid model. Adding its
first extra slot converts the saved stack to rows; existing desks retain their
presentation until edited. Source, stored IDs and protected shell lifetimes remain
independent of this layout convenience. The shell's bottom split uses instant
transitions for repeated Shift+W toggles.

## Compact toolbar widgets

The toolbar is one ordered stack rendered inline, with every child visible.
Only widget definitions whose placement policy declares a compact presentation
can enter it; Action Button is the initial implementation. It cannot split or
hide. Empty toolbar slots survive removal. All movement, reordering and undo use
the existing reducer/coordinator. Metadata reserves slot size while the same live
content remains in PresentationHost; aria-owns preserves logical accessibility
ownership. Fixed shell tools are protected internal definitions outside the user
insertion segment, not entries in the widget creation catalog.

v4 explicit action pins move into this surface once during migration. Unpinned
actions keep their real placement and no longer appear in toolbar overflow.
Toolbar authority is an explicit destination in command/task schemas.


Tab rails keep their add button immediately after the intrinsic tab list. The
list shrinks and scrolls on overflow while the add action stays outside the
scroller; the flexible end-drop target follows that action. Slot inspection uses
existing node IDs and dock commands, independently of widget selection.

Sidebar slots default to a plain single-widget presentation, including Navigation
and its Pages area. Plain slots render no tab rail; multiple children always
receive a visible rail. Explicit tab presentations remain visible at rest and
during drag. There is no collapsed or hover-revealed rail.

## Historical migration evidence

The original Station overhaul began at `46e9a56` on branch `station-overhaul`.
Its October 19, 2026 review recorded v4 migration, nested Layout ownership,
single-coordinator pointer/keyboard transfers, split/remove/undo, retained iframe
and editor state, restored placement after reload, and 375/768/1024/1440 px,
light/dark and reduced-motion checks. Touch hold/cancel used Edge; other browser
checks used the built-in browser. The final follow-up recorded 40 tests plus
typecheck/build. The sample P3 build produced 98,535 bytes, SHA-256
`3066f97957e7c77f8415c848ba686cb7205991bd4a71375a3d12d8676bded199`,
and invoked `Hello, World!`; this was the local sample, not older stored source.

This consolidates the removed migration diary on 2026-10-27. It is historical
evidence, not acceptance of subsequent changes. Current policy and geometry are
defined above; [Decisions](../../../../../docs/decisions.md) owns the retained
design choices. Generic provider suspension and marketplace authority remain
separate work; mounted inactive instances do not imply suspended services.

# Docking system

The persistent presentation registry retains all backing slots for an instance and selects the connected, visible slot during measurement. Mobile navigation and the desktop sidebar can temporarily register the same singleton; detaching one slot must not unregister another. Resizing across the mobile breakpoint retains the mounted navigation content and changes only its measured placement.

The **dock** is the visible UI region. A **surface** is a placement region (`main`, `dashboard`, `sidebar`, or `bottom`). A **stack** is a tab container with ordered panel IDs and one active ID. A **split** is a layout node joining two children. A **panel** is one placed instance with a stable ID. A **widget type** is a reusable content definition; multiple panels may use the same widget type.

```text
main surface
└─ split horizontal
   ├─ stack:main → workspace-home (active), asset-view:greeting
   └─ stack:second → asset-view:notes
sidebar surface → stack:sidebar → workspace-navigation
dashboard surface → grid:dashboard → cells → stacks → widgets
bottom surface → stack:bottom → asset-browser
```

`core.ts` is headless. The v4 `DockLayout.panels` table is the compatibility representation of widget instances, separate from reusable definitions in `widget-catalog.ts`. `containers[layoutInstanceId]` owns an ordinary subtree in this same document. Every instance occurs exactly once, in a surface/owned subtree or floating placement. A Layout cannot contain itself or an ancestor. `validateDock` checks the entire graph after every structural command. Main allows four leaves, sidebar/bottom one, and dashboard/each Layout 100. Required navigation, home and browser instances retain their singleton IDs. Home stays in main, navigation stays in sidebar; the Asset browser can move between main tabs, dashboard/Layout slots and docks, but cannot be closed or floated. The bottom stack retains an empty slot after its last panel leaves and can be shown or hidden independently.

```tsx
const policy = {
  ...DEFAULT_DOCK_POLICY,
  main: { ...DEFAULT_DOCK_POLICY.main, maxLeafStacks: 4 },
} satisfies DockPolicy;
const store = createStore(storage, policy);

<DockHost layout={workspace.dock} policy={policy} onCommand={store.dispatchDock} renderPanel={renderPanel}>
  <DockMainTabs />
  <DockSurface surface="main" />
  <DockSurface surface="sidebar" />
</DockHost>
```

All placement routes call `dropReason` before `reduceDock` commits. Rejection returns the original layout reference. Target `ownerId` routes into an owned subtree; `nodeId` identifies its backing slot. Same-stack moves adjust insertion indices after source removal. Occupied single-instance slots swap atomically after validating both directions; multi-child stacks use explicit tab/reorder semantics. Ancestor/descendant swaps are rejected. Whole-stack relocation stays disabled; a Layout moves as its owning instance with its subtree.

`splitSlot` retains the existing children in one half and creates an intentional empty half. `addSlot` creates an empty backing slot; `removeSlot` rejects occupied slots, then collapses the removed empty branch. Closing a Layout promotes direct children to dashboard slots and retains their nested subtrees. Closing an editor/web widget removes only its instance; deleting asset content removes every referencing instance. These are distinct operations. Retained empty slots never disappear merely because their child moves away.

`migrateDock` repairs v1–v4 documents: deduplicates instance/node IDs, restores required instances, rejects incompatible locations and excessive/cyclic ownership, and retains existing content. v3 dashboard cells become asymmetric split rows. Serialized `stack` remains the Layout definition identity; old canned pages become an empty real child slot. Legacy `unit`/`unitId` metadata and browser/editor panel references migrate to `asset`/`assetId` and asset panel IDs, including tabs, nested containers, floats and maximization. Node and cell IDs remain stable. Workspace storage remains `unit-workspace.v4`, independently of dock version 4. Existing WIT/capability/artifact IDs are unchanged.

`react.tsx` owns drag, pointer previews, and rendering. The shared TabRail owns connected-tab styling wherever it renders. The single-stack main surface lends its real tab rail to the shell row; each split leaf renders its own rail while global controls stay in one toolbar. The app store persists successful layout commands. Surface visibility is session-only: serialization clears `hidden` while retaining every tree. The bounded, per-workspace undo/redo stacks are in-memory layout history and exclude source edits, grants, and deletion. Continuous resize commands for one divider coalesce into one history step. The app clears history when underlying assets are deleted. Transient drag, diagnostics and tree disclosure state stay in React. The docking inspector is a catalog widget using ordinary placement and removal; its disclosure tree includes Layout-owned children, floating instances, visibility icon actions, and shared diagnostics and editing switches.

One dnd-kit context serves all placements. Mouse/pen pickup starts after 6 px of heading movement. Touch holds for 400 ms within 6 px, then picks up in the same gesture; early release, movement or pointer cancellation cancels pending touch pickup. Holding no longer enters a separate edit gesture. Space/Enter picks up directly; arrows visit slot/rail targets, Enter commits and Escape cancels. The dashboard's Edit widgets button and inspector switch expose quiet removal outlines; Done or Escape exits editing. Content controls, scrolling and games keep their own input.

`DockHost.widgetDragMode` defaults to `"physical"` for built-in and web widgets. It accepts `"badge"` or a `(panel: Panel) => WidgetDragMode` resolver; `WidgetDragHandle.dragMode` overrides it for a particular handle. Physical pickup translates the existing mounted presentation and its Layout descendants without reparenting or cloning content. The backing slot remains a placeholder. Inactive tab content and other panels use the compact metadata badge. Accepted drops update geometry through one validated command; cancellation restores the original frames. Occupied slots swap on release, Alt joins tabs and Shift selects a split edge. Normal dragging keeps target regions invisible and shows one subtle destination highlight with a short action label. Incompatible targets, including the source slot, are excluded from pointer and keyboard targeting after resolving Alt/Shift. Drop-zone diagnostics opt back into the complete borders and rejection reasons. Previewing never changes the document or history.

```tsx
<DockHost {...hostProps} widgetDragMode={(panel) =>
  panel.kind === "web-widget" ? "badge" : "physical"
} />
// A particular heading can override the host's default:
<WidgetDragHandle panelId={panel.id} title="Weather" dragMode="physical" />
```

The dock uses the locally owned Stealth tabs and controlled resizable panels. Grid orders bento rows; splits own normalized geometry inside each host-sized row. Ratios are bounded to 20–80% and rounded to four decimals. Narrow horizontal splits present vertically without changing the document. Native scoped scrollers retain content input and carousel swipes. The inspected Stealth sortable-grid/drop-target engines are not separate coordinators in this system.

`presentations.tsx` mounts each instance once outside slot parentage. Slot anchors supply measured fixed bounds, inherited clipping and interactivity. Batched reads and direct frame style writes follow native scrolling without React content rerenders or positional animation. Cached ancestor geometry predicts nested owner translation before the write, keeping children aligned in the same frame; resized owners receive a settling measurement. Observation ignores presentation writes and unrelated animation/scrollbar styles. `geometry.ts` shares visible bounds with collision/keyboard targeting, so clipped slots cannot receive drops through toolbar/dock chrome. Geometry observation is event-driven. Transfers and resize preserve iframe/editor/service state; inactive tabs stay mounted hidden/inert, and carousel pages stay mounted with only the active page interactive. Stealth ScrollArea owns the dashboard, widget content/settings and asset editor viewports, with thin overlay bars. The native browse strip accepts horizontal swipes; a non-passive wheel listener forwards heading/background input once to its backing scroller, while content-owned scrolling stays contained even at an edge. Native dnd-kit auto-scroll is disabled to avoid viewport jumps at pickup. Use the strip or tabs around opaque iframes, which retain their own input. Deletion unmounts, workspace switching disposes the old host, and reload starts fresh sessions. Focus restoration reveals outer slots before nested content. Floating actions retain IDs and return-to-surface metadata; the shared header handle repositions a window away from slot targets or docks it over a target. Position commits are independent undo steps. Windows currently use a fixed 420×360 initial extent with viewport clamping.

The built-in React widgets here are separate from WebAssembly Component execution. The exploratory [surface system](../../docs/explorations/surface-system.md) is a proposal, not a plugin capability contract.

Empty slots reveal tooltip icon actions on hover or keyboard focus (always available on touch), with removal at the top right. The add-slot area reserves its footprint and expands from a round plus into a destination only during pickup. Widget edit mode exposes undoable instance removal badges at the top right on hover/focus, always visible on touch. Edit mode uses a static outline without continuous wiggle. The optional legacy host wiggle prop applies only to dock tabs during drag.

Desktop side docks have a saved pixel width (`sidebarWidth`, default 310, bounded 220�520). `resizeSidebar` uses the same reducer/persistence/history as other geometry commands; continuous commands coalesce. The edge supports pointer preview, keyboard resize, Escape cancellation and double-click reset on either side. Mobile presentation retains the saved width without showing the desktop handle.

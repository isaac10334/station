# Docking system

The **dock** is the visible UI region. A **surface** is a placement region (`main`, `dashboard`, `sidebar`, or `bottom`). A **stack** is a tab container with ordered panel IDs and one active ID. A **split** is a layout node joining two children. A **panel** is one placed instance with a stable ID. A **widget type** is a reusable content definition; multiple panels may use the same widget type.

```text
main surface
└─ split horizontal
   ├─ stack:main → workspace-home (active), unit-view:greeting
   └─ stack:second → unit-view:notes
sidebar surface → stack:sidebar → workspace-navigation
dashboard surface → grid:dashboard → cells → stacks → widgets
bottom surface → stack:bottom → unit-browser
```

`core.ts` is headless. The v4 `DockLayout.panels` table is the compatibility representation of widget instances, separate from reusable definitions in `widget-catalog.ts`. `containers[layoutInstanceId]` owns an ordinary subtree in this same document. Every instance occurs exactly once, in a surface/owned subtree or floating placement. A Layout cannot contain itself or an ancestor. `validateDock` checks the entire graph after every structural command. Main allows four leaves, sidebar/bottom one, and dashboard/each Layout 100. Required navigation, home and browser instances retain their singleton IDs and explicit restrictions.

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

`splitSlot` retains the existing children in one half and creates an intentional empty half. `addSlot` creates an empty backing slot; `removeSlot` rejects occupied slots, then collapses the removed empty branch. Closing a Layout promotes direct children to dashboard slots and retains their nested subtrees. Closing an editor/web widget removes only its instance; deleting unit content removes every referencing instance. These are distinct operations. Retained empty slots never disappear merely because their child moves away.

`migrateDock` repairs v1–v4 documents: deduplicates instance/node IDs, restores required instances, rejects incompatible locations and excessive/cyclic ownership, and retains existing content. v3 dashboard cells become asymmetric split rows. Serialized `stack` remains the Layout definition identity; old canned pages become an empty real child slot. Workspace storage remains `unit-workspace.v4`, independently of dock version 4. Existing WIT/capability/artifact IDs are unchanged.

`react.tsx` owns drag, pointer previews, and rendering. The single-stack main surface lends its real tab rail to the shell row; each split leaf renders its own rail while global controls stay in one toolbar. The app store persists successful layout commands. Surface visibility is session-only: serialization clears `hidden` while retaining every tree. The bounded, per-workspace undo/redo stacks are in-memory layout history and exclude source edits, grants, and deletion. Continuous resize commands for one divider coalesce into one history step. The app clears history when underlying units are deleted. Transient drag, diagnostics and tree disclosure state stay in React. The docking inspector is a catalog widget using ordinary placement and removal; its disclosure tree includes Layout-owned children, floating instances, visibility icon actions, and shared diagnostic/wiggle switches.

One dnd-kit context serves all placements. Widget headings (including inactive tab titles) are the dedicated pickup targets and require 400 ms within 6 px for pointer pickup; early release, movement before activation, capture loss or Escape cancels. Space/Enter picks up immediately by keyboard; arrows visit slot/rail targets, Enter commits and Escape cancels. Tab rails expose inactive child titles. They suppress their own tab navigation only for handle events. Alt joins tabs; Shift chooses a split edge. The destination preview is transient geometry with a readable rejection reason, and the ghost contains only metadata. A drop commits one command and undo step.

The dock uses the locally owned Stealth tabs and controlled resizable panels. Grid orders bento rows; splits own normalized geometry inside each host-sized row. Ratios are bounded to 20–80% and rounded to four decimals. Narrow horizontal splits present vertically without changing the document. Native scoped scrollers retain content input and carousel swipes. The inspected Stealth sortable-grid/drop-target engines are not separate coordinators in this system.

`presentations.tsx` mounts each instance once outside slot parentage. Slot anchors supply measured fixed bounds, inherited clipping and interactivity; Motion animates position, avoiding scaled live text. `geometry.ts` shares visible bounds with collision/keyboard targeting, so clipped slots cannot receive drops through toolbar/dock chrome. Geometry observation is event-driven. Transfers and resize preserve iframe/editor/service state; inactive tabs stay mounted hidden/inert, and carousel pages stay mounted with only the active page interactive. The native browse strip accepts horizontal swipes; horizontal wheel input forwards to its backing scroller while content-owned scrolling remains local. Use the strip or tabs around opaque iframes, which retain their own input. Deletion unmounts, workspace switching disposes the old host, and reload starts fresh sessions. Focus restoration reveals outer slots before nested content. Floating actions retain IDs and return-to-surface metadata; the shared header handle repositions a window away from slot targets or docks it over a target. Position commits are independent undo steps. Windows currently use a fixed 420×360 initial extent with viewport clamping.

The built-in React widgets here are separate from WebAssembly Component execution. The exploratory [surface system](../../docs/explorations/surface-system.md) is a proposal, not a plugin capability contract.

Empty slots reveal tooltip icon actions on hover or keyboard focus (always available on touch), with removal at the top right. The add-slot area reserves its footprint and expands from a round plus into a destination only during pickup. Heading pressing/moving styles are transient; optional wiggle stops on release/cancel and respects reduced motion.

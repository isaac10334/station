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

`core.ts` is headless. `DockLayout` contains panel metadata, trees, active tabs, sizing, floating widget positions, and the maximized panel. Every panel occurs once, in one tree or in the floating map. `DEFAULT_DOCK_POLICY` is host-owned executable configuration and is never serialized. It lists accepted tags, intents, splitting and stack relocation flags, and `maxLeafStacks`. Main allows four leaves by default; sidebar and bottom have one. Dashboard is a grid with widget-only placement. Navigation, home, and browser have stable singleton IDs.

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

All placement routes call `dropReason` before `reduceDock` commits. The reducer validates again and returns the original layout reference on rejection. `placementReason` checks tags and surface rules; `resolveIntent` gives Alt priority over Shift when a drag requests a tab or split. A tab stays in its source stack until the move commits. Same-stack moves adjust the insertion index after removal. Whole-stack relocation is disabled by policy; there is no implicit drag from the entire stack.

`migrateDock` repairs saved v1 and v2 documents and validates v3 documents. It deduplicates panel IDs, rejects incompatible locations, merges excess stacks in traversal order, and restores required singleton panels. The v2 upgrade replaces removed starter widgets and adds the weather, clock, and stack once. Floating widgets retain their IDs and can return to their recorded surface. The sidebar side is an explicit command. The inspector is a developer overlay and has no panel or drop target.

`react.tsx` owns drag, pointer previews, and rendering. The single-stack main surface lends its real tab rail to the shell row; each split leaf renders its own rail while global controls stay in one toolbar. The app store persists successful layout commands. Surface visibility is session-only: serialization clears `hidden` while retaining every tree. The bounded, per-workspace undo/redo stacks are in-memory layout history and exclude source edits, grants, and deletion. Continuous resize commands for one divider coalesce into one history step. The app clears history when underlying units are deleted. Transient drag and inspector state stays in React.

The dock uses the existing Stealth tabs and resizable panels. We inspected `@stealth/scroll-area`, which adds an overlay bar and fade behavior with `@base-ui/react`. Dock bodies contain nested scrollers, drag targets, and CodeMirror, so they use scoped native `scrollbar-width: thin` styling instead of another scroll wrapper. This preserves native keyboard scrolling and nested scroll ownership.

The built-in React widgets here are separate from WebAssembly Component execution. The exploratory [surface system](../../docs/explorations/surface-system.md) is a proposal, not a plugin capability contract.

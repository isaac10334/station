# Workspace surfaces

**Status: exploratory.** This note records design questions, not an implemented contract or a commitment to a particular renderer. For the current layout, placement, and drag behavior, read [the docking contract](../../src/docking/README.md).

## Direction

- Let people place built-in views and, eventually, views contributed by different kinds of assets in a coherent workspace. The host owns placement, focus, persistence, and permission checks.
- Keep built-in React UI distinct from a future bounded UI capability for WebAssembly Components or other sandboxed extensions. A plugin should not gain arbitrary DOM or app storage access by contributing a view.
- Treat **view**, **surface**, **placement**, **scope**, and **policy** as working vocabulary. Test these names against a real extension before making them public contracts.

## Questions to resolve

- What is the smallest useful description and update protocol for an asset-contributed view? Which elements, events, and effects may the host accept, and how should it bound depth, payload size, and update rate?
- How do view identity, focus, navigation, layout undo, and an asset's own document undo differ? What should survive reload, workspace switching, artifact updates, or revoked grants?
- When should a view move between a tab, drawer, dialog, floating window, or full page, and should a shareable URL name the view without fixing its presentation?
- How should pointer, keyboard, drag, drop, and shortcut scopes interact across built-in views, dialogs, editors, games, and plugin content? How should incompatible drop targets be explained and announced?
- Should custom surfaces be host-installed extensions, granted asset capabilities, or both? Where should a reusable contract live: this app or Loop Kit?
- How should registration and grant review work for a new or changed import? Keep registration, grants, configuration, artifact identity, and transient view state distinct.

## Candidate slices

- **Floating windows:** Built-in React widget panels now have an in-app float with stable identity, viewport clamping, and a return action. A general contributed-view float contract and modal focus rules remain exploratory.
- **Broader tiling:** Station now has real nested Layout children, backing splits, insertion previews, keyboard movement and unique placements. Generic contributed-surface registration and independently resizable row extents remain exploratory.
- **Plugin surface:** Define one narrow, revocable UI capability and verify it with a real current artifact. Test malformed events, missing grants, revocation, and stale builds before expanding the element catalog.
- **Portable rendering:** Compare a constrained declarative DOM surface with a bounded canvas or WebGPU surface through a typed protocol. Test accessibility, hit testing, resize, device loss, and resource limits with a real interactive sample.

## Adjacent work

Real identity and collaboration, grant-review interactions, and visual cleanup of the Source, Artifact, Run, and Settings views need separate slices. They are not prerequisites for exploring surfaces.

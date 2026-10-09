# Built-in UI components

Before changing UI, inventory the existing components:

```powershell
rg --files src/components
```

Choose a responsibility-named component before inventing another style or control.

| Location | Owns |
| --- | --- |
| `ui/icon-action.tsx`, `ui/action-tooltip.tsx` | Labelled icon controls and tooltips on real buttons/menu triggers. |
| `ui/dropdown-menu.tsx`, `ui/popover.tsx`, `ui/dialog.tsx` | Stealth/Base UI focus, dismissal, positioning, and keyboard behavior. |
| `ui/command-palette.tsx` | Ranked command UI; controlled raw query and optional separate matching query. |
| `ui/table-toolbar.tsx` | Asset search, facets, selection tools; its parts require `TableToolbar`. |
| `ui/inspector-branch.tsx` | Native collapsible inspection rows; disclosure state is local, using the shared docking tree geometry. |
| `workspace/component-permissions.tsx` | Component approval dialog and shared inspect/revoke ledger. |
| `workspace/side-dock-resize.tsx` | Accessible desktop side-dock edge; previews geometry and delegates saved width to the app. |
| `workspace/main-surface-toolbar.tsx` | Main surface control layout; accepts action descriptors and composed controls. |
| `workspace/workspace-palette.tsx` | Integrated asset/panel/action search and scope controls. |
| `workspace/workspace-navigation.tsx` | Saved search, pins, exclusions, and filter editor in the navigation panel. |
| `workspace/navigation-filter-editor.tsx` | Search facets, ordering, restoring exclusions, and keyboard pin picker. |
| `../widget-browser.tsx` | Widget creation and existing-instance movement in separate tabs; fixed search controls, reset on dismissal, and app-owned reveal after placement. |

Use Tailwind utilities and semantic Stealth tokens for component appearance and states. Use existing Button, Input, and IconAction APIs. Put behavior on accessible primitives; do not build custom focus/dismissal handling. Forward native props and refs where components are reusable.

`src/tailwind.css` and `src/styles/station.css` retain geometry and connected dock chrome. `src/styles.css` contains legacy app styles; inspect the relevant rules before changing them. Avoid new global selectors or an override per caller. Move shared appearance into components when touching it; keep CSS for geometry, complex selectors, and animations that need it. `src/generated.css` is output, never source.

Search data and parsing live in `src/workspace-search.ts`, ranked matching in `src/lib/command-search.ts`, saved navigation filters in `src/navigation-filter.ts`, and persistence in `src/model.ts`. Views receive callbacks; storage and dock mutations remain in the app/store. Built-in React components are distinct from authored or future capability-provided surfaces.

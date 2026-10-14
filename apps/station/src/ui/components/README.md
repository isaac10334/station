# Built-in UI components

Before changing UI, inventory the existing components:

```powershell
rg --files apps/station/src/ui/components
```

Choose a responsibility-named component before inventing another style or control.

| Location | Owns |
| --- | --- |
| `ui/icon-action.tsx`, `ui/action-tooltip.tsx` | Labelled icon controls and tooltips on real buttons/menu triggers. |
| `ui/dropdown-menu.tsx`, `ui/popover.tsx`, `ui/dialog.tsx` | Stealth/Base UI focus, dismissal, positioning, and keyboard behavior. |
| `ui/command-palette.tsx` | Ranked command UI; controlled raw query and optional separate matching query. |
| `ui/table-toolbar.tsx` | Asset search, facets, selection tools; its parts require `TableToolbar`. |
| `ui/tree-view.tsx`, `workspace/source-file-tree.tsx` | Shared accessible tree and editor file actions; expansion and selection motion follows interaction. |
| `ui/inspector-branch.tsx` | Native collapsible inspection rows; disclosure state is local, using the shared docking tree geometry. |
| `workspace/component-permissions.tsx` | Component approval dialog and shared inspect/revoke ledger. |
| `workspace/side-dock-resize.tsx` | Accessible desktop side-dock edge; previews geometry and delegates saved width to the app. |
| `workspace/main-surface-toolbar.tsx` | Main surface control layout; accepts action descriptors and composed controls. |
| `workspace/workspace-palette.tsx` | Integrated asset/panel/action search and scope controls. |
| `workspace/workspace-navigation.tsx` | Saved search, pins, exclusions, and filter editor in the navigation panel. |
| `workspace/navigation-filter-editor.tsx` | Search facets, ordering, restoring exclusions, and keyboard pin picker. |
| `ui/native-select.tsx` | Native single-choice fields with shared semantic tokens and visible focus. |
| `workspace/editor-controls.tsx` | Editor selection, contextual pane recovery, defaults and installed-source forking. |
| `workspace/theme-editor.tsx`, `ui/color-picker.tsx` | Visual theme edits over validated JSON and the Stealth picker. |
| `workspace/workspace-sharing.tsx` | Invitation forms and transient participant cursor presentation. Transport and state mutation are services. |
| `workspace/desk-controls.tsx`, `workspace/desk-settings-dialog.tsx` | Always-available desk switching/search and the bounded, tabbed settings shell. |
| `workspace/settings-section.tsx` | Shared settings hierarchy, rows, and nested confirmations. |
| `workspace/desk-widget-settings.tsx`, `workspace/workspace-package-settings.tsx` | Desk menu visibility, package availability/permissions, and reviewed source import. Commands open through the palette. |
| `../../widget-browser.tsx` | Widget creation and existing-instance movement in separate tabs; fixed search controls, reset on dismissal, and app-owned reveal after placement. |

Use Tailwind utilities and semantic Stealth tokens for component appearance and states. Use existing Button, Input, and IconAction APIs. Put behavior on accessible primitives; do not build custom focus/dismissal handling. Forward native props and refs where components are reusable.

`apps/station/src/ui/tailwind.css` and `apps/station/src/ui/styles/station.css` retain geometry and connected dock chrome. `apps/station/src/ui/styles.css` contains legacy app styles; inspect the relevant rules before changing them. Avoid new global selectors or an override per caller. Move shared appearance into components when touching it; keep CSS for geometry, complex selectors, and animations that need it. `apps/station/src/ui/generated.css` is output, never source.

Search data and parsing live in `apps/station/src/ui/workspace-search.ts`, ranked matching in `apps/station/src/ui/lib/command-search.ts`, saved navigation filters in `apps/station/src/core/navigation-filter.ts`, and persistence in `apps/station/src/core/model.ts`. Views receive callbacks; storage and dock mutations remain in the app/store. Built-in React components are distinct from authored or future capability-provided surfaces.

`ui/model-picker.tsx` adapts Stealth’s accessible select to headless Gateway metadata. `workspace/theme-number-field.tsx` preserves intermediate numeric drafts and commits valid values on blur/Enter; Escape restores the stored value. `workspace/widget-removal-actions.tsx` shares instance-only and atomic instance/slot removal. Theme reveal, fonts, and default color CSS are shared through `@station/ui`; the host retains tooltips and persistence ownership.

# Workspace presentation acceptance — 2026-10-22

Scope: the local production web renderer at `http://127.0.0.1:3055/`, using an isolated authoring/acceptance workspace. The independently installed desktop canary was not restarted, rebuilt or updated.

- `bun run typecheck`, `bun run build`, and `bun run repo check` pass. Architecture remains at 61 reviewed pre-existing exceptions.
- `bun test tooling tests apps/station/tests`: 292 passed. An isolated DOM fixture additionally exercises retained property drafts, nested/pinned settings, column visibility and guide-line drag event ordering. The fixture avoids mixing Base UI's module-level browser detection with earlier SSR imports in the same test process.
- Fresh production-tab evidence: page nesting/collapsing/opening; pinned Filter and Properties panels; source creation from the nested picker; inline typed cell editing; Alt+arrow manual ordering; hidden properties; configuration retention across reload; floating Dock control; desk creation/switching; root App→Desktop→App with all existing slots, record edits, outline and pinned menus retained.
- Compact Markdown Description remains one row. Opening mounts the rich editor; Source edits survive dismissal/reopening without committing. Explicit Save commits; Escape closes immediately. Narrow property popup measured 329 px within a 376 px viewport, with a 575 px height.
- Layout measurements at actual CSS widths 375, 768, 1024 and 1440 px show no document-level horizontal overflow. The narrow master overview retains reachable Done, carousel and root controls.
- Reduced motion: live media emulation produces `data-desk-motion="instant"` with a zero-duration recede animation. Emulation and viewport overrides were restored after acceptance.
- The master overview captures the real entire app shell at scale .62, rather than mounting a second controller/service tree. New desks use an owned seamless Pages widget. A single sidebar rail has zero height and is inert; a dock drag reveals it, and multi-tab rails remain visible.
- Browser console checks after source editing, menus, floating Dock and root switching were clean. Light-theme Properties uses RGB 255/255/255 background and 21/21/21 foreground; dark mode was restored.
- Reconnected native browser input completed real pointer acceptance: dragging the record handle moved Prepare workspace before Second record; dragging the floating titlebar moved the same widget by 257/61 CSS pixels; the resize handle grew it by 117/56 CSS pixels. Docking retained its record edits and view configuration. Keyboard pickup revealed both previously hidden sidebar rails; Escape restored their zero-height/inert state.

Two interaction bugs found during this pass were fixed: seamless host buttons overlapped Data view's own settings trigger, and returning to App shell re-instantiated prefab slots. Host toolbar integration removes overlap; the root picker explicitly preserves current slot seeds. Both retain the existing docking authority model.

The earlier raw browser transport could not complete pointer drags; the reconnected native browser input interface resolved that gap. Guide rendering/order changes also have DOM drag-event regression coverage. Installed native move/resize/minimize acceptance remains separate from the verified web floating-window behavior.

Evidence:

- `outputs/station-data-view-settings.png`
- `outputs/station-master-workspace-overview.png`
- `outputs/station-overview-narrow.png`
- `outputs/station-morphing-markdown-overlay.png`
- `outputs/station-floating-window-polish.png`

See [state and assets](state-and-assets.md) for current persistence and service ownership.

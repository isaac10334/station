# Useful Canary — October 27, 2026

Release intent: capture ideas quickly, organize the Inbox predictably, and turn
selected workspace sources into useful work with an agent.

One integrating owner coordinates these bounded slices:

- Agent: explicit note/file/asset attachments with inspectable revisioned context,
  clear setup, reviewed Markdown drafts and existing scoped command tools.
- Capture: same-renderer compact desktop presentation; restore normal bounds and
  preserve retained drafts. Native acceptance is independent of web acceptance.
- Inbox: authored, bounded local rules with preview and revision-checked capture.
  No arbitrary trusted code, external actions or implicit AI execution.
- Workspace: useful customization controls and configuration-aware widget recovery.
- Packages: explicit contribution role/lifecycle vocabulary, early role/source
  validation and surface-only composition slots; preserve version-1 identities.

Preserve existing assets, layouts, storage/wire identities, permission boundaries,
Loop Kit ownership and unrelated working changes. The checkout already contains
substantial unreleased work; publication must verify the complete candidate.

## Release gates

- [x] Focused tests, architecture checks and affected package verification.
- [x] Root typecheck and production build, serialized to avoid generated CSS races.
- [x] Fresh browser interactions, responsive layouts and console evidence.
- [ ] Installed native capture/restore evidence with exact executable and origin.
- [ ] Package/release artifact checks, source provenance and release notes.
- [ ] Publish Canary and verify public artifacts and update metadata.

Checkboxes describe this candidate only. Prior acceptance is background evidence.

## Current evidence

- Root typecheck/build, package verification (304 tests), and the full suite
  (338 tests, 2,615 assertions) passed. The final empty-conversation scroll
  adjustment also passed app typecheck and nine focused AI/Markdown tests.
- A frozen empty-cache install passed without an external Loop checkout.
- Component build verified actual bytes, imports, translator and Hello World run.
- Installed acceptance `0.1.0-canary.20261027.2`, exact executable under
  `%LOCALAPPDATA%/com.isaacharvey.station.acceptance/canary/app/bin/bun.exe`,
  origin `http://127.0.0.1:43158`: created a separate test workspace, invoked
  compact capture, typed immediately, saved once with Ctrl+Enter, restored normal
  bounds, and observed the same record in the Inbox editor.
- Outside-app invocation subsequently passed from a newly opened Notepad window.
  The native lifecycle probe passed branding, tray ownership, three same-HWND
  hide/restores and graceful Quit cleanup. Tray-idle/sleep and the final rebuilt
  candidate's installed acceptance remain separate gates. Restoring focus to the
  previous foreign application is not supported by the pinned native API.
- Built-in browser at isolated production origin 3068 verified keyboard @ file
  selection, permission-review defaults and a saved rule transforming a real
  capture to cleaned text with status Done, then View inbox revealing those rows.
  Measured CSS widths 375/768/1024/1440 had no document overflow; console was clean.
  Chrome was unavailable; Edge control timed out. A deliberately invalid,
  memory-only fixture key exercised composition without a model request.
- Live-provider check awaits a user-configured Gateway key in the acceptance app.
- CI now provisions the dated nightly/wasip2 prerequisite explicitly and permits
  thirty minutes for a cold build and installed acceptance.

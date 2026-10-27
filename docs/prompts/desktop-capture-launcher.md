# Follow-up: compact desktop capture and widget launcher

The remaining acceptance mission is below. The 2026-10-27 source change now
temporarily compacts Station's existing native window around a retained
quick-access widget, then restores its previous frame/state. It creates no
separate launcher WebView. See [Desktop](../desktop.md#compact-shortcut-presentation-2026-10-27-source-change)
for implemented lifecycle and authority; fresh installed-native acceptance is
still required. Explicit restoration of a foreign foreground application remains
unavailable through the pinned public native API.

Inspect the pinned Electrobun native window/activation/positioning APIs and
Station's retained presentation controller. Design a compact, keyboard-first
presentation for any compatible widget with explicit preferred/min/max sizing.
Quick capture should default to a small centered text surface with immediate
typing, Ctrl+Enter save and Escape dismissal. Capture records remain the existing
Inbox data source; the sidebar remains an ordinary customizable Data view.

Choose and document one authority/lifecycle design before implementing another
native window. A second WebView must not become another workspace owner, leak
root credentials, duplicate providers or borrow host authority. Prefer extending
the existing retained presentation model. If a separate renderer is unavoidable,
specify its narrow command/session transport and conflict/revision handling first.

Preserve/restore the previous foreground application when permitted, the main
Station window's bounds/state, existing widget drafts and retained native-browser
ownership. Define behavior when the launcher is already open, Station is hidden
in the tray, a modal is active, a widget disappears, a desk/workspace changes,
or the source is full/read-only/deleted. No silent fallback to a different inbox.

Audit global shortcut heartbeat behavior under WebView2 background/hidden timer
throttling and sleep/resume. A long-hidden running Station must still open capture.
Keep deterministic cleanup on navigation, renderer failure, revocation and Quit.
Registration conflicts must identify the unavailable binding without claiming OS
success. Development, managed acceptance and the normal canary remain isolated.

Acceptance must use the actual Windows WebView2 executable, not a Chrome imitation:
invoke from another app; type immediately; save once; verify the same record in
the sidebar; dismiss and restore focus; repeat after tray hide, several minutes
idle, sleep/resume where available, and restart. Exercise two widget definitions,
changed hotkeys, failed OS registration, retained drafts, and graceful cleanup.
Record executable path, port owner, exact origin/renderer/epoch, screenshots and
remaining platform limits. Never interrupt the normal canary or user-active work.

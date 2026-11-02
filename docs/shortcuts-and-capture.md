# Shortcuts and capture

Widget bindings select a compatible definition asset and reuse one retained
instance. `presentation` chooses `quick-access` (bounded modal) or `focus` (full
surface); Escape returns it to its original placement. New workspace defaults
include `Mod+Alt+I` for Widget inspector. Existing saved settings are not rewritten:
add a widget binding in Keyboard shortcuts to use this with any compatible widget.
Cursor-anchored menus and hold/release gesture acceptance are not implemented.

Implementation owner: Station. Last source review: 2026-10-24. The acceptance
record below distinguishes development WebView2 from installed releases.

## Current contract

Keyboard shortcuts is available from the account menu, `?`, Settings, and the
Shortcuts tab of the dockable Desk settings widget. The manager records physical
key combinations, displays platform keycaps, detects occupied combinations, and
supports clearing, disabling, renaming and removing bindings. Shell overrides can
be restored to their defaults. Recording consumes keys before application
shortcuts; Escape cancels, Backspace clears and Tab leaves recording.

`core/shortcuts.ts` owns validated serializable preferences. Bindings select a
current shell action or a widget definition asset. Asset properties reuse the
workspace-bounded asset-reference picker, including drag and drop. Use the
**dockable Desk settings widget** for dragging from the Asset browser: a modal
settings dialog deliberately makes the background inert. Invalid/missing widget
definitions fail visibly; root shells cannot be modal targets. Installed package
contributions are not yet a shortcut target adapter.

Asset icon handles use an in-document pointer reference gesture, with a movement
threshold, compatible-field feedback and Escape/cancel/unmount cleanup. This
avoids Windows OLE deactivation and marquee pointer capture. Read-only built-in
definitions can be referenced without permitting source/grouping edits. Pickers
retain their validated HTML-drop fallback and keyboard-accessible chooser.

Scope is workspace, a named desk, or desktop-global. Global bindings belong to the
active workspace; switching workspaces replaces registrations rather than keeping
every workspace active. Local bindings yield to inputs, editors, dialogs, games,
composition, repeat and already handled events. In a web browser, Global is
explicitly labelled desktop-required and behaves only as a local shortcut.

The root resolves widget definitions through the existing store/docking pipeline.
It creates an ordinary retained instance on first use, reuses it on later
invocations, and opens the existing native HTML-dialog focus presentation.
Escape restores the existing placement. No second renderer/store/service tree is
created. The October 27 candidate temporarily compacts this same native window
for global quick-access invocation and restores its prior bounds/state on dismissal.
It creates no second renderer or workspace owner. Installed acceptance of this
candidate is tracked separately from the historical evidence below. Drafts survive focus changes; a full document reload does not
promise preservation of unsaved transient drafts.

Quick capture is an ordinary configurable built-in widget. Its default binding
is **Ctrl+Alt+Space**. Captures use `capture.create` with the actual source revision;
errors preserve the draft. The default local table has `text`, `created` and
`status` columns. A 500-row source limit and existing field/source permissions
still apply. There is no clipboard monitoring or background ingestion.

### Inbox automations

Quick capture's **Automations** control edits optional `capture.json` beside the
selected Inbox asset's `data.json`. These are ordinary authored files, separate
from live task grants or execution. Up to 20 enabled/disabled rules match a text
substring or prefix, ignoring case, and set the captured record's status. Prefix
rules may remove the prefix. The first enabled matching rule wins; unmatched
captures retain their text and use `Inbox`. The editor previews the current draft
before saving; saving rules does not modify existing records.

`core/capture-rules.ts` owns parsing, matching and source compatibility.
`capture.configure` validates the target and its Status options, then saves rules
against one exact asset revision. `capture.create` re-reads that same source and
rules, validates capacity and the transformed text, then commits exactly one
ordinary record in one revision-checked write. Invalid/full/read-only/deleted
sources and stale revisions preserve the capture draft and report an error.
Both commands use the shared operation/resource/source-access policy; partial
file grants cannot invoke whole-source capture commands. There is no destination
fallback, JavaScript evaluation, background scheduler, AI call, external action,
retroactive processing or recursive rule execution.

Source review and focused tests on October 27, 2026 cover rule precedence,
disabled entries, case folding, malformed rules, capacity/type checks, persisted
rules, single-row atomicity, stale writes and denied/revoked/partial-file tasks.
Browser and installed-native acceptance of these new controls remain separate
release gates; the older acceptance record below predates Inbox automations.

New workspaces receive a removable Inbox data-source asset. The default App desk
template provides a sidebar Data view referencing it. Both records and view
configuration remain ordinary editable Station data. Existing saved layouts and
assets are not rewritten: choose **Create inbox** in the manager to provision a
source and sidebar view in an older workspace. Changing the inbox source does not
retarget unrelated existing Data views automatically.

## Desktop ownership

`desktop/shortcut-service.ts` wraps the pinned Electrobun `GlobalShortcut` API.
Only the trusted native root can configure it, using the same exact-origin,
Fetch Metadata and random credential membrane as other desktop services. Requests
contain bounded binding IDs and key combinations, never scripts, commands,
credentials or grants. Native invocation restores/activates Station and delivers
only the binding ID; the current root resolves the action and its policy.

Registrations are replaced on active-context change, released while the manager
is mounted (so the OS does not swallow recording), and removed on root navigation
and quit. Heartbeats renew a three-minute lease, allowing WebView2's one-minute
background timer coalescing without losing hidden-window shortcuts. Monotonic session generations reject
late context updates; stale callback identities cannot invoke replacements. OS
registration failure is shown explicitly and does not silently become a broader
binding. These private native routes are not guest capabilities or agent-control
operations. Source imports never acquire OS shortcut authority.

Settings use shared PropertyEditor controls and the asset-reference picker. They
do not yet project into a writable Data view provider: its scalar record schema
does not express typed action/reference properties or a policy-aware settings
mutation port. Do not add an independently writable copy of shortcut records.

## Acceptance record, 2026-10-23 through 2026-10-24

Root `bun run typecheck`, root `bun run build`, architecture checks and
`bun run repo verify station` passed. The Station suite finished with **269 tests,
0 failures and 2,311 assertions**. The staged UI-package publication test separately
passed, including unchanged-output timestamp preservation. The architecture has one additional reviewed
exception for the dev-only source HTML import; presentation uses injected native
service ports rather than adding bootstrap/provider import exceptions.

Automated and manual evidence is recorded under `outputs/shortcuts-*` and
`outputs/desktop-dev-ready2.log` in this checkout. The focused tests cover portable key
resolution, isolated desktop identities, native registration/replacement,
suspension, expiry, stale callbacks, foreign/unauthenticated/malformed HTTP
denials, ordinary record writes, revision conflicts and preference persistence.
The pointer gesture test covers movement threshold, commit, cancellation,
disposal, disconnected targets and feedback cleanup.

Verified in the actual development WebView2 executable on 43159: startup and HMR,
graceful backend rebuild/relaunch, native registration, Ctrl+Alt+Space invocation
from Chrome, capture reopened after over three minutes hidden in the tray without
unregistering the OS binding (the background heartbeat renewed its lease), immediate
typing after activation, Ctrl+Enter save, and the same record visible in the
sidebar. A native drag from the built-in Local time asset changed the docked
manager's target property. Screenshots: `outputs/shortcuts-native-drop.png` and
`outputs/shortcuts-native-inbox.png`.
Invoking the resulting global binding opened that same retained Local time widget
in a modal; `outputs/shortcuts-native-widget-modal.png` records this second target.

Chrome at the separately launched non-HMR origin `http://127.0.0.1:3049` verified
recording/conflict suppression, saved-key persistence after reload, a desk-scoped
Local time modal binding, persisted capture records, and no page overflow at
375/768/1024/1440 widths. Its warning/error console was empty. Native root secrets
and paired task credentials were not read or exported; no paired command mutation
was used during UI acceptance.

Chrome and the native **Station Development** WebView2 window are independent
acceptance targets. Browser success does not establish outside-app registration,
foreground activation or native focus. Development executable evidence does not
establish an installed canary update or A-to-B updater transaction.

## Contextual action contract proposal

Context conditions remain proposed. Start from the existing Loop action metadata,
Station preference owner and command policy. A reusable condition AST should have
a closed catalog for workspace/desk, focused widget/slot, editor/game/text-input
focus, selection and action availability. Unknown conditions and script failures
disable the binding with a visible reason. Visual/source editors edit the same AST.

Script predicates need the existing bounded evaluator, redacted JSON context and
boolean output. They receive no native handles, grants or action callbacks.
Literal conditions do not require executable evaluation. Define precedence,
conflicts, stale-context handling, reset/undo and `mod` aliases before replacing
the current preference format.

Keep widget-definition, live-instance and installed-contribution references distinct.
Adapt them to shared actions; recheck installation/task/resource authority when
invoking. A settings/Data view edits the authoritative preference through one
controller and commit path. Recording a binding must not run its action. Package
import cannot register OS-global shortcuts; native transports receive bounded
binding IDs rather than scripts or approval flags.

Acceptance covers context changes, revocation, stopped evaluators, unavailable
actions, deterministic conflicts and recording without invocation. Test keyboard
configuration, compatible asset drops, saved preferences and outside-app hotkeys
in the appropriate browser/native targets. Compact capture lifecycle and its
remaining tray/idle/sleep cases live in [Desktop](desktop.md#compact-shortcut-presentation-2026-10-27-source-change).

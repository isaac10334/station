# Station agent

Station agent is the built-in `ai-chat` widget. The existing widget and capability
identities remain compatible. It uses the user's Vercel AI Gateway key; there is
no Station-provided credit balance or server-side model credential.

## Working with context

Type `@` in the composer or choose **Add context** to find a note, Markdown asset,
another asset, or an individual virtual source file. Arrow keys and Enter select
a result; Escape dismisses suggestions. Asset-browser references also support
drag and drop. References use asset IDs and optional virtual file paths, never
visual group locations or native filesystem paths.

Up to eight sources and 48 KB of serialized context can be shared per turn. Send
reads the selected revision and refuses changed/deleted sources instead of
silently switching content. A file attachment excludes its siblings. Whole-asset
attachments include the authored virtual files, including rich-note JSON. The
transcript's **Shared context** disclosure shows the exact snapshots sent.
Retry reuses those snapshots; it does not silently read a newer revision.

Explicitly sharing a snapshot does not authorize the model to discover or read
other sources. Source text and embedded references are untrusted data. Messages,
snapshots, pending reviews and session authority stay out of authored assets.
Start a new conversation to stop retaining previously shared context.

## Drafts and workspace work

Configure the model inline when the widget has no key. Enable conversation and
review additional capabilities through Chat tools. **Create Markdown drafts**
lets the agent propose notes, plans and summaries. Each save displays the complete
source and requires the user's Save draft action. Declining, stopping, removing
the widget, changing settings/grants, or cancelling the turn prevents late saves.
Saved notes are ordinary Markdown assets; saving never installs or executes code.

**Workspace tools** opens the shared task permission review directly from the
agent. Existing assets start unselected. Creation, editing, build/execution and
placement are reviewed separately. Agent setup defaults to creating source, with
execution and layout changes off. Tasks expire after an hour and can be stopped
in the same shared review. Selecting a task exposes only its authorized command
schemas; all operations still pass through the existing command/resource policy.
Asynchronous tool calls wait for completion and Stop cancels pending operations.
Committed source changes remain committed when a later turn is stopped.

Turns are bounded to twelve model steps, 180 seconds, 8,192 output tokens and
64 KB of displayed response text. There is no automatic model switch or retry.
Reaching a limit can leave work unfinished; the agent must report that honestly.
Native shell, arbitrary process execution and unrestricted network access are
not supplied as tools. Account login does not grant workspace authority.

## Verification scope

Deterministic tests cover exact-file sharing, revision/missing-source rejection,
context limits, inert framing, retry snapshots, reviewed draft saves, denial and
cancellation, and completion/cancellation of real command-runtime operations.
Browser, installed-native and live paid-provider evidence are separate gates.

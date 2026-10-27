# Rich text authoring

Station uses the same lazy BlockNote 0.56.0 control for document assets, Notes
widgets and Markdown properties, with its official ShadCN UI. BlockNote owns
selection formatting, links and slash commands. Station owns semantic tokens,
source revision checks, persistence and presentation; the editor acquires no
services or program authority. Its UI inherits Station theme tokens and uses no remote fonts.

## Values and assets

- `markdown` assets store `note.md`. Markdown properties remain strings.
- `note` assets store `note.json`: `{version:1, blocks:[...]}`. BlockNote document
  JSON preserves structured formatting and identities without a lossy round trip.
- A Notes widget can keep `{format, source}` inline or reference an independently
  revisioned note/Markdown asset. Clearing a reference restores its retained inline
  value. Missing references offer replacement/clear instead of dropping drafts.
- An asset wraps a source value with identity, metadata, revisions and source
  permissions. **Copy to Markdown asset** explicitly creates a copy; it does not
  silently change a property's serialized type or create an implicit live binding.

BlockNote directly imports Markdown through `tryParseMarkdownToBlocks` and exports
through `blocksToMarkdownLossy`. HTML conversion is not required. Markdown/HTML
exports are explicitly lossy; JSON is the rich note source. The supported schema
contains text, headings, lists, checklists, quotes, code blocks, dividers and tables.
Media/upload/collaboration features are excluded. Links allow HTTP(S), mail and
fragments; clicking within the editor does not navigate the Station window.

## Editing and recovery

Rich text and source views share one editor instance. Compact/expanded editing
retains the document and selection state; asset editors also use the common dock
tab/peek/dialog presentation. Changes autosave after 500 ms without typing, with a tiny saving status.
Control/Command+Enter flushes pending changes. Commits are serialized and newer
edits remain dirty until their own save succeeds. Unmount flushes pending edits.
Read-only sources remain inspectable/exportable. Invalid JSON stays in Source
with a validation error and reload recovery. External edits never overwrite a
dirty local draft; persistence checks the current source before committing.

The reusable Markdown property editor is used by the Asset Inspector description
field and contract-defined Markdown fields. The property starts as one compact preview row, including in read-only inspectors. Opening it lazily mounts the full rich editor in the shared morphing overlay; edits autosave through the same revision-checked commit. JSON and script source fields use the same overlay contract. Its expandable surface supports a
copy to an independently editable Markdown asset. Note source is bounded to
256 KiB with structure limits; property contracts can impose smaller limits.
Stored malformed source is retained for repair rather than discarded at load.

Source, installation, and runtime activation remain separate. Creating/editing
a note or selecting a note reference installs no package and grants no execution,
network, service or native access.

## Acceptance, 2026-10-21 local time

The production-mode isolated origin `http://127.0.0.1:3055/` was tested through
real browser controls and a fresh non-HMR tab. Rich note creation, heading/body
editing, explicit save and reopen retained BlockNote JSON. Direct Markdown export
produced `# Rich notes in Station`; the Inspector's copy action created a Markdown
asset which reopened with bold formatting. Invalid JSON remained editable in
Source, and Reload recovered the saved document. Inspector metadata trimming
reconciled without a false source-conflict message.

An actual text range (`Rich `) survived expanded > compact > expanded presentation;
Bold changed only that range, and Save persisted it. The Notes widget saved an
inline draft, bound a rich note asset, then restored its inline draft when the
reference was cleared. At a measured 376 CSS px width, the expanded editor and
source switch remained usable with no horizontal document overflow. Temporary
viewport overrides were reset. Evidence: `outputs/station-rich-text-integrated.png`
and `outputs/station-rich-text-narrow.png`.

Root typecheck/build and architecture checks passed; the complete test run passed
286 tests. The fresh rich-text view recorded no console errors or warnings after
adding BlockNote's mobile viewport setting. This establishes browser acceptance;
physical mobile keyboards, installed-native rendering and collaboration/media
features were not exercised.

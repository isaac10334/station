# Remaining Station checkpoints

Status: current work index, source reviewed 2026-10-19. This replaces the
2026-10-14 implementation prompts, whose command plane and native-browser work
now have dedicated contracts. Use [the docs index](../README.md) to find them.

## Agent development

Use [Agent control](../agent-control.md): `bun run dev:agent`, exact-origin
`--discover`, owner-reviewed task pairing, `commands.list`, then `state.inspect`.
Every browser tab has its own renderer. Account presence is not control authority.
Configured Codex MCP-client acceptance and installed native rendering remain
separate checks; do not infer them from the CLI/MCP adapter tests.

## Reusable editing

The host now resolves shared property widgets by type, with trusted scoped editor
registrations. Data tables, record dialogs, settings and custom document forms use
this path. Portable TypeScript recipes are inert, forkable source definitions;
access approval and start remain explicit. See [Widget system](../widget-system.md).

Open: sandbox-backed property editor contributions, richer text authoring,
additional runtime-authored defaults and portable tree/source-editing workflows.
Keep schema validation and resource authority at commands, independent of UI.

## Marketing and future publishing

Review the actual supplied scene assets, source, licenses and performance evidence
before updating the marketing renderer. Keep local fonts, shared semantic colors,
responsive/static fallback, explicit runtime failure states and real downloads.
Do not depend on the retired 3D art-direction brief as an undelivered requirement.
Marketing deployment remains separate from workspace/Component credentials.

Future authoring: curate a web SourceProject, then review immutable static export
with file hashes. A publisher should target one reviewed revision and destination,
keep credentials host-owned, and support rollback. Author, build, export, publish
and activation are separate actions; this is still exploratory.

## Desktop and runtime acceptance

Follow [Desktop](../desktop.md), [Native browser](../native-browser.md) and
[Programmable foundation](../programmable-workspace-foundation.md) for current
versions, process/profile boundaries and remaining gates. The previous claims
that closing exits, tray/native tabs are absent and updates have no settings UI
are superseded; do not use them as implementation instructions.

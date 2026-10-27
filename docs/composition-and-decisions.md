# Asset composition and decisions

Implemented prototype, October 2026. These contracts extend the existing workspace,
command registry and Loop Kit lifecycle; they do not create a second object store.

## Identity, references and variants

### Widget definitions and live instances

Widget recipes can declare a `key` on each child and a navigation `targetRef:
{key, slot?}`. Keys belong to one source composition. Spawning allocates every
widget/slot identity first, then resolves references inside that new tree; duplicate
keys, missing targets and incompatible targets reject the entire creation. Embedding
another recipe rebases its key namespace. Desk cloning remaps live widget and slot
references together. No source definition may capture an ambient live target.

An App shell can be spawned as a nested composition with independent navigation
and a Main surface; choosing the desk root remains a separate action. Live instance
settings have a target-slot picker and accept slot-reference drops from the crosshair
on a tab rail. Removed targets remain visibly missing until repaired or cleared.
The inspector distinguishes these live references from definition asset IDs.

Every populated slot has a tab rail. Its plus control appears on pointer hover or
keyboard focus and remains visible without hover support, including the bottom dock.
Widget list entries use the same owned instances and graph. Each entry can render
Inline or act as an Open tab launcher; launchers instantiate a fresh widget at the
list's target and reuse that launched instance during the current mounted session.
Inline and launched instances have independent state. This is a generic list
container, not a new built-in inbox or todo data service.

Asset labels can be dragged into editable visual groups, including a multi-selection;
the icon remains a native asset-reference drag source. Native asset drops are also
accepted by groups and breadcrumbs. Virtual built-in/lineage groups reject changes.
The inspector's group selector remains the keyboard alternative. Group edits use
`assets.group.move` with checked writable asset resources and atomic validation.

Assets have stable workspace-local IDs. `AssetReference` contains `assetId` and an
optional legacy subresource `path`; names and visual groups are not addresses.
`AssetReferencePicker` supplies compatible search, clear, missing-reference feedback,
source opening and same-workspace drag/drop. Theme icons use this picker and the
existing strict static SVG validator. Renaming an asset preserves its references.

SVG assets have an interactive static shape/source editor: canvas drawing, pointer
move/scale, selection, arrow nudging, Delete, SVG-file drop/import and bounded
session undo/redo. Gestures preview locally and commit once; Escape/cancellation
discards previews, and concurrent source edits reject stale commits. Previews are
validated image resources; only Station-generated hit geometry enters the host DOM.
Scripts, animation, HTML and remote resources remain rejected. Complex paths/groups
use a conservative viewBox transform frame; editable path nodes/Bezier tools and
advanced document features are not a full vector graphics suite yet.

`asset.fork` creates independent source with `origin: {assetId, revision}`. The Asset
browser groups source and descendants under an expandable variants group. Forks
inherit neither Component artifacts/grants nor editor-policy bindings. Built-in
widget recipes use the same operation. Incoming sharing conflicts retain lineage
and remain separate sources; there is no automatic merge or distributed branch log.

## Editor decisions

`decision` assets contain bounded, schema-validated `decision.json` with purpose
`asset.editor`. Rules match asset kind and/or a case-insensitive name substring;
the first match chooses an editor. The visual editor supports ordering, source
editing, explicit workspace binding and testing against an asset reference.

Routing precedence is explicit editor choice, asset policy, workspace policy,
existing desk/workspace defaults, then Station. Missing, invalid or incompatible
choices fall back safely with a reason. `routing.inspect`, `routing.configure`
and `asset.open` expose the same schema/effect/resource-checked operations to UI
and authorized tasks. Open with chooses an editor separately from tab, peek,
modal focus or full-screen presentation. Opening an editor grants no authority.
Task routing cannot borrow another task's installed editor. Placement policy
remains the existing host-owned docking validator.

These decision assets are inert data. WASM/AI deciders, formula DSLs, arbitrary
hooks, scheduling and capability acquisition during a decision are not implemented.
They need separate execution contracts, explicit grants, cancellation and budgets.

## Authority and transparency

Task scopes can restrict each selected asset to exact virtual source paths or
directory prefixes ending in `/`. Read includes allowed writes. `asset.read`
filters source and `files.patch` checks every changed path before one atomic
revision-checked commit. Whole-source operations (including build/fork/editor
execution and legacy package adapters) fail closed for partially scoped assets.
These rules do not grant access to OS directories or expand guest SDK authority.

The built-in Asset browser acquires an `assetCatalog` handle in a workspace-owned
scope and intersects its catalog with the shared permission-checked query. Its
source variants and routing use commands. This is a first migration slice: trusted
React still renders source objects, and other built-ins are not all converted to
the sandbox contribution transport. The widget inspector lists declared service
and command dependencies separately from actual Loop Kit acquisitions.

Capability Inspector's Timeline shows bounded session lifecycle metadata and
command activity. `runtime.inspect` exposes owner lifecycle summaries; tasks see
only their own command activity. No service values, source, credentials or command
arguments enter that history. It is a diagnostic buffer, not a durable event log.

See [agent control](agent-control.md) for discovery and exact-session pairing.
Account sessions are identity/presence records, not workspace-control grants.

## Next architectural slices

- A shared property/schema inspector and typed cross-asset reference declarations.
- Reviewed decider providers with intersected capabilities, bounded execution and
  recovery; start with one additional real routing use case before generalizing.
- A durable asset event journal/outbox and workflow provider with idempotency,
  replay, ownership, conflict branches and cancellation before authored automation.
- Complete built-in command/capability parity and source/resource grant UX.
- Explicit remote renderer pairing, encrypted account-scoped offline sync and
  trusted backup-peer enrollment; account cookies alone must never authorize tools.

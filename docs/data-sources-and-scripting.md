# Data sources, views, actions and scripting

This is a working first slice, not a distributed database or a general workflow engine.

## Shared records and independent views

Create **Data source** in the Asset browser. Its stable asset ID identifies
`data.json`: version, provider ID, columns with stable IDs, and records with stable
IDs. Group placement and names do not participate in references. **New linked
view** creates a Data view widget referencing that source. Each widget persists
its own table/board/graph presentation, search, sort, grouping, visible columns,
graph labels and record-link column. Views never copy records. Desk cloning keeps
the source reference while allocating fresh widget identities.

`core/data-sources.ts` defines validated records and the trusted provider adapter
contract. `CommandPorts.dataProviders` registers additional host adapters; source
files only select an already registered ID. Unknown providers fail closed. Built-in
providers are writable `local.table`, read-only `station.assets` and read-only
`station.activity`. Catalog and activity results respect the invoking task's
resource visibility. Integrations must supply their own authority and lifecycle
contract before gaining network or credentials; writing a provider ID in an asset
does not install code or authorize IO.

`data.query` and `data.mutate` are shared by UI and agents. Mutation requires source
write authority and an exact asset revision. Schema edits, row upsert and deletion
are separate validated mutations; failed writes leave the source intact. Queries
are cancellable operations and discard results if the source changes. Supported
cells are text, number, boolean, select and calculated formula. Documents are
bounded to 32 columns and 500 records; they are local workspace assets with the
existing persistence/sync limitations. Row merging, relations, transactional
multi-source writes and durable graph position storage are not implemented.

Formula columns use JavaScript expressions such as `row.amount * 2`. Formulas run
in column order against a row copy, once per query in a single bounded evaluation.
They are computed values and never persisted when editing a row. Formula queries
add the separate `station:scripting/evaluate` capability requirement. Invalid or
expensive expressions return an error; they do not execute host JavaScript.

## Scripted data providers

The **JavaScript calculation** provider selects a separate script asset by stable
`scriptId`. `data.query` requires read authority for both assets and the scripting
capability. The VM receives `{ columns, records }` from `data.json` and returns
`{ columns, records }`; results pass the same bounded schema and cell validation.
They are read only and never overwrite the source records. Filtering and sorting
happen after calculation. Cancellation and changes to either source revision
reject late results. The calculation has no Station handles, network or filesystem.

Example calculation (`main.js`):

```js
return {
  columns: input.columns,
  records: input.records.filter(record => record.values.status === "Open"),
};
```

## JavaScript calculations and TypeScript programs

Create **JavaScript calculation**, edit `main.js` as a synchronous function body, supply
JSON input, then choose **Run script**. Results, console logs and execution timing
appear beside the shared source IDE. The reusable
`RecordGraph` projects data-source records and optional edges encoded as
comma-separated record IDs. It is an interactive visualizer, not executable node
programming. Previews and opening an editor never run authored scripts.

The scripting capability is implemented by QuickJS compiled to core WASM. It is
**not** a WASIp3 Component and does not import Station capabilities. One browser
worker serializes evaluations, with a maximum queue of 16. Every call creates and
disposes a fresh VM: 16 MiB heap, 256 KiB stack, 200 ms interrupt budget, 64 KiB JSON
input/output and bounded console logs. A 4-second outer watchdog or cancellation
terminates the worker; an idle worker exits after five seconds. No network,
filesystem, DOM, dynamic host imports or Station handles enter the VM. Headless
commands use the same QuickJS code and VM limits directly. Timing is an execution
budget, not a real-time scheduling guarantee.

`scripts.run` accepts an authorized script asset ID and JSON, never raw host code
or an approval flag. Source access and the scripting capability are separate
requirements. Cancellation, task revocation and source revision changes discard
late results. `commands.list`, `operations.inspect` and `operations.cancel` work
through the existing CLI/MCP transports. **TypeScript script** creates a program
asset with `program.json` and an entry module. Its editor uses the shared movable
Files, Code and Problems widgets. Build snapshot compiles the draft; Run/Start
executes that snapshot. Widget surface and service access are reviewed in a modal
permission dialog and saved through the existing revision-checked wiring command.
A calculation is a synchronous JSON function body; it is not a TypeScript program
or a Rust Component. Rust Components still use their declared WIT imports and
separate compiler/runtime path. Script imports and Component-to-calculation
composition remain follow-ups.
StarlingMonkey currently targets WASI 0.2; it is not a drop-in replacement for
Station's inspected P3 Component world.

## Runtime toolbar actions

Add an **Action button** in a compatible widget slot. Its visible label may be
empty; the optional tooltip is independent, and the button retains an accessible
name. Configure its built-in/SVG icon, appearance, width, optional confirmation,
bounded command and exact target instance or asset. Asset opening and JavaScript
calculation actions use the same shared commands as other UI. Script execution
has busy, result and error feedback and is cancelled on configuration changes or
removal. Configuration never grants script authority or embeds owner callbacks.

The toolbar is an ordered placement surface in the v5 dock document. Drag a
compact-capable widget into it, reorder it there, or drag it back out. Keyboard
pickup, destination navigation, cancellation and layout undo use the existing drag
coordinator. Right-click (or Shift+F10) opens the shared widget settings and
definition/removal actions. Moving keeps one instance and its mounted content.
Creating a widget elsewhere never adds a toolbar projection or overflow entry.

Migration moves legacy explicitly pinned actions once; unpinned actions remain in
their existing slots. Protected built-in toolbar controls have internal unlisted
definitions and retain their fixed host-owned order. Configuration and placement
persist; desk cloning remaps live targets while preserving source asset IDs.

Commands remain data-only: activate a target tab, toggle a side/bottom dock or
floating window, focus a widget, open the picker, open an asset, or run an identified
JSON calculation. They cannot approve grants or
invoke arbitrary owner operations. The toolbar cannot be hidden. Custom scripting
and portable Component UI remain gated on the P3 proof described in
[Programmable workspace foundation](programmable-workspace-foundation.md).

## Component compiler providers

`server/component-compilers.ts` selects a trusted compiler independently from
verification/publishing. `STATION_BUILD_PROVIDER=vercel-sandbox` retains the existing
configured provider. `oci-container` selects a new Docker adapter. Setting an
immutable `STATION_COMPONENT_BUILDER_IMAGE=image@sha256:<digest>` chooses OCI by
default; an explicit provider setting takes precedence. Unknown/missing provider
configuration fails instead of falling back to host Cargo.

An operator builds `Dockerfile.component-builder`, provisions the resulting image
in the daemon, and configures its immutable digest. OCI execution uses that fixed
entrypoint with no network, mounts or forwarded credentials; it runs non-root with
a read-only root, bounded tmpfs/memory/CPU/processes and a ten-minute deadline.
Source and artifact bytes cross bounded pipes. Registry cache/toolchain are in
the image. Cargo build scripts execute only inside that container. No image is
pulled implicitly. Cancellation removes only the specifically named build container.

Both providers return untrusted bytes to the common verifier. It validates source,
Component/P3 imports/world, hashes source/WIT/translator/bytes, and publishes only
verified artifacts with provider provenance. Actual local bundled Rust/P3 build
and invocation are verified separately by `bun run build:component`. The OCI
adapter/image have not passed an end-to-end container compile here: Docker's Linux
daemon was unavailable. Public Fly cloud routes still exclude Component builds;
provisioning an isolated compiler service is a separate deployment step.

# Station command and agent control

Last source review: 2026-10-19. Protocol and routing are implemented; a configured
Codex MCP-client connection and installed native rendering remain separate acceptance.

Station has one application owner per live renderer. The command registry is shared by trusted UI, scoped sandbox adapters, internal task tools, CLI and stdio MCP. The desktop Bun broker owns connection secrets and routing; it does not own another workspace store. Headless execution creates an explicitly separate profile with the same application services.

## Terms and authority

A command/query is a versioned operation with Zod 4 input/output schemas, effects and resource checks. A capability is a versioned service contract; its ID and TypeScript types grant nothing. A provider implements a contract under Loop Kit lifecycle ownership. A task grant authorizes a principal's operations and resources for a limited time. A transport authenticates/routes messages and cannot expand application authority.

`@station/protocol` contains portable schemas and transport-neutral errors. `features/commands/application/runtime.ts` owns registration, opaque contexts, task scope, version checks and operations. Contexts are held in a WeakSet and cannot be constructed from JSON. `execute()` is the trusted in-process owner UI entry point; transports must use `executeFor(contextForTask(id), request)` after authenticating a task binding. Never expose owner dispatch, context creation, review decisions or raw store/provider methods as tools.

A task scope contains exact operation IDs, readable/editable asset IDs, permission to create source, allowed placement surfaces, capability IDs, Component imports, and separate cloud-build authority. Assets actually created by the task join its creation set. This is not a name-prefix wildcard. Editing implies source reading; metadata-only callers omit the source-reading operation. Queries and results are scoped too: external state inspection excludes raw dock settings, source and credentials.

Package declarations, installation grants, task scope and host resource bindings intersect. Task widgets cannot borrow another package command's authority: delegated installed-command invocation currently fails closed until every callee effect can be intersected. The new metadata capability is task/resource-bound; existing capability IDs do not acquire new methods or authority. Legacy explicitly approved installed adapters retain their existing contracts.

## Connect to a live session

Desktop builds include the broker; external access starts without paired credentials.
The recommended local workflow uses a separate development origin:

~~~powershell
bun run dev:agent
# Open http://127.0.0.1:3012 in the browser.
bun run station:control --discover --instance http://127.0.0.1:3012
~~~

`dev:agent` binds loopback, enables the scoped broker and rejects desktop ports.
An existing listener fails normally; it never kills or replaces it. `PORT` may
select another explicit development port. Browser storage is origin-local; create
a separate test workspace instead of cloning an account or desktop profile.
The Agents panel shows its exact origin/instance/renderer. Public discovery returns
live renderer IDs/epochs, not workspace contents. With several tabs the top-level
renderer ID is null; pair from the intended tab. Registration, queues, replies,
pairing and revocation are all bound to that renderer. Closing/reloading a root
unregisters it; stale heartbeat sessions expire without choosing another tab.

Account login and device presence are independent of this workflow. Use the
existing account UI if login is needed; never copy account cookies, keys or
sessions into a development profile. A paired agent controls only reviewed
workspace resources, not the account or other signed-in devices.

For manual server configuration:

~~~powershell
$env:STATION_AGENT_CONTROL = '1'
$env:PORT = '3012'
bun apps/station/server/server.ts
~~~

Open that origin, then Desk settings → Agents. Choose existing assets and task permissions, review the source/model disclosure, and authorize the task. No existing asset is selected by default. Create a pairing code and choose **Save CLI connection securely**. This consumes the one-use code and writes a paired credential under a user-restricted OS directory. The UI returns its path, never the credential. Windows ACLs are applied before writing; POSIX mode bits alone are insufficient on Windows. Do not put that file in a repository, export or prompt.

~~~powershell
bun run station:control --discover --instance http://127.0.0.1:3012
bun run station:control --connect <credential.json> --method commands.list
bun run station:control --connect <credential.json> --method state.inspect
bun run station:control --mcp --connect <credential.json>
~~~

The optional CLI pairing flow reads the 60-second one-use code from `STATION_PAIR_SECRET`, uses `--pair --instance <origin> --credential-dir <new-private-directory>`, and prints only the saved path. Client names are self-reported labels, not executable attestation. Never pass secrets in URLs or command arguments.

Credentials bind an exact instance/renderer/task. Ambiguous targeting and stale sessions fail; there is no live-to-headless fallback. Tasks expire after 60 minutes. Owner UI can renew or Stop. Stop cancels owned work, disables task installations and clears their grants across workspaces. Source and immutable installation snapshots remain. Reload/restart loses task contexts and credentials; persisted task installations load disabled. Hiding the persistent desktop window retains its session.

## Commands, operations and conflicts

Discover the registry rather than guessing methods. Current groups cover scoped inspection, source create/read/fork/atomic patch, local web builds, Component build/run, package prepare/install/place, installation provenance/build-hash inspection, bounded docking, permissions requests and operation inspection/cancellation. Existing metadata/layout method names remain compatibility adapters. UI source, metadata and package authoring use the same services/registry. Not every transient GUI action is a command.

`commands.list` filters discovery to granted operations plus authorization/operation
bootstrap methods. `assets.catalog`, `routing.inspect`, `routing.configure` and
`asset.open` cover composition. `runtime.inspect` returns bounded session diagnostics;
tasks receive only their own command activity, never global host reflection.
Optional `scope.fileAccess[assetId] = {read: ["icons/"], write: ["icons/logo.svg"]}`
restricts virtual source reads and patches. Partial-source tasks cannot use whole-source
build/fork/open/package paths to bypass that restriction. See [composition](composition-and-decisions.md).

Every external mutation includes the `version: {epoch, revision}` from inspection. File patches additionally include `expectedAssetRevision`. Paths are virtual and bounded; a patch commits once and invalidates Component artifacts. Supply a stable `requestId` for mutation retries. Reusing that identity with different arguments fails. Deduplication is bounded and session-local, not a cross-restart exactly-once guarantee.

Build/preparation/run calls return an operation ID immediately. Inspect it until succeeded/failed/cancelled. HTTP timeout does not mean execution stopped; inspect operation/state before retrying. Revocation, scope changes and cancellation abort owned work and prevent late commits/results. Operation records and metadata-only activity are bounded and session-local. Restart interrupts the session; operations are not automatically resumed.

MCP tools are generated as `station_<method_with_underscores>`. Arguments are `{params, version?, requestId?}`; results contain `{revision, version, result}`. `station://state` is a read-only, policy-checked resource. The adapter uses pinned `@modelcontextprotocol/server` 2.3.1 over stdio; MCP annotations are descriptive, never authorization. Public HTTP MCP, remote access and OAuth are not implemented.

## Isolated headless operation

~~~powershell
bun run station:control --state <new-profile.json> --authorize <task-fixture.json>
bun run station:control --mcp --state <new-profile.json> --authorize <task-fixture.json>
~~~

A fixture explicitly supplies `{name, workspaceId?, scope}`, using the same task schema. It is trusted launch configuration, not a command argument capable of broadening a live session. The CLI holds an exclusive profile lock and writes persistence atomically. JSON-lines input accepts JSON-RPC 2.0 envelopes and the older command envelope; stdout contains protocol responses only. Diagnostics use stderr.

Local web builds use the same pinned esbuild-wasm compiler, curated SDK/React/UI resources and virtual resolver. Headless Component resources are profile-local and use the same fixed Polyengine worker, inspected imports and byte/translator hashes. Cloud builds need explicit task authorization plus configured Vercel credentials/toolchain; absence is an error, never a broader fallback. No npm installation, shell, host-file browsing or arbitrary network capability is exposed.

## Internal agents, SDK and dogfooding

Desk settings → Agents can authorize an internal task. Select it in AI chat; approved tool results may be sent to the selected model. Default chat remains **Reviewed drafts only** with its existing per-draft review. Internal task tools dispatch through the same registry and opaque task context.

Sandboxed widgets acquire declared/reviewed contracts through their private, execution-bound MessagePort. `station:assets/metadata@1.0.0` supports get/version/patch plus subscriptions. Its read result includes the state version to use for a conflict-checked patch. It never supplies source. Resource IDs are bounded by host-approved installation targets and the live task scope; retained handles recheck authority on every call.

Run the actual authoring proof against a paired isolated session:

~~~powershell
bun apps/station/scripts/author-workspace-tools.ts <credential.json>
~~~

It uses a real MCP subprocess to author an asset-list widget, metadata inspector, named selection channel and package layout; builds immutable snapshots, installs and places the composition, edits an authorized target, forks inspector source, and proves an unrelated source read is denied. These are authored sandbox assets, not built-in renderers. The script prints an ID/provenance receipt without credentials.

When a workflow exposes a missing host/SDK feature, add the narrow reusable operation/adapter, document its authority, rebuild its public artifacts, then repeat the same workflow. Do not replace it with a privileged built-in shortcut.

## Threat model and verification limits

The broker validates Host, Origin/Fetch Metadata, random credentials, exact target bindings, request size, queues and expiry. Privileged Component builds additionally require a root-renderer credential; spoofing Origin alone is insufficient. The installed desktop HTTP page contains no owner secret: a fixed Bun-to-native-root bootstrap supplies it after DOM readiness. Spoofing HTTP headers cannot obtain that credential. This bootstrap is trusted application infrastructure, not an SDK capability. Development bootstrap endpoints assume a private local development machine and are not multi-user OS authentication. Opaque guests and foreign pages receive no root/native credentials or control authority.

This protects application/guest boundaries and unauthorized connections. It cannot defend against a fully privileged same-user process able to read or alter the application's files/processes. Iframe containment and fixed WASM imports do not establish a marketplace security guarantee or hard CPU isolation. No remote-control security claim is made.

Automated tests cover a real stdio MCP client, policy denials, revisions/deduplication, scoped SDK/internal-agent parity, retained handles, cancellation and broker pairing/reload. Browser checks still verify actual rendering and input. Managed installed-desktop acceptance is a separate gate; web tests and packaged builds cannot substitute for it.

The architecture follows the useful headless/live backend separation in [SoundCraft](https://github.com/storytold/soundcraft/blob/main/crates/automation/src/lib.rs), without inheriting another application's transport trust assumptions. [MCP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports) defines message/transport conventions, not Station's permission policy.




## Shell composition direction (exploratory)

Navigation, Overview, Asset browser and editors already have stable instance IDs
in the common placement graph. Their legacy kind values encode lifecycle and
ownership contracts; renaming them to widget would not make them composable.
Keep those identities while sharing definition, inspection and placement interfaces.
Protected shell instances can legitimately have fewer settings.

The sidebar can contain vertical rows of widgets alongside protected navigation.
Its saved stack converts only when a row is explicitly added. Navigation pins and
filters remain content behavior, separate from placement. An eventual desk-shell
definition should own named regions and constrained child slots. Workspace selection,
application lifecycle, grants and native authority remain trusted infrastructure.
Inspector selection-context composition and freely editable shell recipes remain
exploratory; schema-driven text properties are implemented.

## Data and script commands

Discover `data.query`, `data.mutate` and `scripts.run` with `commands.list`. Source
access, editing and `station:scripting/evaluate` are separate task permissions.
Queries/runs return operation IDs; inspect/cancel them through the normal operation
commands. Data writes require expectedAssetRevision, and source changes discard
in-flight query/run results. Use `dock.apply` createWidget defaults.dataView to
create a linked view; it checks source read authority plus destination authority.
See [Data sources and scripting](data-sources-and-scripting.md).

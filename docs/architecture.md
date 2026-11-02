# Station architecture

Source map reviewed October 30, 2026. Read the topic contracts below for behavior
and dated acceptance. The [engineering plan](engineering-plan.md) records the
integrated work; [core-system review](core-systems-review.md) records adoption gaps.

## Package and module rules

Use [architecture-policy.json](../tooling/architecture-policy.json) and
`bun run repo check` for the dependency rules. CI runs the same rules and rejection
fixtures. Package roles describe dependencies, not a requirement for one package
per role.

| Role | Contents | Dependencies |
| --- | --- | --- |
| Contracts | Identities, schemas, descriptors and interfaces | Contracts |
| Domain | Models, reducers and invariants | Contracts and domain |
| Application | Operations and injected ports | Contracts, domain and application |
| Providers | Storage, network, compiler and platform adapters | Inward public interfaces |
| Presentation | Views over typed state/actions | Inward public interfaces |
| Composition | Construction, bindings, startup and disposal | Required public implementations |

Checks cover manifest edges, runtime/type imports, private entrypoints and cycles.
Domain/application code cannot import React, browser globals or product bootstrap.
Providers and views cannot import each other's private implementation. Exact
migration exceptions have owners and edge fingerprints; they do not permit new
violations. The [feature map](../apps/station/src/features/README.md) lists internal
entrypoints. Public reusable APIs document ownership, authority, failure and cleanup
in TSDoc. Prefer `createX(deps)` and narrow ports over global service lookup.

## Repository and package ownership

| Location | Current responsibility |
| --- | --- |
| Independent Loop repository | Capabilities, host leases/lifecycle, semantic UI, scripting and portable development contracts |
| `packages/capabilities` | Station public identities and serializable guest contracts; compatibility entrypoints remain |
| `packages/protocol` | Versioned Zod command/task schemas and effects |
| `packages/sdk` | Instance-bound guest connection and opened-document adapters |
| `packages/ui` | Shared React primitives, semantic icons and theme inputs |
| `apps/station` | Product state, policy, installation, editors, desktop and concrete adapters |
| `apps/site` | Static marketing site consuming public/shared UI |

Loop packages are external versioned dependencies. Station's installed set and
reversible links follow [Loop Kit dependencies](loop-kit-packages.md). Upstream
`@loop-kit/workspace`, WIT tooling and the independent SVG editor have their own
[proof](independent-package-proof.md); that work did not change Station's frozen
Loop dependencies. Rust and TypeScript Loop hosts remain distinct implementations.

### Portable extraction direction

Shared widget instance/slot contracts, placement reduction, property references,
editor sessions and resource inspection are candidates for Loop. Prove a portable
mechanism against Station and an independent consumer, then replace Station's
implementation through public exports. Keep consent decisions, workspace/desks,
product defaults and persistence adapters in Station. A React adapter can remain
in Station while another host consumes the same contract.

Preserve stored IDs and state during extraction. Extend the current owner until
the replacement passes its cross-consumer gate; do not add a second live dock,
workspace or permission store. Use the independent [Loop documentation index](C:/src/ilt/loop/docs/README.md)
for its proposed runtime work and current contracts.

## Source and lifecycle owners

| Concern | Source entrypoint | Contract |
| --- | --- | --- |
| Authored assets/revisions | `src/core/asset-state.ts`, `source-project.ts` | [State and assets](state-and-assets.md) |
| Workspace persistence/migrations | `src/features/workspace/application/store.ts` | [State and assets](state-and-assets.md) |
| Instance placement and history | `src/core/docking.ts`, `widget-actions.ts` | [Docking](../apps/station/src/ui/docking/README.md) |
| Definitions/default snapshots | `src/core/widget-definitions.ts`, `definition-snapshot.ts` | [Widget system](widget-system.md) |
| Commands/tasks/operations | `src/features/commands/application/runtime.ts` | [Agent control](agent-control.md) |
| Program instances/services | `src/features/programs/application/controller.ts` | [Programmable foundation](programmable-workspace-foundation.md) |
| Package preparation/install | `src/services/package-runtime.ts`, `core/package-assets.ts` | [Extensions](extensions.md) |
| Editor routing and references | `src/core/asset-routing.ts`, `asset-references.ts` | [Composition](composition-and-decisions.md) |
| Portable rendering/actions | `src/ui/components/workspace/portable-surface.tsx`, shared element adapters | [Semantic UI](semantic-ui.md) |
| Host component inventory/styles | `src/ui/components` | [UI components](../apps/station/src/ui/components/README.md) |

Paths in this table are relative to `apps/station`. The store persists authored
source, instance configuration and layouts. Controllers/scopes hold live workers,
subscriptions and services. Saving source, preparing an immutable snapshot,
installing, granting, instantiating and starting are separate operations.

Station keeps one `DockLayout`: `panels` retains the compatibility instance table,
and `containers` holds owned slot trees. Moving a view preserves its instance and
runtime; geometry adapters place the retained presentation. Editor drafts and
selection remain view-local. Root shells/templates and source child keys use this
same graph. See the docking/widget contracts for limits and migration details.

## Runtime and authority boundaries

| Execution | Boundary and current limits |
| --- | --- |
| Trusted built-in JS/React | Composition injects services; Loop scopes/leases manage cancellation and cleanup. Retained raw JS values still require provider-side checks. |
| Web contribution | Opaque `sandbox="allow-scripts"` frame, restricted CSP and an execution-bound private port. The SDK validates declarations, current grants and opened resources. |
| Rust Component | Verified bytes, inspected P3 world/imports and a fixed one-shot Polyengine worker. Host effects recheck grants; stop/timeout terminate the worker. |
| Dynamic TypeScript program | A pinned reusable wasm-rquickjs engine with explicit service/surface bindings and separate profile inspection. No engine rebuild per source edit. |
| Formula/legacy script | A separate bounded QuickJS JSON evaluator; preserve compatibility until a selected replacement covers it. |

The general Component verifier accepts the existing greeting profile, including
its P3 clock/feed/log/text surface contract. It is not an arbitrary WIT linker.
Compiler providers return untrusted bytes to one verifier. Build metadata pins
source/WIT/output hashes, world/imports, toolchain/environment and translator;
source edits invalidate the result. A deleted/recreated asset gets a new instance
identity, so a late build cannot attach to its replacement. Receipts record
provenance, not signed attestations. See [runtime evidence](component-runtime-profile.md)
and [fresh cloud build/run](independent-package-proof.md#rust-cloud-builder-repair-and-exact-byte-run).

Scripting and ordinary Components have different profiles and engines. Browser
and Node/V8 scripting acceptance does not establish Bun execution of the
multi-memory engine. Keep the limitations in the [programmable foundation](programmable-workspace-foundation.md).

These prototypes do not establish hostile marketplace confinement. Origin policy,
resource accounting, navigation restrictions and guest grants need their own
acceptance. UI descriptions and DOM transports cannot confer authority.

## Application entrypoints

- `apps/station/src/application.ts`: headless composition factory with injected
  storage/runtime inputs; owns the host and scope hierarchy.
- `apps/station/src/composition.ts`: browser bootstrap and the UI application.
- `apps/station/server/server.ts`: checkout resources and local app API.
- `apps/station/server/station-server.ts`: shared app-origin API handler.
- `apps/station/desktop/main.ts`: installed resources, native controllers and
  per-channel persistent artifact storage.
- `apps/station/server/cloud.ts`: optional account-enabled web deployment; excludes
  native/local control, Component builds and artifacts.

Each invocation owns a scope. Parent revocation cancels descendants and awaits
cleanup; it does not grant access. Provider definitions/registrations do not start
a consumer instance. Inspection exposes metadata, never live service values.
The [host lifecycle contract](https://github.com/isaac10334/loop/blob/main/packages/host/LIFECYCLE.md)
contains lease and resource-signal semantics.

Local APIs check exact Host/Origin and Fetch Metadata. Installed native bootstrap
delivers root credentials to the exact WebView rather than embedding them in HTTP
HTML. Build, browser, update and agent routes retain separate authority. Account
cookies authenticate the account service; they do not authorize workspace control
or native methods. Browser machine labels are observations, not device attestation.

## Compatibility and recovery

Keep `unit-workspace.v4`, legacy source fields, serialized widget/slot identities,
WIT namespaces and explicit capability adapters. Loading migrates old `units` /
`selectedUnitId` fields and dock references; saving uses current asset vocabulary.
Canonical and legacy grants remain separate identities. Do not rename external
project names or artifact IDs through text replacement.

A missing/disabled contribution leaves recoverable placements and source. Source
imports exclude credentials, grants, artifacts and live state. Installed snapshots
survive changes or deletion of their authoring source. Built-in recovery and raw
source editing remain available while editors/packages evolve.

## Product contract routes

| Topic | Owner |
| --- | --- |
| Accounts, presence and future sync | [Accounts and sync](accounts-and-sync.md) |
| Native views, tray/update and profiles | [Desktop](desktop.md), [native browser](native-browser.md) |
| AI conversation/context and reviewed drafts | [Station agent](station-agent.md) |
| Source sharing and forks | [Forkable workspaces](forkable-workspaces.md) |
| Authored widget/tree/theme editing | [Programmable authoring](programmable-authoring.md) |
| Data/formulas/capture | [Data and scripting](data-sources-and-scripting.md), [shortcuts](shortcuts-and-capture.md) |
| Rich text and external editor | [Rich text](rich-text-authoring.md), [ArtCraft](artcraft-integration.md) |

Keep feature updates and dated acceptance in those documents rather than appending
another status narrative here. [Decisions](decisions.md) records durable choices.

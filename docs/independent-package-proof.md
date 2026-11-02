# Independent package proof

Verified October 28, 2026. This implements the selected first development slice,
with separate evidence for an external editor, WIT tooling and Rust cloud builds.
It does not establish a managed cloud platform or a general WASM UI host.

## Repositories and ownership

The independent local Git repository is `C:/src/ilt/loop-svg-editor`. Its baseline
is `23652ca007ee0a950a2ad6c660d9e3d521c49072`; the demonstrated editor fix is
`8e61630f22d676299dfc4ac9d15bdfe9ccba4ac6` on
`codex/independent-editor-proof`. It has no remote and nothing was published.
Source/controller/static SVG validation belong there. Public SDK dependencies are
checked-in immutable tarballs with digest pins, not private Station source imports.

Loop upstream owns `@loop-kit/workspace` source/build/change-request contracts,
optional WIT capability provenance, WIT codegen/content mapper and explicit GitHub
adapter. Station retains source persistence, grants, package installation, concrete
renderers and compiler adapters. Its frozen Loop dependency set is unchanged;
the new upstream APIs are not claimed installed or published into Station.

## Same-artifact browser acceptance

From Station, after the independent package's `bun install --frozen-lockfile` and
`bun run build`, and Station's `bun run typecheck` / `bun run build`:

```powershell
bun apps/station/scripts/prove-independent-package.ts C:/src/ilt/loop-svg-editor/dist/svg-editor.station.json outputs/independent-package 3075
```

This explicit isolated fixture imports source through the existing validator,
prepares through the actual package compiler, grants only its opened sample editor
session and opens it in the production Station renderer. It does not clone any live
profile, issue cloud/native authority, or replace the normal/acceptance desktop.
The first visit initializes only that origin's localStorage; reload preserves edits.
Interactive install-review presentation itself is not automated by this fixture.

`http://127.0.0.1:3075/standalone` serves the **same prepared editor document** as the
installed contribution uses. Station adds its existing opaque sandbox bootstrap and
CSP. `outputs/independent-package/editor.html` and `receipt.json` identify the bytes:

- Artifact SHA-256: `9ee06a751638a1a4bafcc2b6161dc84050cfba1d052c03d731ab5be9d03b99d1`.
- Package-entry source SHA-256: `a70b9b43455fb178bab8b3332c120fce722419d5eac5879063c0474e0658f454`.
- Compiler: `esbuild-wasm@0.28.2` with Station's curated public SDK resources.

Browser proof used the built-in Chromium browser because Chrome was absent from
the browser inventory. Both hosts rendered and saved changed SVG through their
own persistence adapters. Station reload retained the edited source/revision.
Hostile script-bearing SVG failed preview/save without execution; Reload saved
recovered the source. Open with → Station SVG editor → Source showed the same
saved file, then the independent editor reopened. Final editor checks had no
console warnings/errors. The standalone narrow viewport had no horizontal overflow.
Screenshot: `outputs/independent-package/station-editor.png`.

The editor remains a TypeScript web contribution. It is not yet a Rust/WASM UI
Component. Standalone document storage is in-memory; Station owns persistence.

## Checked editor writes

Public `EditorSession.snapshot()` returns opened-asset files with their revision.
`editIfCurrent(path, source, expectedRevision)` uses the store's atomic patch path
or the existing task command policy. It rechecks current authority and rejects stale
writes, viewer writes and calls after release. The same editor-session grant is used;
there is no arbitrary asset-ID lookup. Existing methods remain compatible. Clients
requiring the additive methods reject older hosts rather than silently overwrite.

The independent controller retains local drafts on conflicts and requires explicit
save/reload. Its 14 tests cover validators, revocation/disposal, concurrent writes,
drafts and source/picker synchronization; browser input supplements those tests.

## WIT and Git requests

From the independent Loop checkout:

```powershell
bun run contracts:generate
bun run contracts:check
bun examples/wit-editor/check.ts
bun run workspace change C:/src/ilt/loop-svg-editor 23652ca007ee0a950a2ad6c660d9e3d521c49072 isaac10334/loop-svg-editor target/svg-editor-change.json
```

WIT is authoritative for the opened-document resource contract. Official jco parses
it; the real pinned TS7.1 Beta compiler imports its generated virtual types directly
from `.wit` and rejects invalid arguments. JSON receipts preserve source/declarations;
they are neither a new ABI nor lossless JSON-Schema/gRPC conversion. Runtime resource
adaptation and precise WIT navigation remain separate. See Loop's
`tooling/fixtures/wit/README.md` and `examples/wit-editor/README.md`.

The checked change request identifies exactly `src/ui.ts` and `test/editor.test.ts`,
with base bytes and adjacent immutable base/next snapshots. Its repository field is
an intended projection destination, not a created remote. Request identity:
`sha256:e50a2185da6695f9be74465c5b028262ee6a4b90a46dc6e55b13000e2185e24f`.

The GitHub REST adapter has 8 protocol tests for exact base/tree checks, allowlists,
tampering, lost-response retry reconciliation, JSON ordering and cancellation. No
remote write was performed. A future Loop Cloud worker can supply GitHub App
installation tokens; Loop login itself grants no repository authority. Hosting the
bot also requires durable inbox/outbox, webhook verification and operations work.

## Rust cloud builder repair and exact-byte run

The configured OIDC credential had expired and cached refresh failed. After the
user refreshed it, read-only snapshot inspection succeeded and **one** fresh VM
build ran. No installed-profile credential was copied or modified.

Fixed provider behavior: validate config before provisioning, preserve automatic SDK
auth refresh, stage snapshots until offline dependency priming succeeds, promote
working config atomically, preserve Rust diagnostics when cleanup also fails, and
reject late successful results after cancellation. Owned sandboxes are deleted.

Fresh changed Rust compiled in 32.9 seconds to 98,519 bytes, passed the common
P3 verifier, then those exact bytes ran in the existing fixed worker:

- Output and surface: `Cloud proof 2026-10-28, World!`.
- Source SHA-256: `9586f3e211646ec60c0cf10661c58e43cd4d487f890f68f6f56d28a7bd836030`.
- Artifact SHA-256: `a84a2f9756f0cf2b3b7963cd2c724f3191b85707380fe7a3ec518f0345a4b80e`.
- Evidence/manifest/bytes: `outputs/independent-package/cloud-build/`.

Source-build hashes and WIT-source hashes are not interchangeable with canonical
Component world digests. These receipts are provenance, not signed attestations.
This one successful fresh build/run does not establish every user source/toolchain.

## Verification scope and next gate

Station root typecheck/build and build:component passed. Focused app verification
passed 312 tests with 2,578 assertions; the opened-editor CAS test covers stale,
read-only and released handles. Loop package/tooling types, builds, tests and
external Bun/Node tarball consumers passed. Existing dirty work was preserved.

Next runtime gate: use the original WIT in a real executable editor operation,
generate its runtime-specific facade and bind a host-issued document resource in
both hosts. Then add a second independently owned package before extracting broader
widget/slot contracts. Managed workflows, asset storage, DLL plugins, networking,
GPU/audio, remote GitHub acceptance and installed-native acceptance remain separate.

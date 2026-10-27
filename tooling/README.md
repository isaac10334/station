# Repository tools

Use `bun run repo context @station/sdk --json` before a focused package task.
`graph`, `affected --files packages/capabilities/src/index.ts`, and
`affected --base HEAD~1` explain dependencies. `verify @station/sdk` builds and
checks its dependency closure; `bun run verify` is the full release regression.
Root `check` runs the architecture policy and rejection fixtures.

`architecture.ts` is a reviewed source snapshot of Loop Kit's identically named
tool. Keep independent CI installation: it imports pinned local TypeScript, never
an external checkout. When changing resolver behavior, port the change and its
fixtures to Loop Kit. Policies belong to each product, not the shared engine.
It uses the TypeScript parser and module resolver with each package's tsconfig,
realpaths and declared exports, including re-exports and literal dynamic imports.
Computed imports require explicit review. Generated resources are data inputs,
not separately scanned source modules. Tests are checked by focused typechecks
and rejection fixtures rather than included in the production import graph.

`local-loop.ts` owns optional Bun development links and resolved-path checks.
See [the dependency workflow](../docs/loop-kit-packages.md) for linking, watching,
unlinking, the portable prepublication artifact bridge and registry migration.
Production and packed-consumer checks reject developer links. Loop sources and
tests belong to their independent repository; Station never builds installed npm
packages or carries editable copies of them.

Task handoff template:

- Owner and owned packages/files; identify the integrating owner for shared contracts.
- Public dependencies and required export changes; forbidden files and authority changes.
- Source changes and compatibility invariants; resource owner and disposal/cancellation rules.
- Exact verification commands, evidence and unresolved issues; one recommended next slice.

Architecture/integration owns the policy and cross-package contracts. Loop runtime
owns portable capabilities/host/scripting. Station product owns assets/use cases
and concrete adapters. UI/interaction owns renderer behavior and accessibility.
Verification/security owns rejection fixtures, denial paths and acceptance evidence.
These are assignments; concurrent contract edits require one integrating owner.


`bun tooling/responsibility-audit.ts` produces a compiler-graph responsibility census
for every major Station source directory and per-file dependency/subscription leads.
Use it before/after structural work; it prints metadata, never credentials or source.
Package context now lists in-package feature READMEs and layer directories. Internal
`contracts/domain/application/infrastructure/presentation/composition` roles apply
within one npm package; the existing providers role remains a legacy infrastructure role
for unmigrated directories. Rejection fixtures cover upward feature type edges.

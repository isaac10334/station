# Loop Kit snapshot

Station vendors the `capabilities` and `host` TypeScript packages from
`C:/src/ilt/loop/packages` so clean checkouts and release builds do not need Bun
global links. This is a snapshot of the locally developed 0.1.0 packages, not a
second implementation. Source and upstream licenses are retained.

To refresh, copy the two packages' `src`, README and license files from Loop Kit.
Keep these package manifests pointing at `src/index.ts` and the host dependency
pointing at `workspace:*`. Run `bun install`, typecheck and tests.

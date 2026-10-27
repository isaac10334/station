# Loop Kit dependencies

Loop Kit source belongs to its independent repository. Station declares released
semver dependencies on `@loop-kit/capabilities`, `host`, `ui` and `scripting`.
There are no copied Loop workspaces. Capability IDs and WIT identities are unchanged.

The graph is host → capabilities, scripting → capabilities + ui. Capabilities and
ui have no package dependencies. Station builds only its own workspaces; installed
Loop packages already contain JavaScript, declarations, maps, mapped source and
optional scripting resources. Its architecture policy treats Loop as external.

## Develop across repositories

Run `bun run repo link on C:/src/ilt/loop` (or your checkout path). This validates
all package names, builds upstream in dependency order, registers each package
with `bun link`, and links the complete set with `bun link --no-save`. During the
prepublication override bridge, Bun 1.3 gives overrides precedence; the setup
explicitly selects root development junctions and removes nested shadow links.
For hoisted installs it moves the real installed directories into a private
node_modules backup, then restores them on unlink or rollback. It never deletes
those directories. Failure restores frozen
resolution. It verifies manifest and lockfile bytes after every operation.

Run `bun run repo link status --json` to inspect each consumer, public entrypoint
and real package root. It rejects duplicate roots, mismatched transitive packages,
missing declarations, stale linked output and modified installed package bytes. Run `bun run repo link watch` while editing upstream;
the upstream watcher serializes dependency-ordered builds. Restart Station dev
after dependency edits to regenerate embedded compiler resources and workers.
Plain `bun install` may reset links; inspect actual paths after installation.

Run `bun run repo link off` to remove local junctions and reinstall from the frozen
lockfile. This does not unregister Bun's global links, which other consumers may
use; `bun unlink` inside an upstream package explicitly unregisters it if wanted.
Never use `bun link --save` or commit machine-specific `link:`/absolute `file:` paths.
Production builds and package checks reject development links.

`bun run loop:prove <checkout>` temporarily adds an export, proves watch emits
JavaScript/declarations and Station's public import and guest compiler receive it,
checks production rejects links, then restores exact source bytes, rebuilds and
unlinks. Run with a checkout you are not simultaneously editing.

## Clean installs before npm publication

As of 2026-10-20, the first npm publication is pending. Root overrides select four
portable tarballs under `artifacts/loop-kit`, with checksums in `integrity.json`.
These are ordinary packed dependency artifacts, not workspaces or editable source
copies. Keep those artifacts in the Station change so CI needs no external Loop
checkout, global Bun registry or npm credentials. `bun install --frozen-lockfile`
works independently. `bunfig.toml` pins hoisted installation: Bun 1.3.14
isolated installs fail to fetch relative transitive tarball overrides from an empty
cache. `bun run loop:ci-check` proves a new frozen install with an empty cache and
no upstream checkout. Optional native engine preparation retains its separate
documented compiler/Rust prerequisites.

After publishing matching npm versions, remove the four overrides and artifact
directory, run `bun install`, and verify `repo link status`, typecheck, tests,
build and packed consumers. Public package manifests already declare semver.

For a temporary Git revision build, use Loop's `release:git` helper with a public
repository and full remote SHA. It fetches into a new checkout, requires the
release workflow at that revision, verifies and packs there, and emits a remote
revision receipt. Use the inspected archives in portable overrides; never claim
a local dirty revision is available to CI. See Loop's
[release guide](https://github.com/isaac10334/loop/blob/main/RELEASING.md).

## npm account action

An npm owner must establish control of `@loop-kit`, bootstrap packages if required,
configure each trusted publisher for `isaac10334/loop`, `npm-publish.yml`, environment
`npm`, and configure GitHub environment reviewers. The release workflow defaults
to dry run; publishing requires an explicit dispatch and environment approval.
Canaries use explicit prerelease versions and the `canary` tag. No registry
publication is performed by linking, building or release preparation.

The October 20 semantic UI follow-up selects `loop-kit-ui-0.1.0-semantic-ui.tgz`
for UI, alongside the existing three snapshots. `integrity.json` and the installed
file receipt pin its generated JavaScript, declarations and mapped sources. See
[Semantic UI](semantic-ui.md). Development links were removed before the frozen
production and external-consumer gates.

# Station

A local, self-extending workspace for assets, built-in widgets, authored web content and WebAssembly Components. Workspace data and capability grants are saved in browser `localStorage`; the Bun server builds Component source in Vercel Sandbox and stores verified artifact bytes locally by hash.

The UI and source model use **asset** terminology. Existing workspace data migrates on load; legacy storage and WIT wire identifiers stay compatible. See the [asset and programmability exploration](docs/explorations/assets-and-programmability.md) for proposed theme assets, editors, packages, SDKs, grants, AI and desktop sessions.

## Run

For the installable Windows app and automatic canary updates, see
[desktop setup](docs/desktop.md) and the
[latest canary installer](https://github.com/isaac10334/station/releases/tag/canary).

```powershell
bun install
bun run dev
```

Open <http://127.0.0.1:3000/>. `server.ts` uses Bun's HTML route, so it bundles the TypeScript frontend during development.

## What works

- Rust **Component** assets with multi-file Cargo/WIT projects, and authored HTML web content with isolated iframe previews.
- One widget-instance system across bento slots, editor/browser views, nested Layout tabs/carousels, docks and floating presentations. Dedicated hold handles and keyboard movement use the same validated tree. Backing splits resize with pointer or keyboard; layout operations support undo/redo. Search definitions to create a new instance, or existing instances to move one.
- The `Greeting` sample embeds editable Rust/WIT source. Its P3 world exports `async run(input)`, consumes a host future and stream, and imports a P3 monotonic clock plus logging and a plain text surface.
- Polyengine 0.6.7 translates verified Component bytes at runtime inside a one-shot worker. The four WIT grants cover logging, the async feed, text surface, and P3 clock. Minimal WASI providers expose no filesystem preopens, environment variables, or network provider.
- The browser editor saves source edits per workspace and marks the previous artifact out of date. The Artifact page builds one asset in a fresh Vercel Sandbox, verifies its bytes, and offers a download. A build response is discarded if the source changed while it ran. The Run tab has been verified in Chromium with a fresh P3 Sandbox build and visible future, stream, log, and text effects.
- A compact bottom browser selects Components; `Shift+W` toggles it. The main panel has Back/Forward history. App preferences and per workspace data have separate state.

## Build the sample Component

This local build requires pinned nightly Rust and its `wasm32-wasip2` target. `wit-bindgen` 0.60.0 and WIT dependencies are locked by the sample project.

```powershell
rustup toolchain install nightly-2026-09-08 --profile minimal
rustup target add wasm32-wasip2 --toolchain nightly-2026-09-08
bun run build:component
bun run typecheck
bun run build
```

`build:component` compiles Rust offline from the lockfile, inspects the Component's actual P3 contract, embeds only editable source, and runs a real Polyengine invocation check. `build` emits one self-contained `dist/index.html`; building and running Components still require the local Bun API server.

## Vercel Sandbox build setup

The linked Vercel project is `isaac10334s-projects/unit-workspace`. Authenticate locally with `vercel login`, then run `vercel link --project unit-workspace --scope isaac10334s-projects` and `vercel env pull`. Bun loads the ignored `.env.local` OIDC token. An explicit `VERCEL_AUTH_TOKEN` also works for local or automated runs; never commit it. The Vercel plugin supplied account/project lookup and Sandbox documentation; the SDK performs builds from the Bun server.

`vercel-sandbox.json` records the build-ready toolchain snapshot. Its snapshot expires after 30 days; run `bun run setup:sandbox` to provision and prime another one. Setup requires Vercel authentication and temporary network access to install pinned nightly Rust, its target, a C linker, and cached Cargo dependencies. It verifies a real P3 sample build before recording the snapshot. Each user build then uses a fresh nonpersistent Sandbox with network access denied, `--offline`, and `--locked`; the Sandbox is deleted after bytes are read. Dependencies beyond the cached crates need a new snapshot. Polyengine inspects the built world/imports, and artifact metadata records source/WIT/byte hashes, profile, toolchain, snapshot, and a unique build ID. The browser verifies downloaded bytes and the translator asset before invocation. This recorded provenance is not a cryptographic attestation. See [architecture](docs/architecture.md) and [runtime measurements](docs/component-runtime-profile.md) for the security boundary and browser comparison.

The v4 workspace model migrates workspace names/descriptions and app preferences from the previous v3 browser state. The earlier demo assets remain in the old localStorage keys and are not shown as Components.

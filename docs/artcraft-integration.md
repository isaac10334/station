# ArtCraft and external vector editors

## Station VectorCraft integration

SVG **Open with > VectorCraft** uses the unmodified, hash-pinned official
[v0.14.0 web release](https://github.com/storytold/vectorcraft/releases/tag/v0.14.0).
`prepare:vectorcraft` downloads/verifies the archive, retains upstream notices and
fonts, and builds only Station's message adapter. Archive SHA-256:
`6f28a8bcee1c5ad6c37c6a0c44058793a40ea4443085866d5f78afb16aba075e`.
Web/cloud servers and desktop packaging share the vendor-resource handler.
Installed-native acceptance remains separate from browser acceptance.

The iframe has an opaque origin (`sandbox=allow-scripts`, also enforced by its
HTML response CSP). Only public vendor resources have CORS headers; its CSP
prevents external network access. Private in-frame memory implements upstream's
Storage interface. It receives no Station storage, credentials, SDK, native RPC,
grants or conversation/provider access. Start is deferred until first visibility:
hidden browser frames cannot reliably process egui commands.

`vector.editor.commands`, `vector.editor.execute` and `vector.editor.export`
share the application command registry. Typed inputs/outputs, effects, resource
scope, source revision and cancellation use the existing command runtime. A
mounted session lends bounded methods rather than its Window/API; unmount and
application disposal unregister it. Partial-file tasks cannot issue whole-document
operations. Document/selection/view prefixes plus explicit undo/redo actions are
allowed; upstream file/native operations are denied. Cancellation drops an
outstanding reply; an already started vendor command may have changed its isolated
draft, so cancellation does not imply rollback.

**Preview export** validates static SVG and presents a draft. **Apply SVG** exports
again, requires review if drawing changed after preview, and compares saved source
before persistence. Rejection retains both drafts. The SVG asset contract is
currently 32 KiB/256 elements, excludes executable content/external resources and
rejects unsupported elements. This route does not provide lossless storage of all
VectorCraft project features. Source recovery and SVG-Edit remain available.

## Upstream API and isolated investigation

The release supports static hosting, relative module/WASM/font resources and
embedding. It needs `application/wasm` for its WASM file. No upstream Rust build
or fork is needed. Its public API supports:

```js
const app = window.vectorcraft; // Only inside the isolated vendor wrapper.
await app.commands();
app.openFile('drawing.svg', new TextEncoder().encode(source));
// Import is queued: wait for document.inspect to report the imported title.
await app.request('document.inspect');
await app.execute('shape.rectangle', {x:24, y:24, width:48, height:32});
const output = await app.request('app.export', {format:'svg'});
// output.dataBase64 contains the exported bytes; validate before Apply.
```

The v0.14.0 live catalog exposes `shape.rectangle`; older source examples using
`object.rectangle` are not proof of the runtime command contract.

The earlier investigation used `scripts/probe-vectorcraft.ts` on its own origin,
port 3056, with an unpacked official archive under `outputs/vectorcraft-spike/`.
It imported a synthetic purple rectangle/white circle, inspected bounds and
exported a valid 471-byte SVG. A visible command button created rectangle object
4 and added Rectangle to undo history. This probe had no Station session or
native authority and is separate from the product editor route.

Upstream web warnings for unsupported window-title and system-theme viewport
commands are known. An unattributed MutationObserver observe error was recorded
on the older probe; it was not established as an upstream defect. Do not infer
installed-native acceptance from the probe or browser checks.

## Other editor options and native ArtCraft

[Boxy's component](https://boxy-svg.com/component) remains a separately licensed
embedding option. No Boxy package or credentials are bundled. SVG-Edit remains
the existing built-in drawing/recovery route. Keep wrappers small and preserve
upstream ownership rather than forking complex editor applications.

A native ArtCraft adapter should use a configured provider and dedicated control
endpoint, scoped read/write folders and supervised cancellation. Never silently
attach to port 7979: different Craft apps can use it, and the
[native control protocol](https://github.com/storytold/vectorcraft/blob/v0.14.0/docs/control-protocol.md)
is unauthenticated. Native launching remains separate work; no unsupported deep
link is presented as an implemented launcher. Installing/opening an editor and
editing asset source do not activate Station programs or grant service access.

## Editor acceptance, 2026-10-21 local time

At the isolated production-mode origin `http://127.0.0.1:3055/`, the real SVG
Open-with menu selected VectorCraft. The opaque frame loaded the authored SVG;
its catalog exposed live parameter contracts. A rectangle command returned object
3, dirty state and Rectangle undo history. Preview validated its SVG; Apply saved
a new path with the expected bounds and `stroke-miterlimit="10"`. Source inspection
confirmed the stored bytes, and a fresh non-HMR tab reopened that document. A
`view.fitArtboard` command fitted the artwork. Command controls use a dialog so
opening them does not scroll the egui canvas out of view and stall its event loop.

Regression tests cover task editing denial, partial-file denial, forbidden commands,
cancellation, stale source, session replacement/unregistration, opaque HTML CSP,
path escapes and safe static export attributes. Root typecheck/build, architecture
checks and the complete 286-test suite passed. Evidence:
`outputs/station-vectorcraft-integrated.png`.

The browser recorded no application errors; upstream's unsupported window-title
and system-theme warnings remain. The old unattributed MutationObserver failure
did not recur in this integration. The normal installed canary/profile and native
ports were not touched. Native launcher/installed packaging acceptance, full
VectorCraft project fidelity and unrestricted SVG documents remain separate scope.

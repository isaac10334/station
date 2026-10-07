# Component runtime profile — 2026-10-05

## Runtime choice

[Polyengine's runtime documentation](https://github.com/polymorph-components/polyengine) describes runtime translation of Component bytes and P3 tasks, futures, streams, and cancellation. Its [embedder contract](https://github.com/polymorph-components/polyengine/blob/main/contracts/embedder-api.md) maps async host values to promises and streams; its [security guidance](https://github.com/polymorph-components/polyengine/blob/main/docs/security.md) limits claims about hostile guests. [jsco's own documentation](https://github.com/pavelsavara/jsco) describes dynamic browser loading of P2 and P3, and its P2 path passed the comparison below. Jco remains viable for trusted P2 authoring, but its generation path emits artifact-specific JavaScript and Jco 1.15.2 failed to parse this P3 fixture in the local spike. A server-side [Wasmtime Component provider](https://docs.wasmtime.dev/api/wasmtime/component/index.html) is a future option with a different deployment and browser transport boundary; it was not spiked here. The [official Rust Component guide](https://component-model.bytecodealliance.org/language-support/creating-runnable-components/rust.html) describes the nightly `wasm32-wasip2` library route for P3, so the binary's inspected world and imports determine its profile.

## Scope and provenance

Browser: Codex in-app Chromium 154.0.0.0 on Windows 10 (user-agent reported); Bun 1.3.14 served localhost. The P2 common-workload input was the same SHA-256-verified 73,423-byte Component, `49969aafb40b4137568b91995e6eb091eb0d76a6fb1750230827f247c087ff4e`, with inspected `wasi:*@0.2.3` imports. All three runtimes returned `Hello, World!`, one host log, and matching text surface. Packages: Jco 1.15.2 with Preview 2 shim 0.20.1; Polyengine runtime/translator/WASI 0.6.7; jsco 0.2.0-preview.0. The disposable benchmark source and raw browser output are in `%TEMP%/unit-p3-runtime-spike/browser-profile.ts` and its local page. These are five consecutive calls in one page, so the first sample includes cold initialization and later samples benefit from browser caches. Time is `performance.now()` wall time in milliseconds; p95 below uses nearest rank, so it is the maximum of five samples. The three runtimes did not share a production worker wrapper; these measurements compare their translation and invocation APIs, not isolation overhead.

| P2 browser phase | Five raw samples, cold first (ms) | Median | p95 |
| --- | --- | ---: | ---: |
| Jco generation | 172, 57.4, 55.1, 46.7, 46.0 | 55.1 | 172.0 |
| Jco adapter module load | 2.8, 3.2, 3.5, 1.9, 2.5 | 2.8 | 3.5 |
| Jco instantiation | 1.2, 1.2, 1.4, 0.9, 0.9 | 1.2 | 1.4 |
| Jco first call | 0.8, 0.3, 0.4, 0.3, 0.4 | 0.4 | 0.8 |
| Polyengine translator creation | 6.7, 5.1, 5.1, 5.2, 5.1 | 5.1 | 6.7 |
| Polyengine translation | 28.4, 5.4, 4.6, 4.0, 4.3 | 4.6 | 28.4 |
| Polyengine instantiation | 5.3, 4.9, 1.4, 1.3, 4.3 | 4.3 | 5.3 |
| Polyengine first call | 2.7, 0.3, 0.3, 0.2, 0.3 | 0.3 | 2.7 |
| jsco parse | 8.5, 2.3, 2.1, 2.3, 2.3 | 2.3 | 8.5 |
| jsco host module load | 12.9, 0.3, 0.9, 0.8, 0.1 | 0.8 | 12.9 |
| jsco instantiation | 4.9, 1.0, 1.5, 1.0, 1.5 | 1.5 | 4.9 |
| jsco first call | 0.5, 0.1, 0.1, 0.0, 0.1 | 0.1 | 0.5 |

A second browser pass called each instantiated component twice. The second call on the **same instance** measured Jco `0.1, 0.0, 0.1, 0.1, 0.1` ms (median 0.1, p95 0.1), Polyengine `0.2, 0.2, 0.4, 0.2, 0.3` ms (median 0.2, p95 0.4), and jsco `0.0, 0.0, 0.0, 0.1, 0.1` ms (median 0.0, p95 0.1). Values near zero are close to the timer's practical resolution. The second pass ran while a Sandbox build was active and had noisier setup times; the warm-call figures are reported separately rather than mixed into the first table.

Jco emitted four core modules and 284,138 bytes of artifact-specific JavaScript with the browser spike's `base64Cutoff: 0` options. The earlier Node planning probe used different generation options and measured 83,121 bytes of JavaScript, 203 ms cold and 49–55 ms warm; those sizes are not directly comparable. Jco's translator loads two fixed core Wasm assets of 8,831,829 and 15,895 bytes. Polyengine uses a fixed 1,880,176-byte translator Wasm, SHA-256 `ddb2e0144a9c5a1d65ff6ba05c45f913cc4111bc92a11624a44ae49486260e13`. jsco required no external Wasm asset in this P2 browser spike. The combined spike bundle was 1,390,272 bytes of JS across eleven chunks and shares code among all three runtimes, so that number is not a per-provider shipped size. The production fixed Polyengine worker bundle was 372,508 bytes of JS plus the translator asset. Browser resource entries reported byte counts before HTTP compression.

## P3 feature and production path

An editable Rust `async run` export consumed a host `stream<u8>` and `future<u32>`, called `wasi:clocks/monotonic-clock@0.3.1`, logged the stream byte count, and set a plain-text surface. `wit-bindgen` 0.60.0 compiled it with `nightly-2026-09-08` targeting `wasm32-wasip2`; the inspected binary has the P3 clock import and async export and also records 14 incidental `wasi:*@0.2.12` interfaces plus its two workspace interfaces. The fresh Vercel Sandbox build from snapshot `snap_FAb2HBLqJxXmgjb1XUbIvgRm82eF` produced 98,503 bytes, SHA-256 `dee082a9ed63a65d78770d833833a33b2936bbe076881219004ec299c6f102f4`, for browser-edited source hash `381cb8486639f9db1efccff74256f586317dc70e7d5a6eec9f211f95435e7020`. Its inspected world digest is `sha256:6b54582b7a2e3a2d930ff461c3d9b8204fdcdd10dc0accde54a99e9fba0d9e5a`. The browser verified exact bytes and translator hash, then displayed `Hello, World!`, `greeting received 5 bytes`, and the matching text surface. Missing grants failed before worker execution.

The next five production P3 runs used a **new one-shot worker each time**. Startup is measured from posting verified bytes until the worker receives them; worker duration excludes that startup. Asset load includes the translator fetch and SHA-256 checks. These are phase timings, not a claim of total user-perceived latency; source/byte fetch occurs before the worker is posted.

| P3 browser worker phase | Five raw samples (ms) | Median | p95 |
| --- | --- | ---: | ---: |
| Startup | 14.2, 13.1, 11.1, 12.0, 13.1 | 13.1 | 14.2 |
| Asset load and verification | 7.3, 6.6, 5.6, 5.9, 5.8 | 5.9 | 7.3 |
| Translator creation | 5.5, 4.9, 4.6, 4.6, 4.7 | 4.7 | 5.5 |
| Translation and import inspection | 27.4, 26.8, 25.7, 25.6, 26.1 | 26.1 | 27.4 |
| Instantiation | 6.0, 6.0, 5.4, 5.4, 5.7 | 5.7 | 6.0 |
| First async call | 6.9, 6.7, 6.1, 6.3, 6.3 | 6.3 | 6.9 |

The browser P2 comparison favors jsco on this small warm workload, but it does not establish jsco's P3 future/stream behavior or a safe import membrane for this app. Polyengine is selected because its P3 contract and fixed-code worker path passed the real source-to-browser proof. Its 0.6.7 version is pre-1.0 and its security guidance does not promise hostile-guest confinement. A separate-origin runner remains necessary before marketplace installation.

The final schema-two manifest is immutable at `dee082a9ed63a65d78770d833833a33b2936bbe076881219004ec299c6f102f4-4a4729fc-c759-4516-8580-061617fb883f.json`; it records build ID `4a4729fc-c759-4516-8580-061617fb883f` for the restored source. Browser checks also showed that a source edit disabled Run; a revoked grant cleared old effects and denied the next call; and a deliberately non-returning P3 guest was stopped by both Cancel and the 30-second timeout. The fixture was then removed and the normal source rebuilt. [Final browser screenshot](assets/component-p3-browser.png).

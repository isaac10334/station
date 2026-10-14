# Station checkpoint prompts

Implementation handoffs, checked against this checkout on 2026-10-14. Paste one fenced block into a fresh Codex chat in this repository. Preserve unrelated dirty work. These prompts describe remaining work, not completed features.

Already implemented: Luna default for fresh AI settings, curated Stealth model picker, Station product context, chat-owned scrolling, settled theme number edits, atomic single-instance/slot removal, shared host/site colors/fonts/theme reveal, SVGL Windows/GitHub geometry, shared S SVG/PNG/Windows ICO. Explicit saved model choices remain intact.

## AI conversation experience and model discovery

```text
Finish Station AI Chat. Read AGENTS.md, DESIGN.md, docs/architecture.md and the component inventory. Inspect ui/ai-chat-widget.tsx, ui/components/ui/model-picker.tsx, providers/ai-capabilities.ts, providers/station-assistant-context.ts, core/chat-models.ts, services/ai-settings.ts, services/ai-tools.ts, services/widget-grants.ts and contracts/ai-conversation.ts. Luna, the picker and a single bounded message scroller are already implemented; preserve them.

Inspect @stealth/chat-thread and @stealth/streaming-text through shadcn before adapting source/dependencies. Deliver readable streaming Markdown/code with copy, grouped turns, tool results/progress, review cards, retry and stopped states. Never execute raw HTML/code from replies. Keep header/model/tools/New chat and composer outside message scrolling. Follow the latest only while near the bottom; preserve upward scrolling and offer Jump to latest. Test IME, Enter/Shift+Enter, keyboard focus, narrow panels and reduced motion; avoid per-token live-region announcements. Model/grant changes must visibly start fresh history. Cancellation/removal/workspace or desk switch must stop provider, reviews, scopes and subscriptions.

Add a bounded/cancellable public catalog service for GET https://ai-gateway.vercel.sh/v1/models, with validated language-model metadata, timestamped cache and curated offline fallback. Keep recommended choices small; add searchable expanded/custom ID selection. Show real base input/output prices and tier/caching/reasoning caveats. Do not invent speed rankings, confuse catalog presence with account eligibility, silently switch failed models or enable Station grants from model metadata. Authenticated eligibility refresh, if added, is explicit and keeps the user key out of logs/prompts/plaintext persistence unless the existing remember option was chosen.

Trusted product knowledge stays in station-assistant-context.ts. Live context uses explicitly granted, bounded resource reads and a visible context inspector. Do not send all workspace source automatically or put untrusted files into the instruction channel. Keep package authoring/review/installation/activation distinct and native/agent roadmap claims accurate.

Acceptance: long streams cannot move New chat/composer; reading old messages never snaps back; unsafe markup is inert; denied/revoked tools stay denied; provider/review cancellation works; offline/custom model selection works; source-only draft review never installs/runs. Test stream/tool/context boundaries, verify a real reply only with an available user-owned key and label that separately. Run tests, typecheck/build, browser reload/console inspection, 375/768/1024/1440, light/dark/reduced motion. Update reusable contracts/current docs. No unapproved provider spend or deployment.
```

References: [model picker](https://www.stealth.pm/ui/model-picker), [chat thread](https://www.stealth.pm/ui/chat-thread), [streaming text](https://www.stealth.pm/ui/streaming-text), [Gateway discovery](https://vercel.com/docs/ai-gateway/models-and-providers).

## Theme/editor input audit

```text
Finish Station theme input behavior. Read DESIGN.md and existing CSS/component ownership. Inspect ui/components/workspace/theme-editor.tsx, theme-number-field.tsx, ui/components/ui/color-picker.tsx, core/theme-assets.ts, ui/theme-runtime.tsx, services/svg-icons.ts and packages/ui. Spacing/radius already hold local string drafts, commit on blur/Enter and restore on Escape; preserve this instead of per-keystroke validation.

Reproduce every field with clearing/retyping, partial decimal/negative/hex, select-all/paste, IME, arrows, Enter/blur/Escape, external changes while focused and viewer read-only access. Keep drafts stable and commit only valid settled values against current source. Show adjacent actionable errors. Avoid stale closures overwriting other token edits during picker drags. Handle all schema-valid color formats consistently, including rgb/hsl/oklch/alpha; never silently display a different color because a narrower picker parser failed. Preserve hue through gray/black, last-valid host tokens on invalid JSON, and Code repair.

Make semantic icons searchable with live glyph/reference previews, missing-resource recovery and clear static-SVG limits. Reuse Stealth picker/swatches and shared semantic controls. Keep view drafts, source, validation and effects separate. No arbitrary host CSS, remote fonts, script injection, parallel store or global geometry patches. Resource-scoped viewer policy must protect SDK writes too.

Acceptance: clear 8 and type 12 naturally; invalid drafts cannot corrupt JSON; alpha/OKLCH match preview; fast drags remain responsive; external edits are retained; unsafe/missing SVGs fall back; live theme changes retain guest frames. Verify keyboard, both modes, reduced motion and four widths. Run focused tests, bun run typecheck/build, reload/console inspection; update contracts/docs where materially changed.
```

## Tray lifecycle, update UX and canary publication

```text
Implement Station desktop tray/lifecycle/update UX with pinned Electrobun 2.0.2. Read docs/desktop.md, .github/workflows/canary.yml, apps/station/desktop/main.ts, electrobun.config.ts, hutch.config.ts, scripts/prepare-desktop.ts and installed .hutch/devkit types/source. Use Context7 then pinned/official sources. Keep the explicitly selected Bun main process; do not migrate to Cottontail or Rust in this task. Shared S SVG/PNG/ICO assets and build.win.icon are already configured; verify installed branding, not just source.

Current delivery: main push/manual dispatch builds/checks/installs on Windows; publish archives canary-RUN-ATTEMPT, advances fixed tag canary, retains old hash patches, uploads payloads first and update metadata last. Keep serial publication, identifier/channel/fixed origin/user-data and /releases/download/canary; never use stable-only /releases/latest. Add concise reproducible publish/setup instructions. No public release without explicit authorization.

Add persistent tray: Show Station, Check for updates, Restart to update only when ready, Quit. X defaults to hide/minimize to tray, preserving the same WebView/session. Distinguish hiding, destruction, explicit quit, OS shutdown and updater restart through real pinned lifecycle APIs. Disable exitOnLastWindowClosed only with correct tray ownership. Restore/focus existing windows; repeated hide/show must not duplicate them. Tray failure leaves a recoverable visible app. Quit/restart bypasses close-to-tray and disposes API server, native views, ports and pending work once. Define/show whether merely hidden work continues; retain desk-switch shutdown semantics.

Create a narrow trusted desktop update service with cached immutable states: unsupported/dev, idle/up-to-date with last check, checking, downloading with real progress if supported, ready, applying, error/retry. Menus/tray/app Settings subscribe to the same state. Expose only bounded serializable check/apply operations to trusted app UI; foreign pages/SDK guests get no native authority. Never claim up-to-date on failure, silently apply, offer restart before bytes are ready or repeatedly prompt every five minutes. Preserve startup/five-minute checks and automatic download, explicit confirmation/Later, duplicate-operation guards and active-work consequences.

Acceptance on a normally installed Windows canary: X hides to tray, Show restores same session, Quit removes tray/process/API port, A→B downloads and applies only on confirmation, network failure/retry works, data/grants/legacy keys survive, menus/UI agree, branding appears. Use a managed test install/CI and isolated artifact feed or expressly authorized prerelease; Store-redirection uninstall paths are not representative. Run typecheck/tests/build/desktop:build and build:component if relevant. Native acceptance requires actual installed behavior, not browser mocks. Document evidence and exact remaining platform limitations.
```

References: [Tray](https://framework.blackboard.sh/electrobun/apis/tray/), [Cottontail](https://framework.blackboard.sh/electrobun/guides/cottontail/). Verify exact pinned update/icon/close APIs.

## Native browser tabs

```text
Deliver real desktop browsing tabs in Station using Electrobun native BrowserView/<electrobun-webview>. Inspect desktop/main.ts, pinned .hutch/devkit browser/main SDK, core/docking.ts, presentation lifetimes, public Loop Kit contracts and docs/architecture.md. Read DESIGN.md and reuse existing tabs/menus/tooltips. Keep Bun and one placement system.

Build a resource-owned browser service and widget: address, Back/Forward, Reload/Stop, tabs, loading/title/errors, safe popup/new-window handling, desktop-only web-app fallback. Persist URL/tab configuration with the desk, never handles/cookies/credentials/grants in templates. Verify whether the sandboxed root preload supports the tag; if not, design the smallest explicit trusted controller seam. Do not disable root sandboxing casually. Foreign pages stay sandboxed, get no Station SDK/command/native RPC, and cannot navigate/reuse the root. Guest event messages are untrusted signals. Validate schemes/payloads; permit http/https, gate external protocols/downloads/browser permissions, reject privileged file:/views:/javascript: and Station/API loopback targets. Do not leak credentials through preloads/URLs/referrers.

Native views are distinct layers: DOM z-index cannot cover them. Integrate real mask/passthrough APIs for menus/dialogs/drag overlays, clipping and resize/scroll/tab visibility. Moving/floating an owner preserves its tab session; removing/switching desks closes views/subscriptions, returning starts configured views only. Hiding is not destruction. Select explicit persistent/private partitions outside exported templates. Do not claim one OS process per tag or network-proof isolation.

Define focused serializable browser operations with leases/resource grants usable by future headless commands. Never return raw BrowserView/DOM objects or expose arbitrary script injection as the first capability. Agent page automation requires separate explicit authority; an invitation is not native browser permission.

Acceptance in installed Windows: two unrelated sites, navigation/title/loading, keyboard address bar, popup policy, forged messages denied, host menus actually cover native content, float/move retains state, desk removal closes views, root/source/grants remain isolated, reload restores configuration without credentials. Verify native logs/renderer failures and web fallback. Run relevant tests, typecheck/build/desktop:build; update lifecycle/security docs. A localhost iframe imitation is not native acceptance.
```

Reference: [webview-tag architecture](https://framework.blackboard.sh/electrobun/guides/architecture/webview-tag/): removal/reinsertion creates a new view; overlays need masks; sandbox disables application RPC; process arrangements differ by renderer.

## Headless command plane for agents, humans and SDK clients

```text
Implement a headless Station command vertical slice, independent of React/simulated clicking. Read core/model.ts, core/docking.ts, composition.ts, contracts/services/providers, packages/capabilities/sdk, docs/forkable-workspaces.md and live C:/src/ilt/loop public types/TSDoc. Preserve wire/storage IDs and dirty work. Generic Loop Kit lifecycle is distinct from Station authorization; do not build a universal cloud/store framework now.

Separate principal (human/agent/extension/service), authentication/session, resource grant, lease and versioned operation. GUI, AI tools and SDK bindings call the same validated domain operations. Presence/cursors confer no authority. Start with list/read assets, bounded source edit with expected revision, create/observe an agent-owned desk, inspect layout, create/move/close permitted instances and cancel. Target workspace/desk/asset/owner explicitly; never use whichever GUI desk is active or switch the user's desk implicitly. Return serializable results, not raw Store/Host/DOM; no blanket native grants or guest store.patch escape hatch.

Use strict schemas, operation IDs, resource/principal-scoped bounded idempotency, exact revisions and a commit boundary. Validate authorization/ownership/limits/layout/source-build currency before atomic state publication. Reject stale/denied requests without partial changes. Document retention/restart behavior; in-memory dedup isn't durable. Audit actor/target/revision/result without secrets or unapproved source. Subscriptions are resource-filtered/backpressure-bounded/cancellable. Revocation cancels pending effects and denies retained operations. Existing owner channels are bounded ephemeral coordination, not a global broadcast/durable store; add explicit schema/migration seams for future plugin state.

Ship one minimal authenticated adapter: stdio JSON-RPC for launched agents OR loopback HTTP/TCP with a random session credential. An MCP adapter may then reuse operations, not duplicate policy. Localhost/Origin isn't authentication. No anonymous port/implicit remote enrollment/credential serialization. Each agent gets its own desk and approved resources; users can observe/cancel without accidentally sharing edit authority. Publish read-only activity/presence for future monitoring/voice takeover; cursors are optional observation, never required for command success.

Acceptance: a client without a browser creates its own desk, reads/edits one granted asset at an exact revision, receives a committed event and GUI sees it; foreign desk/asset access fails; stale/duplicate/malformed/cycle/limit cases reject; revoke stops pending work; editing invalidates builds; user's desk/selection is unchanged. Prove no UI bootstrap in headless core and exercise the real transport. Run tests/typecheck/build/browser subscription checks and document contracts/examples. Native process supervision/Discord bot containment is a separate granted-service slice.
```

## Marketing, supplied 3D integration and future Station publishing

```text
Finish apps/site using DESIGN.md and Stealth/Motion. Host/site colors/fonts/theme reveal are shared through @station/ui; static navigation has SVGL Windows/GitHub geometry, canary link and S favicon. Preserve no-JS downloads, saved theme, reduced-motion/unsupported-transition fallback and separate no-secret Pages/Vercel deployment. Current CSS scene is perspective, not true isometric. Use docs/prompts/station-3d-art-direction.md as the external asset brief; don't invent delivered assets or replace it with another tilted CSS-card demo.

After assets arrive, inspect format/licenses/manifest and build a small typed renderer adapter. Prefer pipeline runtime; do not stack unnecessary rendering/physics libraries. Preserve orthographic projection, semantic material palette, reserved responsive artboard, visible-only lazy loading and static SVG/WebP no-JS/low-power/reduced-motion/context-loss fallback. Motion owns DOM controls/labels; scene owns finite clips/physics. No auth/workspace/SDK secrets in public assets. No live Station iframe demo yet: label illustration truthfully unless a separate isolated demo contract is built. No generic eyebrows/numbers, vague claims, autoplay particles or blue/purple backgrounds. Tune actual typography/spacing and preserve canonical brand geometry.

Resolve downloads through the canary-tag endpoint with owner/repo/asset validation and fixed known URL fallback; never releases/latest. Public site deployment stays separate from Component backend credentials. Document Pages workflow/domain or separate Vercel project with workspace access. Do not deploy without authorization.

Future Station authoring: reproduce the site as a curated web SourceProject first; then reviewed immutable static export with files/checksums. Design a narrowly granted publisher for one target/revision and rollback. Credentials remain host-owned, workspace sessions never become public hosting, and author/build/review/export/publish/activation stay distinct. No unrestricted shell/npm/upload shortcut.

Acceptance: no-JS/offline downloads, matching fonts/colors/theme reveal, four widths, local fonts, supplied 3D states/sleep/reset/error fallback, measured byte/draw/frame budgets and no console errors on reload. Run typecheck/build:site and app build for shared changes, inspect screenshots/network. Report missing pipeline assets and unperformed deployment accurately.
```

## Checked release/runtime facts

- `.github/workflows/canary.yml`: main push/manual dispatch, immutable build archive plus fixed canary update tag, payloads before metadata. Nothing published by this checkpoint.
- Desktop explicitly ships a Bun main process with Electrobun 2.0.2/native WebView2. Keep Bun until a separate compatibility audit justifies switching.
- Startup/five-minute checks and automatic download exist; applying is confirmed. Update UI is mainly the app menu, so visible app/tray status remains to implement.
- Close still exits (`exitOnLastWindowClosed: true`); tray/native tabs remain pending.
- Public catalog on 2026-10-14: GPT-6 Luna base $0.10 input / $0.50 output per million tokens; GPT-4.1 mini $0.40 / $1.60. Base prices are not a quality benchmark or total bill. [Catalog](https://ai-gateway.vercel.sh/v1/models).

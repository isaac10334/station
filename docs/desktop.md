# Station desktop

The Windows x64 app uses pinned Electrobun 2.0.3-beta.26, bundled Bun, and system WebView2.
Its app-local Windows wrapper includes the reproducible [browser policy patch](native-browser.md).
The postBuild hook also updates Bun 1.4's existing named icon group; adding only
Hutch's numeric group leaves Windows selecting Bun's original branding.
Download the Windows setup ZIP from the public
[canary release](https://github.com/isaac10334/station/releases/tag/canary), extract
all its files into one folder, then run `Station-Setup-canary.exe`.
It installs independently of this checkout; Bun and Rust are not prerequisites.
The prototype is unsigned, so Windows may ask you to allow the installer.

Every push to `main` validates, builds, and publishes a canary through GitHub
Actions, including installing and launching the real package on its Windows runner.
Installed apps check at startup and every five minutes, download in the
background, and enable **Station → Restart to update**. **Check for updates**
also gives an explicit result. Applying requires confirmation because active
chats and runs end at restart. Saved workspace data survives.

`release.baseUrl` points at `/releases/download/canary`, not `/releases/latest`
(which excludes prereleases). The fixed prerelease retains hash-named patches;
each build also has an immutable `canary-<run>-<attempt>` release for downloads
and diagnosis. Builds read the previous channel archive to generate delta
patches. Electrobun falls back to a full download if a patch is unavailable.
Publication uploads payloads before update metadata. GitHub asset replacement
is not transactional, so a metadata check during publication may fail and retry
later. Full updater archives are also retained under hash-specific filenames;
metadata references those immutable bytes so an in-flight download remains valid
when a newer canary publishes. The release gate checks identity, version, archive
and installer headers before any assets are published.

Windows CI verifies the installed frontend, worker and translator, then waits
for the real updater to prepare the previously published canary. This proves
checking and downloading in the managed install; restart/application still
requires a manual installed-app check. Native menu labels distinguish checking,
downloading, ready and restarting, and restart failures show a recoverable dialog.

The marketing site deploys independently through GitHub Pages on site changes
and successful canary publication. Its download starts with the fixed canary URL
and resolves the channel's immutable installer when GitHub's API is available.

## Local development

```powershell
bun install
bun run desktop:prepare
bun run desktop:dev
```

`desktop:build` produces the installable canary in `apps/station/artifacts/`. The app version
defaults to `0.1.0-canary.0`; Actions supplies a unique `STATION_VERSION`.
The web development path remains `bun run dev` on port 3000.

The installed native process hosts the same API handler on `127.0.0.1:43157` and serves
the standalone frontend. **Development uses `127.0.0.1:43159` and identifier
`com.isaacharvey.station.development`**, separately from both the normal canary and
acceptance installation (43158). These fixed origins keep WebView2 localStorage stable
across restarts and updates. A port collision stops startup with a dialog;
it never falls back to another origin or opens another process's server.
The desktop webview uses sandbox mode and receives no native RPC authority.
Existing authored iframe isolation and worker/WIT grants still apply.

The user's installed canary may already be running or hidden in the tray. Check
process executable paths and port ownership before launch; do not kill all Bun or
WebView2 processes. A running `electrobun dev` also holds Hutch's project build
lock. Quit that development session before rebuilding in the same project, or
build from a separate source snapshot. Do not remove an active lock file.

`bunx electrobun` is the supported pinned launcher and installs/verifies the paired
Hutch automatically; a global `hutch` command is optional. Beta.26 prepared Hutch
0.28.0-canary.10 here. `hutch.config.ts` explicitly selects Bun package management.
The native security wrapper additionally requires VS2022 C++ and CMake on build
machines; installed users need only WebView2. `desktop:build` rebuilds the wrapper
and installs it into the bundle through the postBuild hook.

### Watching and agent testing

`desktop:dev` owns preparation, the Tailwind watcher and Electrobun dev.
It prepares web/runtime resources directly; it does not require a production
standalone build or run the release-only local-link rejection gate. Loop Kit
development links remain governed by the dependency workflow.
The sandboxed native root serves checkout HTML with Bun frontend HMR on its own
origin; it does not load a separate browser imitation. UI/CSS edits update that
window. Backend/domain edits request graceful Quit through a body-free, dev-only
route authenticated by a random supervisor session secret, then Electrobun
rebuilds/relaunches. Windows may take several seconds to release executable files.
The supervisor never stops another port owner. Ctrl+C cleans up its owned process
tree after allowing native API/scope/tray cleanup; X still means hide to tray.
Use Ctrl+C to end the watcher, or Quit from Station to close the current window.

Production and managed acceptance keep their standalone frontend and never import
checkout source. The dev source import is a narrowly reviewed composition
exception; the dev build channel and baked development profile are both required.
Native updates stay disabled in development. Rebuilding generated packages/tools
while dev is running can require a full document reload rather than preserving
unsaved editor/recording state; finish those preparations before final acceptance.
The UI package compiles into staging and atomically replaces changed output files;
unchanged rebuilds preserve timestamps so HMR cannot read a truncated module.

For agents, verify the executable under
`apps/station/build/dev-win-x64/Station-dev/bin` and the owner of 43159, then run:

~~~powershell
bun run station:control --discover --instance http://127.0.0.1:43159
~~~

Use the native Computer Use window for rendering, typing, asset drops, tray hide,
foreground activation and global shortcuts. A Chrome tab on the native origin
receives public HTML but no native root credential; it cannot prove those behaviors.
For command-driven tests, pair explicitly from that native renderer through
Desk settings -> Agents, discover granted schemas and inspect state before using
the returned epoch/revision. Never bypass pairing or switch silently to headless.
An isolated normal web server is useful for responsive/DOM/console regression;
report its origin separately. See [shortcuts and capture](shortcuts-and-capture.md)
for global key ownership and planned compact launcher work.

### Compact shortcut presentation (2026-10-27 source change)

A desktop-global widget shortcut using quick-access presentation temporarily
compacts the existing Station window to 760 by 620 logical pixels, bounded and
centered in the cursor monitor's work area. It uses the same WebView, workspace,
widget instance and draft; no second renderer or provider tree is created.
Focus presentation and shell actions keep the full window. An unrelated open
modal blocks replacing its presentation.

Escape, Exit widget focus and native X restore the previous normal frame and
maximized, fullscreen, minimized and hidden states. Show Station explicitly
returns to the full window. Navigation, workspace/desk changes and renderer lease
expiry restore the frame too. The private authenticated endpoint accepts only
open/close/expand and an ephemeral session ID; native invocation arms entry for five
seconds, and the root's shortcut heartbeat renews an active three-minute lease.
Its bounded expand action restores and explicitly shows Station for a subsequent
full-window shortcut. No arbitrary geometry, scripts or guest window authority
cross this endpoint.

A successful quick capture dismisses its native shortcut presentation and
restores the prior window state. Docked/local captures stay open; failures keep
the draft and presentation available for correction.

The pinned native API cannot explicitly restore an arbitrary foreign foreground
application. Windows decides focus after hide/minimize; returning to a named
external application is not guaranteed. Source-level lifecycle and HTTP denial
tests pass; installed-native rendering, real hotkeys and focus restoration still
require fresh acceptance of this change.

## User data and Component builds

Use **Station → Open Station data folder** to locate the channel's persistent
data directory. Component bytes/manifests live in its `artifacts` subdirectory,
outside the replaceable installation. Browser workspace data lives in the
Electrobun-managed WebView2 profile, separate from your regular browser.
Existing browser workspaces are not automatically imported.

The shipped sandbox configuration contains public project/snapshot identifiers,
never credentials. To build Components, create a `.env` file in the Station data
folder containing `VERCEL_AUTH_TOKEN=...` (or an unexpired `VERCEL_OIDC_TOKEN`),
then restart Station. Tokens are backend-only, plaintext in that local file;
never commit it. A launched process can also inherit those environment variables.
Snapshot provisioning remains `bun run setup:sandbox` in the checkout. Snapshots
expire after 30 days; publish a new build after refreshing the snapshot.

Loop Kit's four packages use versioned dependencies and reproducible clean installs;
see [dependency workflow](loop-kit-packages.md).
Signing, other desktop platforms, in-app sandbox credential setup and workspace
import/export remain follow-up work.

## Tray, lifecycle and trusted update controls

The installed process owns one persistent native window and one tray. **X**
uses 2.0.3-beta.26's synchronous `will-close` response (`allow: false`), then `hide()`.
**Show Station** restores, shows and activates that same window. Hiding does not
unmount its React tree, navigate, revoke scopes, stop chats/runs or stop checks.
Desk switching retains its existing scope-revocation behavior. Settings → App
explains this and shows the same update state as the native menu and tray.

`exitOnLastWindowClosed` stays **true**: hiding does not close the window.
Unexpected destruction exits rather than leaving a headless process. Tray
creation checks both the returned id and visibility; menu failure removes the
tray and restores the window. Without a tray, X closes/quits normally.
Explicit Quit bypasses hide, stops the API/listener and timer, cancels pending
Sandbox builds and waits for their cleanup before native quit. Native destruction
owns child WebViews; document pagehide also unmounts React effects and releases
sharing connections, guest ports and host scopes. Forced termination cannot
promise JavaScript cleanup; a Sandbox still being created when the process is
killed may remain until its existing ten-minute timeout.

The updater adapter exposes cached frozen scalar snapshots and two operations:
check/download and confirmed apply. It reports real pinned `download-progress`
percentages when provided; patching/decompression and unknown totals remain
indeterminate. Ready requires `updateInfo().updateReady` after preparation.
Failures retain an error and Retry, never an up-to-date result. The last-check
time is the last successful metadata check. Checks/downloads/confirmation/apply
are mutually exclusive. Each prepared hash gets one notification per process;
five-minute checks do not repeatedly prompt or apply it. Confirmation defaults
to **Later** and describes active-work loss. Helper failures keep the server,
window and tray usable; retry checks the prepared bytes again.

In the pinned updater, `before-quit` is approval *before* helper arming. Station
therefore stops backend work after confirmation, and only disposes the desktop
on `launching-new-version`. Normal quit can veto synchronously while awaiting
cleanup, then reissue native quit once. OS logoff/shutdown is different: the
pinned Windows native wrapper exposes no Bun session-end callback for
`WM_QUERYENDSESSION`/`WM_ENDSESSION`. Windows owns that termination; Station does
not reinterpret it as X or veto OS shutdown. Async cleanup on OS session end,
Explorer tray recovery, and other operating systems remain platform limitations.

The WebView remains sandboxed, with no native RPC. Native navigation rules allow
only its exact app root. The root document receives a random per-launch bootstrap
secret and cannot be framed. Private `/api/desktop/updates` requests require the
secret plus exact Host, Origin (for writes) and same-origin Fetch Metadata.
Only snapshot GET and body-free check/apply POST routes exist. No guest SDK,
foreign page or provider binding receives the secret or native methods. This is
an app/guest boundary, not authentication against another local OS process.

Pinned evidence: installed `.hutch/devkit/api/sdks/main/core/{BrowserWindow,Tray,
Updater,Utils}.ts`, `events/windowEvents.ts`, and `proc/native.ts` were inspected.
Official references: [Tray](https://framework.blackboard.sh/electrobun/apis/tray/),
[pinned native Windows source](https://github.com/blackboardsh/electrobun/blob/v2.0.3-beta.26/package/src/native/win/nativeWrapper.cpp).
Bun remains explicitly selected; Cottontail and Rust are not used as the main process.

## Reproduce builds and publication

From a clean checkout with Bun 1.3.14 on Windows:

```powershell
bun install --frozen-lockfile
bun run desktop:prepare
bun run typecheck
bun run test
bun run build
bun run build:component
$env:STATION_VERSION = '0.1.0-canary.900001'
bun run desktop:build
bun run prepare:release
```

This creates local files only. Unset `STATION_DESKTOP_TEST_FEED` for distributable
builds. Main pushes retain automatic public canary publication. Manual dispatch
defaults to build/install verification only; select `publish_canary` only with
explicit publication authorization. The serial Windows gate installs the real
package, checks served bytes, updater preparation,
installed executable S icon, tray owner, three X/hide/Show cycles with the same
HWND, and graceful Quit/process/tray/API-port cleanup. The native probe is
`apps/station/scripts/verify-installed-desktop.ps1`; it is deliberately limited
to a disposable managed installation. It dispatches actual native menu commands;
it does not prove physical tray clicking or WebView JavaScript session identity.

Publication archives `canary-RUN-ATTEMPT`, uploads fixed-channel payloads first
and metadata last, preserves old hash patches/full archives, and never uses the
stable-only latest endpoint. Keep the job concurrency group and
`cancel-in-progress: false`. No public release was performed for this change.

## Isolated installed A → B acceptance

Use a managed Windows runner or the separate acceptance profile with WebView2 and
Explorer. Do not use Codex Store-redirection uninstall paths. Set
`STATION_DESKTOP_ACCEPTANCE=1` for both A and B builds: they use identifier
`com.isaacharvey.station.acceptance`, port 43158 and separate user data. They cannot
replace the normal installed canary. The flag is baked into profile.json; no runtime
environment variable is needed after installation. Without a test feed, acceptance
builds disable automatic checks and never use the public canary feed.

Agents may quit, update and relaunch this managed isolated acceptance installation
without repeated permission during acceptance work. First verify the exact
installation/executable path and port owner; preserve the profile. Prefer graceful
Quit (X only hides). If Quit fails, terminate only processes verified to belong to
that installation. A user actively working in the acceptance app takes precedence;
wait until they finish. This permission does not cover the normal canary, unrelated
Bun/WebView2 processes, profile deletion or public publication.

```powershell
$env:STATION_DESKTOP_ACCEPTANCE = '1'
$env:STATION_DESKTOP_TEST_FEED = 'http://127.0.0.1:49158'
$env:STATION_VERSION = '0.1.0-canary.900002' # B
bun run desktop:build
# Freeze B's generated artifacts for this local feed; do not publish them.
New-Item -ItemType Directory -Force .desktop-test/feed, .desktop-test/A
Copy-Item apps/station/artifacts/* .desktop-test/feed/
$env:STATION_VERSION = '0.1.0-canary.900001' # A
bun run desktop:build
Expand-Archive apps/station/artifacts/canary-win-x64-Station-Setup-canary.zip .desktop-test/A -Force
bun apps/station/scripts/serve-desktop-test-feed.ts .desktop-test/feed
```

Keep the last command running. From normal Explorer in that account, run A's
extracted `Station-Setup-canary.exe` with all companion files beside it.

1. Before launch create `.desktop-test/feed/.offline`; confirm startup reports
   failure, never up-to-date. Remove the marker and choose Retry. Confirm real
   download/preparation and matching Settings/menu/tray state.
2. Create an asset and a remembered Component grant. Record `unit-workspace.v4`
   and other legacy keys through WebView devtools. Keep a live editor/session
   marker. X and tray Show three times; the marker/session and window persist,
   hidden work continues, and the S appears in taskbar, tray, Start menu and setup.
3. Select Restart to update, choose Later, and confirm A stays running. Select it
   again and confirm restart. Verify the installed `version.json` is B, the
   native transaction result reports success, and data, grants and keys match.
4. Quit from the tray; verify no installed process, tray owner or listener on
   43158 remains. Relaunch and confirm saved work survives. Run the native probe
   with `-InstallRoot "$env:LOCALAPPDATA/com.isaacharvey.station.acceptance/canary" -Port 43158` as an
   additional automated close/restore/icon/quit check (it quits the app).

## Earlier implementation evidence (before beta.26 upgrade)

Local typecheck, 132 tests, web build, desktop build and the real sample Component
build/run passed. The private update tests cover duplicate checks/apply,
confirmation/Later, real-event progress propagation, incomplete downloads,
network failure/retry, helper failure, disposal, dev mode and foreign-request
rejection. Browser verification covers the actual Settings App tab's unsupported
web state. These are **not** installed-native A/B evidence.

The extended CI native probe and isolated feed recipe are provided but have not
been executed in a normally installed Windows environment for this change.
Installed visual branding, physical tray interaction, A/B helper application,
data/grant retention through that update, tray failure recovery and OS shutdown
still require the managed acceptance run above. No claim of native acceptance
is made from browser tests or packaged resource checks alone.

## Beta.26 upgrade evidence (2026-10-15)

The latest published Electrobun beta.26 was checked through GitHub and its pinned
source. Windows changes fix the native bool FFI mismatch for visibility/passthrough
and preserve update helper arguments on long Windows paths. The wrapper patch was
rebuilt and all 30 compiled URL-policy cases passed. Typecheck, web build, 153 tests,
sample Component build/run and an isolated packaged acceptance build passed.
Browser verification used both a fresh local server and the final standalone HTML
artifact, with a fresh reload and no Station errors. Development HMR had emitted
transient errors while generated dependencies were being rebuilt; the final
standalone check avoids that partial-write state.

Automatic approval review blocked launching the generated acceptance installer;
it supplied only "blocked by policy". No installed beta.26 tray/zoom or A to B
updater acceptance is claimed. The private native probe now checks real controller
bounds at 80/100/125/150% root zoom when launched with `STATION_BROWSER_VERIFY=1`.
After manually installing an acceptance build, run the installed probe with
`-InstallRoot "$env:LOCALAPPDATA/com.isaacharvey.station.acceptance/canary" -Port 43158`.
This affects only the acceptance installation. Do not publish acceptance artifacts;
the normal release validator intentionally rejects their different identifier.

## Agent-control installed acceptance (2026-10-17)

The managed acceptance installer completed successfully against the isolated
installation after the previous acceptance session quit. Its served frontend
matched the current production build. Public HTTP HTML contained only the native
root marker; the native root registered an authenticated renderer with the broker.
An owner-register request with spoofed same-origin headers but no credential
returned 403. The release gate now checks that private bootstrap behavior.

The installed browser probe passed two unrelated sites, isolation and navigation,
download denial, retained-view cleanup and native bounds at 80/100/125/150% zoom.
The installed Win32 probe passed executable branding, tray ownership, three
X/hide/Show cycles on the same HWND and graceful Quit/process/tray/port cleanup.
These results prove managed installer replacement and installed executable
behavior, not an A-to-B updater transaction or physical tray clicking. The normal
canary and saved profiles were preserved. The separate live runtime-authoring
proof used the actual stdio MCP SDK client; configured Codex MCP-client acceptance
is still pending.

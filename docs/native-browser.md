# Browser contexts

## Implementation

Station has a portable `station:browser/contexts` contract in `@station/capabilities`,
a built-in Web browser widget, exportable per-instance tab bookmarks in the existing
dock document, and an authenticated desktop controller with revocable, expiring leases.
Windows x64 uses real Electrobun BrowserViews backed by system WebView2. The root
stays sandboxed. Its sandboxed preload deliberately omits tag RPC, so the trusted
Bun controller creates and owns child views instead of enabling root application RPC.
Browser-only hosts show a desktop fallback and do not embed external pages.

The latest published release checked on 2026-10-15 is **2.0.3-beta.26** (stable is
2.0.2). Both retain unsafe WebView2 startup flags and automatic download handling.
Station rebuilds the pinned Windows wrapper with a small anchored policy patch;
upgrading alone does not fix these boundaries. CEF is neither enabled nor shipped.

## Configuration and authority

The public capability accepts data operations: open, snapshot, navigate, back,
forward, reload, stop, tab creation/activation/removal, and presentation. No raw
BrowserView, DOM object, arbitrary evaluation, remote debugging or native RPC is
exposed. Loop Kit owns acquisition lifetimes; Station's provider enforces grants
and retained-method cancellation. This contract stays in Station until another
provider demonstrates a reusable Loop Kit contract.

Starting is an explicit session grant. URLs/tabs alone never authorize execution.
Saved configuration whitelists tab IDs, HTTP(S) path bookmarks and the active tab.
Query strings/fragments are omitted because they can contain credentials. Paths
can also contain sensitive data: do not save credential-bearing path bookmarks.
Cookies, credentials, partitions, handles, lease IDs, receiver grants and device
permissions never enter templates. Each tab gets a host-selected unique partition
and an explicitly InPrivate controller, verified through the native profile API.
The root profile is separate. Persistent browser profiles are not exposed yet.

Acquisitions hold opaque session leases with a 15-second renewal deadline. Scope
revocation closes views and provider disposal awaits the native acknowledgement.
Root navigation/reload closes all leases; lost renderer renewal expires them.
Closing/removing a widget and switching desks revokes the UI acquisition.
Moves/floating retain the mounted owner and resource. Hiding is presentation only.
Desktop final quit disposes all leases. Returning to a desk restores bookmarks,
requires a fresh session grant, and cannot revive the old browsing authority.

## Native presentation strategy

WebView2 mask hole punching is a no-op in this pin. The creator's public Co(lab)
`WebSlate.tsx` hides retained views during dragging and restores them afterward.
Station follows that approach: address/tab chrome stays outside the native page;
menus, dialogs, popup selectors, tooltips, dragging, hidden/inert owners, higher
floating panels and partial clipping hide the native surface using native
visibility/passthrough. Ordinary asset listboxes are not overlays. The adapter
observes existing geometry, never a second placement document. DOM z-index does
not cover a native view. HTTP/DOM observation is asynchronous; this is retained-view
hiding, not atomic native hole punching or a compositor-level overlay guarantee.

DOM bounds remain fractional CSS pixels. The native adapter multiplies by the
trusted root WebView's `getPageZoom()`; `resizeWebview` applies monitor DPI once.
Multiplying by renderer `devicePixelRatio` here would incorrectly apply Windows
display scaling twice. Presentation observation includes pixel-ratio changes and
visual viewport resize, so Ctrl +/- and display changes trigger another measurement
even if CSS bounds stay the same. Native acceptance compares real WebView2 controller
bounds at 80%, 100%, 125% and 150% root zoom.

The documented `<electrobun-webview sandbox>` isolates a child from application RPC;
it does not make the parent sandbox's internal tag controller available. In the
pinned SDK, tag initialization/positioning uses the privileged internal bridge,
and sandboxed children retain an event-only preload. Station therefore keeps its
small DOM anchor + grant-bound Bun adapter, with no foreign preload at all.
Changing to tags would require reviewing that parent authority and preserving the
native pre-navigation policy; merely swapping the HTML element would weaken the
current boundary. See the [upstream tag implementation](https://github.com/blackboardsh/electrobun/blob/v2.0.3-beta.26/package/src/preload/webviewTag.ts).

## Native enforcement

- Remove the upstream origin/TLS/reputation-disabling WebView2 arguments. Retain
  WebView2's default browser origin security and OS renderer sandboxing.
- Preserve root sandboxing; create foreign views only through the trusted Bun
  controller. Sandboxed root preload has no `electrobun-webview` tag RPC.
- Deny Station/API, file, views, appdata and javascript navigation; enforce
  redirects/subframes/resource destinations in native policy, not guest events.
  URL parsing is not a DNS-rebinding defense or a network firewall.
  The current URL validator conservatively rejects IPv6 literals until the native
  provider supplies canonical address classification.
- Foreign views install no Electrobun preload, event bridge, host object, custom
  application scheme or Station SDK. Web messages and host-object access are disabled.
  Guest title/loading/navigation signals are bounded display data, never authority.
- Block popups, external protocols, downloads, device/clipboard permissions,
  HTTP authentication and client-certificate access by default. Password saving,
  general autofill, default context menus and browser accelerators are disabled.
  Native decisions must precede the effect; late download events are insufficient.
- Expose real stop/back/forward/status and disposal; close every native resource
  and subscription on revoke, expiry, shutdown and initialization failure.
- Native status reads source/title/history/loading/errors directly; Stop calls
  WebView2 Stop. Ctrl+L in a page returns focus to that widget's address bar.
  No guarantee of one OS process per tag/view or network-proof isolation is made.

## Download receivers

`DownloadReceiver` currently documents a destination descriptor, not an implemented
permission or download service. Future delivery binds a browser lease to a separate
receiver grant. Native download interception stages bounded bytes privately, then
a receiver validates/commits them. Folders, Asset browser imports and asset revision
proposals can implement receivers; a website cannot supply an arbitrary host path.
The browser retains authenticated fetches, POST responses and blob download semantics;
receivers receive bytes/metadata, never page cookies or session credentials.
Receiving data does not install/run code. Programmable asset reactions need an
explicit handler lifecycle and their own grants; they are not implemented here.

## Pinning and patching

The manifest and Hutch config pin 2.0.3-beta.26. `scripts/build-browser-native.ts`
downloads SHA256-verified release source, WebView2 SDK and upstream link dependencies,
applies `patch-browser-native.ts`, and compiles `desktop/native/station-browser.h`
into `.hutch/native-browser/libNativeWrapper.dll`. It requires VS2022 C++ and CMake.
CEF is only an upstream compile/link dependency of the combined wrapper, not the
selected renderer. The postBuild hook replaces the app-local wrapper before
wrapping, signing and packaging; Hutch's shared release cache stays untouched.
The build rejects mismatched pins and changed patch anchors. The adapter requires
the private policy ABI before advertising availability. No DLL is checked into Git.

SDK-only fixes can use `bun patch` / `bun patch --commit`; patching TypeScript
cannot change this native DLL. Remove this workaround only after upstream removes
the unsafe defaults and provides equivalent pre-effect gates, verified natively.

## Verification

`bun run test:browser` checks URL/configuration validation, cross-lease rejection,
forged transport messages, bounded payloads, fail-closed availability, retained views
on hide/move, cleanup after partial initialization, and Loop Kit scope revocation.
It also checks overlay/listbox/clipping/occlusion and awaited provider disposal.
`bun run test:browser:native` rebuilds and checks the real DLL's ABI and URL parser.

Launch an installed app with `STATION_BROWSER_VERIFY=1` to run fixed hostile-page
probes using explicit test-only main-process automation authority. There is no
script-evaluation HTTP route or public automation capability. The report is
`browser-acceptance.json` in Station user data. CI requires this report and checks
the compiled URL policy before accepting the installer. Test reports contain no
tokens, cookies, grants or user URLs.

References: [pinned Windows implementation](https://github.com/blackboardsh/electrobun/blob/v2.0.3-beta.26/package/src/native/win/nativeWrapper.cpp),
[Co(lab) browser](https://github.com/blackboardsh/colab/blob/f33c0f1e6b36e6fd84b8f27c50407b8f4e01c9f7/src/renderers/ivde/slates/WebSlate.tsx).

Prior beta.25 evidence (before this upgrade): installed native probes loaded Example Domain and Wikipedia,
verified native titles/loading, Back/Forward/Reload/Stop, no SDK/host bridge,
separate page roots, blocked forged bridge messages/local fetches/popups/permissions
and blob downloads, retained views on hide/tab changes, and destroyed views on
revocation. Native URL classification passes 30 compiled cases. No unsafe flags
were present in the inspected WebView2 renderer command lines. This is browser
context isolation, not a network firewall. Renderer-failure UI is wired but a
forced renderer crash has not been acceptance-tested.

Manual native UI checks also verified Ctrl+L/address navigation to Wikipedia,
the command palette covering native content, floating without replacing the tab
session, and root reload closing native views while preserving only bookmarks.
The previous repository suite passed 146 tests; typecheck, build and desktop:build passed.
The installed tray/icon/same-window hide/restore/Quit probe passed on beta.25.
The build hook repairs Bun 1.4's named icon group as well as Hutch's numeric group.

Environment limitation: reinstall from this Codex Store session reports that app
files are locked (exit 1), including a retry after app process shutdown. Manually
launching the replaced installed bytes passes both probes. This is not a clean
installer pass; the cause of the lock/namespace interaction remains unverified.
CI outside this environment retains the installer exit/launch gate. Windows icon embedding
also produced a transient EndResourceUpdateFailed; the retry passed.

Beta.26 upgrade verification (2026-10-15): reviewed the Windows native diff and
updater helper task changes; rebuilt the anchored patch from SHA256-checked source.
The compiled URL policy still passes all 30 cases. The isolated acceptance package
built successfully. Installed acceptance on beta.26, including the new real native
zoom-bound assertions, remains pending: automatic approval review blocked launching
the generated installer. Unit geometry checks are not a native zoom acceptance pass.


### Movable browser-page widgets

Web browser is a Layout whose default child definition is `browser-tab`. Native
session ownership belongs to the stable child instance, not its current Layout.
Each child starts browsing only through its explicit session grant; movement,
focus and parent changes do not acquire authority. Bookmark-array migration is
source/configuration recovery, never session restoration. Menus and inspector
selection occlude native content as before; a containing focus dialog itself is
not an occluding sibling overlay. Verify active native page retention, transfer,
focus/restore and revocation on a disposable managed install before claiming that
native acceptance. The web fallback verifies host composition and draft retention.

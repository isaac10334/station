# Station desktop

The Windows x64 app uses Electrobun 2.0.2, bundled Bun, and the system WebView2.
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
is not transactional, so a check during publication may fail and retry later.

## Local development

```powershell
bun install
bun run desktop:prepare
bun run desktop:dev
```

`desktop:build` produces the installable canary in `artifacts/`. The app version
defaults to `0.1.0-canary.0`; Actions supplies a unique `STATION_VERSION`.
The web development path remains `bun run dev` on port 3000.

The native process hosts the same API handler on `127.0.0.1:43157` and serves
the standalone frontend. This fixed origin keeps WebView2 localStorage stable
across restarts and updates. A port collision stops startup with a dialog;
it never falls back to another origin or opens another process's server.
The desktop webview uses sandbox mode and receives no native RPC authority.
Existing authored iframe isolation and worker/WIT grants still apply.

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

Loop Kit's two linked packages are vendored as source snapshots for reproducible
clean checkouts; see [vendor notes](../vendor/loop-kit/README.md).
Signing, other desktop platforms, in-app sandbox credential setup and workspace
import/export remain follow-up work.

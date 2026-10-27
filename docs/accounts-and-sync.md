# Accounts, sessions and sync

Deployed prototype: [Station on Fly](https://station-cloud-ijhar.fly.dev/).
Fly app `station-cloud-ijhar` runs one shared CPU / 1 GB machine in Chicago (`ord`)
with autostop disabled for continuous realtime availability. Identity and machine
observations persist in dedicated Neon project `station-cloud`
(`orange-pond-33737141`, production branch, AWS us-east-2). This database is separate
from browser-local assets. Fly secrets hold the auth secret and database URL;
the ignored `.station-cloud/deployment.env` is a local deployment backup and must
never enter assets, prompts, source archives or container builds.

## Implemented

Previously, onboarding accepted any email plus demo code `123456` and saved a
local preference. That never authenticated a person. The legacy demo storage key
remains a compatibility preference; the demo login flow is gone.

The optional public web entry point is `apps/station/server/cloud.ts`. It serves
the actual Station application and Better Auth 1.6.23 with email/password login,
database sessions, HttpOnly cookies, same-origin checks, password hashing and
database-backed authentication throttles. Cookie session caching is disabled for
database-checked revocation. This prototype has no email verification, recovery
delivery, MFA or OAuth enrollment. An email is not proof of email ownership.

`Account and sessions` in the user menu supports registration, sign-in/out,
browser naming, online/offline presence, pings and confirmed remote logout.
Machines currently mean self-reported installations with random local IDs.
The UI groups authentication sessions by installation and shows their live tabs/windows.
Each document has a transient renderer ID and web/desktop classification; native-root
metadata or Electrobun's injected webview identity identifies the desktop renderer.
Browser family/platform comes from the stored session user agent. These are diagnostic
labels, not attestation. Separate browser profiles are not automatically associated
with one physical machine, and native account enrollment remains future work.

Zod input/output schemas and effects live in `src/contracts/account.ts`.
`GET /api/account/commands` discovers the authenticated registry;
`POST /api/account/command` executes `{method, params}`. UI and tests use the same
operations. Cookie authentication and exact Origin are required. No caller user ID,
owner secret, approval flag, remote shell or workspace dispatcher is accepted.
External clients must explicitly authenticate their own session; never read browser
cookies or reuse local agent pairing credentials. CLI login needs a future device
authorization flow.

Commands are `account.inspect`, `account.heartbeat` (`machineId`, `name`, optional `rendererId` and `clientType`),
`account.ping` and `account.revoke` (`sessionId`). Revocation is idempotent;
unknown/foreign targets disclose nothing. Heartbeat metadata is last-write-wins.
Cancellation is checked before effects; completed revocation cannot be rolled back.
The injected `MachineStore` repository is separate from identity and realtime
transport. It can be substituted in tests without mocking the GUI. No generic
capability lifecycle or permission framework was added.

Presence expires after 45 seconds; the browser renews every 15 seconds. Background
throttling can make a running installation appear offline. SSE carries bounded
`changed`, `ping` and `revoked` events; reconnect refetches authorized state. Streams
recheck database sessions every five seconds. Station remote logout closes local
streams immediately; other Better Auth revocations are detected on the next check.
Pings are ephemeral and are not queued for disconnected machines.

This version supports **one Bun process/replica**. The notification bus and streams
are process-local. Postgres persists identity and observations, not realtime fanout.
Scaling requires a shared bus provider. Sleeping the server disconnects realtime
clients; wake/reconnect restores state. Continuous presence needs an available host.

## Run and deploy

Run an isolated server without touching the installed desktop:

```powershell
$env:STATION_ACCOUNT_ORIGIN = 'http://127.0.0.1:3014'
$env:STATION_AUTH_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$env:STATION_ACCOUNT_DB = '.station-cloud/accounts.sqlite'
bun run start:cloud
```

Generate the secret once and keep it stable in the deployment secret manager.
Production requires an exact HTTPS origin. Use a dedicated database: startup
applies additive Better Auth migrations and creates the observation table. Review
migrations before later production upgrades.

`DATABASE_URL` selects Postgres (including Neon); otherwise `STATION_ACCOUNT_DB`
selects SQLite. SQLite requires writable persistent storage owned by the runtime
user. Containers should use Postgres or a writable volume with
`STATION_ACCOUNT_DB=/data/accounts.sqlite`. Never use ephemeral SQLite for durable
deployment. Postgres uses `pg` for Better Auth and the metadata adapter; this slice
does not need Drizzle. Registration, independent browser sessions, presence,
renaming, pings and remote revocation have been verified against deployed Neon.

`Dockerfile.cloud` runs Bun on port 3014 (or `PORT`) with `/healthz`. Configure
`STATION_ACCOUNT_ORIGIN`, `STATION_AUTH_SECRET` and `DATABASE_URL` on a host with
HTTPS and streaming responses; keep one replica. The image is built remotely and
verified on Fly; no local Docker daemon is needed. Socket IP replaces client-supplied auth throttle IP
headers. Behind an ingress proxy clients may share the proxy's rate-limit bucket;
configure trusted ingress/IP extraction before broad rollout.

Deploy from the repository root with
`flyctl deploy --remote-only --ha=false --config fly.toml`. Keep the configured
app name and HTTPS origin aligned. The `.dockerignore` excludes environment files,
native acceptance binaries and generated compiler resources (rebuilt in the image).
Do not scale this implementation to multiple machines until the realtime provider
supports cross-machine fanout. The current image intentionally uses the real Bun
Station frontend rather than an unrelated deployment-specific shell.

The public entry point excludes native/control bootstrap secrets, Component builds,
artifacts and legacy shared rooms. Browser-local authoring remains available;
excluded features fail closed. The desktop/local server keep their current
lifecycle and report accounts as unconfigured. Hosted login does not enroll the
installed desktop yet.

## Workspace sync direction (not implemented)

Desks/assets stay in existing browser storage, shared by local users of that
browser profile. Account login neither uploads nor partitions them. Logout revokes
server authority, not local assets. There is no cloud backup, account content
encryption, Electric replication or peer transport yet.

The intended split:

1. Better Auth and Bun commands authorize durable mutations and revocations.
2. Postgres stores account-scoped metadata. Electric replicates narrow authorized
   Shapes through a Bun proxy. The server fixes tables, account filters and columns;
   clients never choose arbitrary tables/WHERE clauses. Writes still pass through
   commands and revision checks.
3. Ephemeral transport carries presence, cursors and bounded signals. Start with
   Bun WebSockets/SSE; add Iroh as a provider after native/browser acceptance.
   Do not write cursor positions to Postgres every frame.
4. A reviewed backup-provider contract stores encrypted immutable blobs and revision
   manifests. The official cloud and self-hosted peers can implement that same
   contract. Selection explicitly discloses operator, endpoint, granted scope and
   visible metadata. Never automatically trust unknown storage operators.

Iroh authenticates endpoint keys and encrypts transport; account membership,
workspace authorization, key recovery and backup trust remain application policy.
Enroll a device by binding its key to the authenticated account, then issue scoped,
short-lived workspace authority with revocation checks. Two devices of one user
are still two peers. Relays provide connectivity, not durable backups. At least
one available peer/server is needed for durable data while other devices are offline.

Before sync: partition local caches by account; explicitly adopt guest content;
define revision/conflict/deletion semantics; encrypt content on clients using
workspace keys. Store ciphertext at backup peers. Design key enrollment, recovery
and revocation before claiming end-to-end encryption. Encrypted transport alone
does not protect content from the storage operator.

References: [Better Auth sessions](https://better-auth.com/docs/concepts/session-management),
[Electric auth](https://electric.ax/docs/sync/guides/auth),
[Iroh networking](https://docs.iroh.computer/what-is-iroh).

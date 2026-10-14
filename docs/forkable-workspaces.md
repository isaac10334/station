# Forkable workspaces and collaboration

## Implemented in this checkpoint

- Installed contributions expose **Fork package source**. This copies the installed
  snapshot, even if its authoring assets were deleted. It remaps source and theme
  icon references and gives the fork a new installation identity. It copies no
  grants, built artifacts or execution state. Edit/preview the fork, then install
  it explicitly; the original installation continues unchanged.
- Editor controls can restore individual Files, Code, Preview and Problems panes
  through the existing ownership/placement policy. The other panes stay mounted.
  Editor choice and defaults use the shared Stealth menu and tooltips.
- Themes have Design and Code views over the same JSON source. Semantic icon names
  live in `@station/capabilities/icons`; renderers and portable React controls live
  in private `@station/ui`. The guest bundler and TypeScript worker include this
  curated UI package. `bindTheme(station)` propagates validated guest icon snapshots.
- Theme icon references are `{assetId, path}` pointing to an SVG file in an authored
  source asset. Package export includes these dependencies and import remaps them.
  Host icons use bounded static SVG image masks. Scripts, foreign objects, URLs,
  CSS and SVG animation are rejected; invalid icons use the built-in glyph. Normal
  host interaction motion and reduced-motion behavior still apply.
- [SVG studio](examples/svg-studio.station.json) is an authorable package, not a
  privileged host editor. Import it in Configure desk → Packages, install it after
  review, open Station icon source, then choose SVG studio through Open with. Its
  Files/Code panes are trusted shared widgets; its SVG preview and stroke control
  run in a guest frame and communicate through the opened-asset editor grant.
  This is a small source/preview editor, not a full vector drawing application.
- The desk toolbar has icon actions, menus, tooltips and per-desk anchors/insets.
  It remains trusted shell chrome outside hideable surfaces; it is not yet an
  arbitrary plugin toolbar or a new docking placement system.

## Lightweight multiplayer prototype

Run `bun run dev`, open Station, and choose Share workspace from the desk toolbar.
Enter your name, choose view/edit access and create an invitation. Open the link in
a separate browser/profile, enter another name, and join. Guest source is imported
into a local workspace with its own Guest desk. Layout and runtime state stay local.
Assets present when sharing begins are the room's source resources; later asset
creation/deletion, package installation and configuration are not synchronized.

For two machines on a trusted local network, run the server with:

```powershell
$env:STATION_HOST = "0.0.0.0"
bun run dev
```

Open it using the host's LAN address on both machines, then create the invitation
from that address. Opening `127.0.0.1` produces a same-machine invitation. Serving
outside loopback exposes the app, so use a trusted network for this prototype.
The Component API is disabled on the network-exposed server, including proxied requests. Use a separate private local server for Component builds. Internet deployment needs a persistent
Bun server behind HTTPS/WSS with `STATION_PUBLIC_ORIGIN=https://your-host`, account authentication, durable room storage, invite
revocation and broader operational controls. The desktop's separate packaged API
does not yet host these rooms. GitHub Pages/Vercel static marketing hosting does
not provide the multiplayer server.

Invitation secrets travel in URL fragments, then in the WebSocket authorization
message. The server binds the resulting participant ID/role to that connection.
Membership, known asset identity, paths, payload/rate limits and expected source
revision are checked before each write. View-only source policy also applies to
local editor/SDK writes while connected. Presence is transient and coalesced; it
uses reliable WebSockets with backpressure dropping, not an unreliable transport.
Cursor coordinates are normalized viewport presence, labelled by participant and
desk; they are not character selections or a remotely rendered shared desk.

The room lives in server memory for at most one hour, with eight participants and
eight rooms. It closes when the owner disconnects/stops sharing. Workspace switching
disconnects the client; desk switching preserves the workspace-owned connection.
Each client retains its local source copy. No automatic reconnect or offline merge
is implemented. Source conflicts preserve local text as a separate conflict asset,
then accept the authoritative source. Room revisions stay separate from monotonic local asset/build revisions, so synchronization cannot resurrect an old artifact. This is not a CRDT collaborative editor.
Do not include secrets in authored source: that source is explicitly shared.

## Framework direction: proposal

The useful common model is **principal → grant → resource → scoped operation**.
Humans, agents and extension instances can all use typed operations, but their
authentication and granted resources differ. A displayed cursor is presence, not
authority; an invitation is not permission to run a process. The prototype accepts
human/agent participant kinds in its protocol; hosted AI control is not implemented.

The next common operation layer should expose versioned domain commands with an
expected revision and operation ID. A transaction validates schema, authority and
invariants before publishing state and recording its result. Subscription streams
react to committed changes; bounded owner channels carry transient coordination.
Leases own subscriptions, pending requests and effects, and revoke on removal or
permission changes. These contracts should serve SDK clients and human/agent
controllers, rather than relying on browser clicks as the underlying API.

Keep authored source, installed revision, instance configuration, durable state and
effectful execution separate. Durable state needs a schema version, explicit
migration, preview/test, backup and atomic activation. SDK types help good authors;
the host still validates every mutation. Move simple built-in widgets into supplied
authorable packages one at a time. Built-in React widgets are not all forkable yet.
Authorization, storage transactions and resource supervision remain trusted host
infrastructure while the workspace above them becomes editable.

A future agent runs with a participant identity and grants on a dedicated desk,
publishes presence/activity and receives revocation/cancellation through its lease.
Desk observation should not itself confer edit authority. Voice takeover, teaching
and resumption can use the same operation ownership and cancellation model later.

## Transport, blobs and storage

Iroh is a candidate transport backend, not the workspace permission system. It
connects endpoints directly where possible and uses encrypted relay fallback. Its
browser transport/compatibility needs evaluation separately from native QUIC.
See [Iroh](https://www.iroh.computer/) and [compatibility](https://docs.iroh.computer/compatibility).

Before adding Loop Kit packages, dogfood the operation/lease contract and identify
the actual transport seam: reliable ordered commands, replaceable presence, peer
authentication, resource bounds, cancellation and delivery failure. A relay moves
messages; blob storage owns verified content addressing and transfer; a store owns
transaction/merge/durability semantics. They should not be one universal cloud API.
No `@loop-kit/relay`, `blob` or `store` implementation is claimed by this prototype.

## Animated icons and richer editors

A next icon format could declare idle/pressed/expanded/loading states, each with a
static asset reference, and a bounded host transition. Renderers can morph compatible
paths or crossfade, while reduced motion selects the final static state. Keep
arbitrary authored animation/script out of host chrome. Boxy's commercial component
can replace the guest UI after package access/licensing is arranged; the opened-asset
SDK and shared panes need not change. [Boxy component](https://boxy-svg.com/component).

## Authoring the landing page inside Station

Start with a web project using the curated SDK/UI packages and self-contained preview.
Keep publishing separate: a reviewed export produces static files; a narrowly granted
publisher deploys one immutable revision to a chosen site and supports rollback.
Public hosting should serve exported output, not an authenticated workspace session.
The current [separate marketing site](../apps/site/README.md) is a real delivery target
for that future export/publish capability. Its interactive scene already shares the
icon package with Station. It is not yet authored or deployed from a workspace.

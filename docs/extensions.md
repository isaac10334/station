# Local extensions and desks

Station stores authored assets in a workspace. Each desk has its own dock document,
navigation filters, contribution availability, editor defaults and theme selection.
`workspace.dock` and `workspace.navigation` are active-desk views, not additional
placement stores; serialization saves the canonical desk records. Existing data
migrates to one initial desk without changing storage keys or WIT identities.

Desks copy saved setups when created. Saving a new workspace default never changes
existing desks. Duplication remaps instance, node and navigation references, retains
shared asset references, and copies no transcript, permission or execution state.
Switching desks revokes the old desk scope and unmounts its editor/guest sessions.
Layout history is isolated per desk. The desk selector and search remain outside
hideable surfaces.

## Authoring and composition

Web projects store a virtual file map. Legacy HTML becomes `index.html` byte for
byte. Component, web, theme and package editors share the CodeMirror view and
owner-scoped editor session. Files, Code, Preview and Problems are real contextual
instances in the same dock document. Their logical owner prevents escape into
unrelated slots. Closing an owner removes its subtree atomically; closing a Layout
still promotes its independent children. Reset panes restores the editor template.

Source edits persist immediately and invalidate artifact currency. Preview and
dashboard runs are explicit after the initial dashboard mount; failed builds keep
the previous successful document. Moving a panel retains its mounted iframe and
editor state. Reload or desk switching begins a fresh runtime session.

`esbuild-wasm` 0.28.2 compiles local module scripts, CSS and JSON in a cancellable
worker. A separate TypeScript 5.9.3 worker provides diagnostics and completion.
Only local imports, `@station/sdk`, `@station/ui`, React/React DOM 19.3.0 and their bundled types
are supported. Node modules, arbitrary npm installation and remote imports are
unavailable. Generated public tool resources are embedded for standalone/desktop
operation; this increases the HTML bundle size. Authored source is never evaluated
by the compiler or in the host document.

## Packages

A **contribution** is one named extension point declared by a package. It says
what Station may offer and which source implements it. It is not an asset, a live
widget, an installation or a grant. Multiple contributions can share a source;
multiple widget placements create independent instances of one contribution.

| Role | Meaning | Supported source |
| --- | --- | --- |
| Widget | Placeable surface | Sandboxed web project or portable widget program |
| Editor | Surface bound to an explicitly opened compatible asset | Sandboxed web project or portable widget program |
| Command | Explicit input/output invocation | Verified Component source or portable action program |
| Service | Retained methods with explicit wiring/lifecycle | Portable service program |
| Settings | Declared configuration fields/actions | Portable settings program |
| Asset type | Document schema, starter and editor declarations | Portable asset-type program |

These roles retain their version-1 manifest identities. Source-role validation
runs before preparation builds any member. Composition slots accept widget/editor
definitions; built-in Files/Code/Preview/Problems parts require an editor owner.
Declaring a service or asset type does not by itself start/register it: program
activation, instance creation, bindings and Start retain their separate contracts.
Not every role has a complete automatic installed-package discovery adapter today.

The lifecycle is **author source → prepare snapshot → review/install → make
available → place/open/invoke or explicitly activate/start**. Preparation is
reviewable work, installation pins bytes and reviewed permissions, desk availability
filters discovery, and runtime activation owns execution. None substitutes for
another. Package Settings describes availability rather than claiming its toggle
starts a service. Upgrading installs a fresh snapshot explicitly; editing the
package asset never mutates an existing installed snapshot.

A package asset owns `station.json`. Its version-1 manifest declares widget,
editor, command, service, settings and asset-type contributions referencing local assets, plus theme members.
Each contribution has an ID, title, role, entrypoint, creation visibility,
supported asset kinds, capabilities, owner channels and named slots. Slots list
eligible definitions and initial instances. `layout` optionally declares a tree of
`{ slot }` leaves and `{ axis, ratio, first, second }` splits. It must include `body`
and every declared slot once. Initial slot arrays form tab stacks. Recursive
definition graphs, excessive depth, unknown definitions and invalid ownership are
rejected. Hosts instantiate layouts; guests never supply host DOM coordinates.

Installation compiles web entries into an immutable snapshot and reviews requested
authority before registration. Nothing starts merely because it was installed.
Updates are explicit and reviewed again. Disabling/removing a package leaves saved
widget placements as unavailable placeholders; editor views fall back to Station.
Deleting authoring source does not uninstall an independent snapshot.

Source-only import/export remaps local asset references and Cargo identities. It
excludes grants, credentials, artifacts and runtime state. Import creates assets
after review; it does not install them. Component commands without current verified
bytes remain unavailable until their source is built and the installation updated.
Invocations use the existing P3 worker, hash checks, WIT grants and hard cancellation.
Commands appear in the palette and open a contextual input/output widget; opening
that widget does not execute the command.

## Guest SDK and authority

The local npm workspace package `@station/sdk` connects through a private
`MessageChannel` bound to the exact iframe execution. Guest origins are opaque;
`Origin: null` alone never authenticates a caller. Every operation validates its
shape, active workspace/desk, owner/resource binding, declared contract and grant.
Handles have bounded acquisitions, explicit release and owned subscriptions. No
raw scope, host DOM, storage or provider reference crosses the port.

The v1 bridge adapts a narrow allowlist: clock `now`, text digest, source-free asset
catalog, opened-asset editor operations, and explicitly declared command invocation.
Editor handles can subscribe to revision/selection changes. Command callers need
both `station:commands/invoke` and `command:<package>/<contribution>` declarations;
the command itself also needs its reviewed WIT grants. These are Station adapters,
not a general RPC exposure of arbitrary Loop Kit providers.

Owner-local named JSON channels are shared only with participants declaring those
channels. Slot operations can mount only eligible children in the same owner, with
bounded counts and depth. Grant removal, frame replacement, unexpected navigation,
owner removal and desk switching revoke authority and owned work. Loop Kit supplies
lifecycle ownership; Station's membrane and the Component worker enforce authority.

Frames retain `sandbox="allow-scripts"` without same-origin access and a restrictive
CSP. This is a local extension prototype, not a network-proof or CPU-isolated
marketplace runtime. Navigation/resource isolation, authenticated distribution,
remote package updates and standardized WASM UI capabilities remain future work.

## Theme assets

`theme.json` contains validated semantic colors, a supported font family, density,
spacing and radius. Selection resolves desk → workspace → app. Invalid edits retain
the previous valid theme; missing assets use the app default. Host CSS variables,
CodeMirror and SDK guests receive live tokens. The SDK exposes `--station-*`
variables and theme subscriptions without restarting the frame. Arbitrary CSS and
external fonts are not theme data.

Visual text/number fields retain local drafts while focused, including incomplete
hex, decimal and IME input. Enter/blur validate before committing; Escape restores
the latest source. Arrow keys change numeric drafts, settled by Enter/blur. A focus
without changes never overwrites an external edit. Each visual edit patches the
current validated JSON, retaining other concurrent token edits. Invalid JSON is
repaired through Code; visual edits never replace it with an older snapshot.

Hex (including alpha), rgb(a), hsl(a), and oklch literal colors share one validator
and picker parser. Text edits retain their format and precision. The Stealth HSV
picker converts intentional drag/channel edits to sRGB hex, with an explicit
OKLCH clipping notice; gray/black retain the chosen hue. Arbitrary color variables,
CSS rules, fonts and resources remain outside the schema.

Semantic icon search matches names and saved asset/path references. Catalog glyphs
preview the edited theme independently of the active desk theme. Missing/unsupported
files retain their reference and show recovery instructions; selecting Built-in
removes the override. SVGs are monochrome image masks, limited to 32 KiB and 256
elements. Scripts, CSS, animation, text, external resources and escaped attribute
values are rejected. Resource-scoped collaboration viewer policy is rechecked by
the store on every edit/remove/rename, including previously acquired SDK editor
handles. Private, unshared assets remain editable.

Workspace persistence still uses browser local storage and its size limits. Writes
must succeed before state publication; failed imports/installations cannot partially
change the active workspace. Keep exported source bundles as portable backups.

## Acceptance example

Import [acceptance-kit.station.json](examples/acceptance-kit.station.json) through
Configure desk → Packages → Choose file (or Paste JSON instead) → Import assets. Open its package asset and install
it after review. It includes a React/TypeScript widget, a composed editor using the
opened-asset contract, a light theme, and the current Rust/WIT Greeting command
source. Choose the editor through Open with and duplicate the desk to exercise
fresh runtime sessions with shared source. The imported command stays unavailable
until its remapped Component source is built through the configured Vercel Sandbox
and the package installation updated. Import never brings compiled bytes or grants.

## Forks, SVG and UI controls

Use **Fork package source** on an installed contribution/editor to copy its installed source into independent authoring assets. The fork gets a new manifest identity and must be installed explicitly. Semantic icons may reference SVG files in source assets; package export includes/remaps these references. Design and Code theme views share one JSON source. Portable `@station/ui` is curated alongside the SDK, and editor panes can be restored individually. See [the implemented checkpoint and future framework](forkable-workspaces.md), including the source-only collaboration limits and SVG studio import example.


## Agent-created packages and scoped metadata

Runtime authoring can use the shared command registry through CLI/MCP or an
explicit internal-agent task. Preparation produces immutable source/build snapshots
without installation; task installation permits only declared capabilities within
the task's reviewed scope. These installations retain authorizationTaskId provenance
and load disabled after restart. Ending the task disables them and clears grants,
while authored source remains forkable. Such grants are never exported as source.

The SDK exports the `assetMetadata` identity and `AssetMetadata` type. Acquire
`station:assets/metadata@1.0.0` only when declared and granted; get(assetId) returns
metadata and its state version, patch(assetId, patch, version) rejects conflicts,
and subscriptions are acquisition-owned. The host binds target asset IDs, checks
live task permissions on every call and exposes no source through this contract.
Task-based asset catalog results are scoped to approved/created assets. Legacy
capability IDs retain their original contracts. Task packages cannot delegate to
installed commands until all callee effects can be intersected safely.

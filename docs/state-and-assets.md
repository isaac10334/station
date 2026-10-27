# Assets, instances, services and persistence

Station has four distinct lifetimes. They can use the same property editor without owning the same data.

| Kind | Owns | Persists where |
| --- | --- | --- |
| Asset | Named authored source with a stable ID and source revision: a note, Markdown document, script, SVG, data source or reusable definition | Workspace asset source and metadata |
| Definition | Reusable defaults, semantic UI, bindings and child/slot composition | A definition asset; instances retain the activated origin/version snapshot |
| Widget instance | One placed use of a definition, configuration overrides, owned slots and view state | The desk's existing `DockLayout.panels` and `containers` graph |
| Runtime | Mounted controllers, execution, subscriptions, service handles and ephemeral interaction | Live scopes; recreated or stopped through lifecycle operations |

Use an asset when content needs its own identity, source history, references, sharing, reuse or independent permissions. Keep a small private value inline when it belongs only to its parent: a description string, an unsourced Notes widget or a view's filter. An asset can wrap a property value, adding those ownership and identity guarantees. Converting an inline value to an asset is explicit; merely expanding a property editor does not create one.

A property is a typed contract and editing surface. It can hold a value, compatible asset reference or typed action/script binding. It does not prescribe persistence. Saving a property on an asset patches that source revision; saving a widget setting patches its instance configuration. Editor drafts and selection are transient until an explicit save. Presentation changes retain the editor draft but do not install or run anything.

Services still exist. They are workspace-owned runtime instances with scoped dependencies and capability bindings; program contributions can have the `service` role. A service definition/package can be an asset, but a running service is not an asset. Installation, immutable activation snapshots, Start/Stop, grant review and runtime cleanup remain separate. Authored source never contains live handles, credentials or task grants.

## UI vocabulary and property-engine direction

| Term | Precise use |
| --- | --- |
| UI | The complete user-facing interaction/presentation, not a package ownership claim |
| Semantic element | Serializable control intent interpreted by a trusted renderer |
| React component | Host implementation detail; distinct from a WASM Component with imports/exports |
| Widget | A configured instance of reusable behavior, presented in the desk graph |
| Slot | Layout node holding instance references; not another content instance |
| Layout | Saved placement graph; a Layout widget owns a subtree of that graph |
| Docking | Validated placement/movement operations and their policy |
| Shell | Protected root widget composing the desk's named surfaces |
| Layer | Presentation/input ordering; general authored layer ordering/passthrough remains exploratory |
| Renderer | Adapter interpreting descriptions/events for a platform; it does not own application authority |
| Capability contract | Loop's versioned typed service identity; knowing its ID or descriptor grants no authority |
| Grant | Station authorization for specific operations/resources; distinct from installation or account authentication |
| Scope | Lifetime/ownership boundary for acquired resources and cancellation; not an authorization principal by itself |
| Command | Versioned application operation with schema, effects, resource checks and revision semantics |
| WASM resource | Runtime-owned/borrowed handle crossing a Component interface; host mapping and cleanup remain explicit |

The intended property engine connects type descriptors, compatible references,
validated script/action bindings, shared editors and caller-owned persistence.
Today's shared property editors and reference pickers are partial foundations,
not that completed engine. Generic asset properties accept a consumer-scoped
`reference` context (workspace identity, compatible options, optional source opening
and creation) through `PropertyEditor`. That context is trusted UI input, never
serialized into the field descriptor. Without it, references remain display-only.
Required references cannot clear; read-only references expose no editing actions.
Selection/drop/create await the consumer commit, retain the saved reference on
denial and prevent overlapping submissions. Compatibility and authorization must
still be checked by the owning command against current state. Creation uses the
consumer's authorized callback; a failed subsequent binding may leave its created
asset available for recovery. Root shells, shortcut widgets/inboxes and note sources
now reuse this contract. Typed bindings and generic source presentation remain open.
Migrate concrete consumers incrementally; do not add
another form store or infer execution authority from a property/reference.
[Core-system review](core-systems-review.md) owns the adoption inventory.

The Cap'n Proto-like distributed object-capability vision is not today's Loop
TypeScript API: that host currently returns in-process service handles. Keep
transport adapters replaceable, but specify remote reference identity, authority,
ownership, cancellation and failure before claiming transparent distributed calls.

## Pages and data views

A note is reusable document content. A page placement is a view-local `{id, assetId, parentId?}` reference to that content. The Pages data view stores its outline in widget configuration, separately from Asset browser groups. The same note can appear in more than one outline. Moving or removing a placement neither moves nor deletes the note asset. Missing sources remain in the outline and can be rebound.

Until customized, a Pages view discovers workspace note/Markdown assets. Its first outline edit materializes that list as explicit placements. New notes thereafter are added explicitly with **New page** or **Link existing page**. Parent references must exist and cannot form cycles. Nested pages can be expanded/collapsed and moved under another page through their row menu.

Other Data views reference data-source assets. Provider policy and exact source revisions still govern record edits. Search, layout, manual row order, column order/visibility and pinned settings menus belong to each view. Manual order is the default; newly discovered records follow existing ones. Sorting is explicit and temporarily supersedes manual order. Drag guides and Alt+arrow ordering change view configuration, not source record identity.

Navigation owns ordinary widget areas in the same docking graph. Its initial Pages area is created atomically through `navigation.initialize`, authorized against the containing surface and protected by command revision/epoch checks. A persisted initialization marker prevents removed areas from respawning. Legacy navigation filter/pin fields are retained for saved-source compatibility; the new default presentation no longer renders the old saved-search list.

Workspace persistence serializes these authored values and per-desk layouts through the existing workspace store. Runtime handles, editor drafts and transient overlays are excluded. Desk switching restores each desk's own graph. Layout migrations preserve IDs and references; Asset browser grouping and page outline placement do not rename asset IDs.

Changing the master overview root picker changes shell presentation with an explicit empty slot-seed override. It preserves current named surfaces, owned containers and widget configuration. Applying a different authored prefab composition is a separate definition operation.

Workspace deletion is an owner action in the workspace selection menu and
Settings > Workspaces. It requires typing the current workspace name exactly
(and the ID if its name is empty). The store removes the complete workspace in
one persisted update, selects a surviving workspace when necessary, and clears
its layout history. Existing composition subscribers revoke removed workspace
runtime scopes. At least one workspace must remain. Deletion has no undo and
does not purge shared server build caches or delete account data.

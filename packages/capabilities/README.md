# Station capabilities

Stable identities, typed operation contracts, and serializable guest values. This package contains no providers, React components, storage, or application bootstrap. Existing `unit:workspace/*` identities remain compatibility contracts.

`@station/capabilities/guest` is a types-only surface for iframe SDK consumers. Declaring or importing a capability never grants authority. Station validates grants, resources, and session ownership separately.


## Package ownership and verification

Public exports: root capability descriptors, types-only `./guest`, and `./icons`. Depends only on public Loop capabilities. Owns no resources; identities do not grant authority. Run `bun run repo verify @station/capabilities` from the root; `bun run check:packages` verifies packed exports and declarations.

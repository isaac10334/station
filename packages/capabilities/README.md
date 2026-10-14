# Station capabilities

Stable identities, typed operation contracts, and serializable guest values. This package contains no providers, React components, storage, or application bootstrap. Existing `unit:workspace/*` identities remain compatibility contracts.

`@station/capabilities/guest` is a types-only surface for iframe SDK consumers. Declaring or importing a capability never grants authority. Station validates grants, resources, and session ownership separately.

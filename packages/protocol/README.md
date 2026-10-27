# @station/protocol

Private, host-independent Station operation schemas and serializable contracts.
Zod 4 validates runtime inputs/outputs and produces JSON Schema for discovery.
This package imports no React, Bun, storage, provider or application singleton.

Schemas and capability IDs do not grant authority. The application creates opaque
invocation contexts, resolves resources, enforces task/package/workspace policy,
and owns cancellation and version checks. Transports must never infer owner
authority from this package's types, JSON fields, client labels or MCP annotations.

See [Agent control](../../docs/agent-control.md) for supported operations, scoped
consent, CLI/MCP usage and the independent installed-desktop acceptance gate.


## Package ownership and verification

Public internal export: root schemas and serializable values. Depends on Zod only; constructs no host resources and makes no permission decisions. Run `bun run repo verify @station/protocol`; operation behavior and denial tests live in apps/station/tests.

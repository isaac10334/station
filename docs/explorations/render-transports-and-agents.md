# Renderer transports and agent adapters

Research snapshot: October 25, 2026. Exploratory; these are investigation gates,
not selected dependencies or implemented Station features. Owner/next slices:
[core-system review](../core-systems-review.md).

## Component DOM

Inspected `polymorph-stream-dom` revision
`1869de52cf5072516e578c6783345b8ab7fc15b0`. Its
[README](https://github.com/polymorph-components/polymorph-stream-dom/blob/1869de52cf5072516e578c6783345b8ab7fc15b0/README.md)
describes a first spike: streamed protobuf DOM mutations, events and queries across
Component/worker/native boundaries. This is a renderer transport, not a replacement
for widget definitions, docking, capability grants or ownership.

It does **not** intrinsically eliminate DOM sandboxing issues. The
[mount API](https://github.com/polymorph-components/polymorph-stream-dom/blob/1869de52cf5072516e578c6783345b8ab7fc15b0/receiver/src/mount.ts)
has an optional policy hook. Its
[desktop policy](https://github.com/polymorph-components/polymorph-stream-dom/blob/1869de52cf5072516e578c6783345b8ab7fc15b0/receiver/src/policy-desktop.ts)
and [design](https://github.com/polymorph-components/polymorph-stream-dom/blob/1869de52cf5072516e578c6783345b8ab7fc15b0/docs/design.md#policy)
discuss script/navigation risks, style-based chrome spoofing, host ID/class
collisions, clone-budget gaps and text accounting. WASM memory isolation does not
contain unsafe DOM operations performed by a privileged host on the guest's behalf.

Gate: one verified Component, one widget-owned subtree, mandatory Station receiver
policy, explicit theme inputs, bounded nodes/text/events/resources, cancellation,
revocation, disposal and hostile-stream tests. Verify focus/accessibility and real
browser plus native rendering. Retain the current iframe/semantic routes until
evidence establishes replacement suitability. Do not weaken CSP as an integration shortcut.

## Component networking

Inspected `polymorph-iroh` revision
`8ca991e07cac01368f6df5abf4f96e0beaf6c223` (0.6.2 release merge).
The [README](https://github.com/polymorph-components/polymorph-iroh/blob/8ca991e07cac01368f6df5abf4f96e0beaf6c223/README.md)
still labels the overall design a proposal, while code and a verification matrix
describe implemented endpoint/stream/datagram/cancellation slices. Upstream tests
were inspected, not rerun during this review.

The [WIT contract](https://github.com/polymorph-components/polymorph-iroh/blob/8ca991e07cac01368f6df5abf4f96e0beaf6c223/wit/iroh.wit)
distinguishes authenticated key possession from naming and authorization. Station
must still approve peers, operations and resources. Inspect embedded artifact WIT;
toolchain-added imports can exceed the handwritten world. Start with an isolated
authenticated echo and explicit application authorization, independently of DOM work.

## Agent workflow direction

The useful integrating role is a coordinator owning scope, shared contracts and
verification, delegating bounded work and integrating results once. Subagents
return success/failure/needs-input plus artifact references and evidence; prose
success alone is not acceptance. A machine-local `C:/...` path is only retrievable
on that machine; cross-machine references need location, identity and digest.

Provider choices remain adapters. Official OpenAI guidance describes
[Codex exec, SDK and app-server integration](https://developers.openai.com/blog/codex-as-a-platform),
and [managed agents](https://developers.openai.com/api/docs/guides/agents-api/overview)
with [subagents](https://developers.openai.com/api/docs/guides/agents-api/multi-agent).
Bounded local jobs, embedded conversations/events/approvals and durable managed
sessions solve different needs. No one vendor route is selected here.

A candidate Station-owned result envelope is:

```ts
{
  jobId, parentJobId, machineId, providerRunId,
  status: "succeeded" | "failed" | "cancelled" | "needs-input",
  summary,
  artifacts: [{ uri, digest, mediaType, producerJobId }],
  verification: [{ claim, evidenceUri, outcome }],
  error?: { code, message, retryable }
}
```

Before implementation, define job authority, cancellation, resource ownership,
artifact transport and human approval boundaries against the existing
[command/task policy](../agent-control.md). A machine/VM is an execution target,
not an ambient permission grant. Goal persistence and scheduling belong above
individual provider runs; never create a privileged agent-only dispatch path.

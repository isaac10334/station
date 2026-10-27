# AI feature

Public in-app entrypoints are `application/conversation.ts` (`createConversation`),
`contracts/chat.ts` (`ChatPorts`, transcript/review values) and `contracts/catalog.ts`
(public metadata). `application/settings.ts` owns injected persistence;
`application/tools.ts` maps grants or an opaque internal task to existing commands.
`infrastructure/model-catalog.ts` alone owns metadata HTTP/cache handling. The
Gateway implementation remains a capability provider wired by `application.ts`.

```ts
const chat = createConversation(ports, workspaceId, instanceId);
const unsubscribe = chat.subscribe(renderSnapshot);
const dispose = chat.start();
chat.setGrants(reviewedSessionGrants);
try { await chat.send("Hello"); } finally { dispose(); unsubscribe(); }
```

One retained widget owns one controller. Stop, disposal, settings/grant changes,
task revocation and provider cancellation settle pending review and reject late
updates. Neither history nor credentials enter assets. `start` is separate from
construction so React render cannot open subscriptions. Model discovery receives
no key. Task tools still execute through the same command schema/effect/resource
policy as external callers; draft tools still require explicit save review.

Dependencies: pure Station asset/AI contracts, injected ports, `ai` value/tool types,
and Loop Kit scoped capabilities. This is deliberately a cohesive in-app feature,
not a new npm package: tools still use Station task/resource policy and asset
authoring. Extracting `@station/ai` now would export those product internals or
introduce forwarding wrappers; a package needs a concrete independent consumer.

Tests: feature-controllers, ai-capabilities, model-catalog, chat-markdown and task-sdk.
Provider credentials/network acceptance and actual rendering are separate gates.

`contracts/context.ts` describes explicit revisioned user selections; application
`context.ts` projects metadata, reads selected authored files and bounds prompt
composition. It does not confer tool authority. Markdown draft writes use the
private `station:ai/note-drafts` capability plus per-save human review. Task tools
reuse the shared command client to await operations and cancel them on turn abort.
See [Station agent](../../../../../docs/station-agent.md).

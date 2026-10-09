# @loop-kit/host

Small in-process host for ordinary JavaScript providers. It depends only on `@loop-kit/capabilities`.

```ts
import { defineCapability } from "@loop-kit/capabilities";
import { createHost } from "@loop-kit/host";

interface Clock { now(): number }
const clock = defineCapability<Clock>({ id: "loop:time/clock", version: "1.0.0" });
const host = createHost();
host.define(clock, { name: "Clock", description: "now(): number — Unix wall time in milliseconds." });
const registration = host.provide(clock, { create: () => ({ now: () => Date.now() }) });
const scope = host.scope();
const handle = await scope.acquire(clock);
console.log(handle.value.now());
await handle.release();
await scope.revoke();
await registration.unregister();
await host.dispose();
```

`Host` registers one provider per ID; acquisition requires the exact version. Registration is lazy: each acquisition calls `Provider.create` to make an independent instance, including acquisitions in the same scope. `ProviderContext.signal` and the returned handle signal are the same cancellation signal. `Provider.dispose(value)` is called once when that handle is released, revoked, removed, or disposed with its host.

`release`, `revoke`, `unregister`, and host `dispose` are idempotent async operations. They abort affected signals synchronously, then await pending creation and instance cleanup. A creation failure rejects that acquisition and creates no handle. An acquisition finishing after revocation/removal disposes its new instance and rejects. Cleanup failures reject the relevant lifecycle promise with an `AggregateError`; other cleanup attempts continue. A provider that never finishes creation can delay lifecycle completion, even after its signal is aborted.

Revocation prevents new acquisition and aborts existing handles. The returned service is a plain JavaScript object. Calls through retained references are **not** intercepted or blocked; providers and consumers must cooperate with cancellation. This host is a lifecycle mechanism, not a security boundary.

Scopes can be named and parented; revoking a parent aborts descendants immediately and awaits their cleanup. `scope.rename(name)` changes only display metadata. Reflection returns cached, deeply frozen data without service values, signals or lifecycle controls. Pending creation and releasing instances remain visible until settled; completed records are removed. IDs are host-local and ephemeral. There is no retained event history. Observer notifications are coalesced in a microtask, and observer exceptions cannot change lifecycle results.

```ts
const application = host.scope({ name: "Application" });
const workspace = host.scope({ name: "My workspace", parent: application });
const unsubscribe = host.subscribe(() => console.log(host.inspect()));
const handle = await workspace.acquire(clock);
console.log(host.inspect().scopes); // ownership, IDs and acquisition states
console.log(host.inspect().definitions); // namespace, contract package, ID/version and documentation
await application.revoke(); // includes workspace and handle
unsubscribe();
```

`host.define(capability, { name, description })` documents a contract independently of a provider. `host.inspect().definitions` includes host-known contracts with no provider. `provide` adds an undocumented definition when needed and preserves explicit documentation. Definitions remain after provider removal and are cleared on host disposal. Repeating `define` replaces display metadata; identical metadata keeps the cached snapshot unchanged. Namespace and contract package come from `namespace:package/path` IDs (for example `loop` and `time`), not npm package names. Multiple definition versions may coexist; acquisition still requires the registered provider's exact version. Definitions do not create instances, grant access, or reflect erased TypeScript members.

# @loop-kit/capabilities

Small runtime identities for typed service contracts. No host or platform dependency.

```ts
import { defineCapability } from "@loop-kit/capabilities";

interface Clock { now(): number }
export const clock = defineCapability<Clock>({ id: "loop:time/clock", version: "1.0.0" });
```

`Capability<T>` associates the service type with immutable `{ id, version }` data. `defineCapability<T>` validates a namespaced ID and nonempty version. Identical ID and version values represent the same runtime contract even when defined in different modules. The TypeScript type is erased: authors must coordinate the actual contract and version, and the package does not validate implementation objects.

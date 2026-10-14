# Station SDK

Runs inside a Station sandbox, never in the host. Import `connect` and acquire a declared and granted contract by its exact ID/version. Services are session-owned and stop when the host disconnects. TypeScript types do not grant authority.

```ts
import { connect } from "@station/sdk";
const station = await connect();
station.theme.subscribe((theme) => console.log(theme.mode));
const channel = station.state("selected-file");
await channel.set("src/main.ts");
```

Channels and child definitions must be declared in the owner's package manifest. Editor services are restricted to the opened asset. No host DOM, storage, scope, or provider values cross the connection.

This is an independently buildable npm workspace package, not a published release.
From the repository root, `bun run build:sdk` builds its public contract dependency
and JavaScript/declarations. `bun pm pack` from this directory creates a tarball;
workspace dependency ranges become versioned package dependencies in that tarball.
Consumers need matching `@station/capabilities` and Loop Kit packages available
locally or from a registry. Publishing remains an explicit separate step.

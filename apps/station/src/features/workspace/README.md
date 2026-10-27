# Workspace state ownership

`application/store.ts` exports `createStore(storage, policy?)`. One application owns the store; injected persistence preserves existing migration keys and serialized identities. `core/asset-state.ts` owns pure authored asset types/currency, `core/workspace-state.ts` owns pure workspace shapes, and `contracts/storage.ts` owns the persistence port. Reducers/validation no longer import store orchestration. Store subscribers own their unsubscribe functions. Tests: asset-migration, layout-history, station-layout, workspace-sharing, command-policy and feature-controllers.

Run `bun run repo context @station/app --json` and `bun run repo verify @station/app`.

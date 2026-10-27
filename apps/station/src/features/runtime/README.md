# Capability bindings

`contracts/binding.ts` distinguishes default/named configuration from acquired handles and source-free diagnostics. `application/binding.ts` exports `createScopedBinding(scope, capability, preference, catalog)`. The caller owns the scope/lease; no provider implementation is selected by consumers, and exact names cannot fall back. Host metadata is diagnostic only and grants nothing. Tests: feature-controllers and programs.

Run `bun run repo context @station/app --json` and `bun run repo verify @station/app`.

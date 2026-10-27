# Application shell

`application/ports.ts` exposes workspace/command/capability/session dependencies; the root injects them into WorkspaceApp. `application/overlays.ts` exports transient overlay data and `createOverlayActions`. Creation saves source and separately opens its editor without activation; stale-workspace deletion is rejected. `ui/components/workspace/shell-overlays.tsx` owns dialog presentation. Navigation history lives in its own controller. Tests: feature-controllers and existing layout/widget suites.

Run `bun run repo context @station/app --json` and `bun run repo verify @station/app`.

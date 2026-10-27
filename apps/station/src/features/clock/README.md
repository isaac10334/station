# Scoped clock

`application/controller.ts` exports `createClockController(runtime, workspaceId, preference?)`. Construct without effects, call `start`, then release its returned disposer. The controller owns one Loop Kit scope and interval; late acquisition never subscribes after disposal. Exact named preferences never fall back. `ui/components/workspace/clock-widget.tsx` adapts its observable snapshot. Tests: feature-controllers and workspace-capabilities.

Run `bun run repo context @station/app --json` and `bun run repo verify @station/app`.

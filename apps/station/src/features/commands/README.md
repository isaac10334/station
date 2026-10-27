# Application commands

`application/runtime.ts` exports `createStationControl`; it is the sole versioned schema/effect/resource/revision/operation authority. `application/client.ts` exports `createCommandClient(port)`: execute validates current revisions, run owns an operation subscription, wait releases it on terminal state or abort. Trusted UI adapters cannot mint task grants for transports. Installed package commands continue through the existing policy path; task delegation remains fail-closed. Tests: command-policy, station-control, control-mcp, task-sdk and feature-controllers.

Run `bun run repo context @station/app --json` and `bun run repo verify @station/app`.

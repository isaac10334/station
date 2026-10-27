# Program lifecycle

`application/controller.ts` exports `createPrograms(store, ports, namedServices)`.
`application/ports.ts` owns the compiler/engine/named-service contracts; every
dependency is mandatory. `contracts/engine.ts` owns the bounded worker schemas.
The controller can be instantiated without React, a Worker or browser bootstrap.

`application.ts` wires `services/program-activation.ts`, `services/program-engine.ts`
and `infrastructure/named-services.ts`. The engine owns its Worker; the controller
owns running instances, cancellation, recording surfaces and source subscriptions.
Call `dispose` before disposing the host. Widgets use stable instance IDs; moving
a placement does not restart its engine. Source edits invalidate activation;
Apply, Start and Stop remain explicit.

Named service registration has shared acquisition lifetime. Each invocation gets
an exact Loop Kit `scope.bind` dependency, with no default-provider fallback.
Opaque invocation requests are admitted only after Station validates caller,
method/resource bindings, contract stamps and effective permission intersection.
Provider registration and acquisition never grant guest authority.

Tests: `programs.test.ts` proves shared consumers, stop invalidation, contract
rewiring, subscription cleanup, denied calls/resources and task intersection.
`feature-controllers.test.ts` additionally proves exact named/default resolution,
incompatibility, missing providers and lease cleanup.

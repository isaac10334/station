# Station features

Each feature can contain contracts (identities, schemas, public ports), domain
(pure projections/algorithms), application (injected controllers), infrastructure
(implementations) and presentation adapters (under `src/ui` today). One npm package
can contain every role: AST checks apply to each source module, including types.
Concrete wiring remains in `application.ts`; browser startup remains in
`composition.ts` and `main.tsx`. There is one session store and host.

`bun run repo context @station/app --json` lists the feature README locations and
roles without injecting implementation source into agent context. Start there,
then inspect the factory/interface that is relevant to the task.

| Feature | Entry and ownership |
| --- | --- |
| ai | `application/conversation.ts` owns transient turns, reviews and cancellation; contracts describe injected settings/catalog/tasks/tools. |
| assets | `application/editor-document.ts` projects identity, revision, available and selected editors without opening or activating. |
| clock | `application/controller.ts` owns one scoped acquisition and subscription for a retained widget. |
| commands | `application/runtime.ts` is the single schema/policy/operation registry; `client.ts` owns asynchronous UI command waits. |
| navigation | `domain/search.ts`, `domain/command-search.ts` are pure; `application/history.ts` owns bounded per-workspace session history. |
| programs | `application/controller.ts` owns activation, running instances and subscriptions; mandatory ports separate compiler/engine/service implementations. |
| runtime | `application/binding.ts` uses Loop Kit public exact bindings and exposes source-free resolution diagnostics. |
| shell | `application/ports.ts`, `application/overlays.ts` describe trusted shell operations and inert asset creation workflows. |
| workspace | `application/store.ts` owns persistence, migration and state mutation; pure assets/workspace values live in `core/asset-state.ts` and `core/workspace-state.ts`. |

Factories with external effects expose disposal. Subscribe returns an unsubscribe;
provider registration, startup, configuration, acquired leases and authorization
remain distinct. Views must not recreate runtime owners for geometry changes.

Tests: `bun test apps/station/tests/feature-controllers.test.ts`, program, migration,
command, workspace capability and module-boundary suites; `bun run repo verify
@station/app` checks the package dependency closure. The living acceptance record
is [the engineering plan](../../../../docs/engineering-plan.md).

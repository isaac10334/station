# Station agent notes

Station is a self-extending workspace and Loop Kit host. Favor authored assets,
reusable definitions and runtime composition over one-off host features. Preserve
source, instance state, execution and authority as separate lifetimes; distinguish
working behavior from proposals.

Read [docs/README.md](docs/README.md) for the relevant contract, not every historic
document. [Core-system review](docs/core-systems-review.md) owns adoption gaps and
the next slices; [state and vocabulary](docs/state-and-assets.md) owns terms.
A slot is not a widget, a definition is not an instance, and a React component is
not a WASM Component. The intended property engine unifies typed values, compatible
asset references, validated bindings and editor selection; it is incomplete today.
Reuse and extend the shared contracts incrementally instead of adding local
subsystems or claiming that one schema-backed dropdown makes an entire UI authored.

Loop Kit is independently owned at `C:/src/ilt/loop`, upstream
[isaac10334/loop](https://github.com/isaac10334/loop). Read its AGENTS/package README
before upstream changes. Do not move Station permissions or workspace state there.
One integrating owner coordinates shared contracts and a living plan; delegate
bounded files/contracts and require results, artifact references and verification.
Surface tradeoffs before changing execution trust, persisted/wire identities or
package ownership. Routine refactors proceed within the authorized task scope.

Use **asset** for stored authored content and **Asset browser** for its browser. Legacy storage keys and WIT/capability wire IDs remain compatibility contracts; do not rename those by text substitution.

- **UI:** Read [DESIGN.md](DESIGN.md) before UI work and use its relevant design skills. Keep built-in React UI distinct from future capability-provided surfaces. Use semantic color and state tokens; preserve keyboard access, visible focus, and shortcuts that yield to inputs, games, and editors.
  Before adding UI, run `rg --files apps/station/src/ui/components` and read [apps/station/src/ui/components/README.md](apps/station/src/ui/components/README.md). Reuse responsibility-named React components and Tailwind utilities; keep shared behavior and appearance in those components. Inspect existing CSS ownership before adding geometry rules or overrides. Never edit generated CSS directly.
- **Package workflow:** Start with `bun run repo context <package> --json` and its README. Use `repo affected` and `repo verify <package>` for focused work; `bun run verify` is the full regression. [Architecture](docs/architecture.md) owns package/layer rules; [engineering plan](docs/engineering-plan.md) owns this mission. Identify owned files, public dependencies, forbidden changes and acceptance evidence before assigning work. One integrating owner coordinates shared-contract changes. See [tooling](tooling/README.md) for handoffs.
- **Boundaries:** Keep domain/use cases inward, depend on injected ports and public exports, and compose concrete providers at startup. Loop Kit owns capabilities/host/scripting/ui; Station owns permissions, workspace state and concrete adapters. Inspect exported types/TSDoc before duplicating generic behavior. Loop Kit is an external versioned dependency; use `repo link on <checkout>` for development and `repo link off` for the frozen install. See [dependency workflow](docs/loop-kit-packages.md); never copy upstream source into Station. Production rejects local links. Host lifecycle is not a guest-permission boundary.
- **Source documentation:** Put public ownership, lifecycle, authority and disposal invariants beside reusable code in TSDoc; examples are for consumers, not routine private UI.
- **Runtime claims:** Source edits must invalidate their built artifact. Verify real source, bytes, grants, and invocation before reporting a build or run as successful; mocked or stale output is not proof.
- **Verification:** After code changes, run `bun run typecheck` and `bun run build`. For Rust, WIT, generated bindings, or Component runtime changes, also run `bun run build:component`. Chrome is a good default for browser testing; use Chrome first, then the built-in Browser or Edge if needed. Verify affected UI and runtime behavior in the browser. Use Computer Use only when needed; report if all browser options fail.
- **Agent development:** [Agent control](docs/agent-control.md) owns the protocol and trust rules. Start with `bun run station:control --discover --instance <exact-origin>`, then paired `commands.list` / `state.inspect`. Inspect schemas; mutate with current epoch/revision. Independent tests may use a new isolated profile/fixture, never a silent live-to-headless fallback. UI, tasks and guests share policy; transports cannot mint grants or call owner dispatch. New operations require Zod input/output, effects/resource authorization, cancellation/revision semantics and denial tests. Prefer forkable authored workflows and narrow shared adapters. Never serialize credentials, grants or live state into authored assets. Command success is not rendering proof.
- **Installed desktop:** The user normally keeps an installed canary running, independently of this checkout. Inspect executable paths and the owners of ports 43157 and 43158 before launching desktop dev or native probes. Closing X can leave Station running in the tray; prefer its Quit action for restart. Agents may quit, update and relaunch the managed isolated acceptance installation (`com.isaacharvey.station.acceptance`, port 43158) as part of acceptance work without repeated permission, after verifying its exact executable/install path and preserving its profile. If graceful Quit fails, stop only processes verified to belong to that acceptance installation. Do not interrupt it when the user has said they are working in it. Never terminate unrelated Bun/WebView2 processes, overwrite the normal installed canary with an acceptance build, or delete user profiles. Development uses a separate Electrobun identity/channel/profile on port 43159, independently of the normal canary on 43157 and managed acceptance on 43158. See `docs/desktop.md` and `docs/native-browser.md`.
- **Docs:** Use the linked owner document, [decisions](docs/decisions.md) for durable choices, and [docking](apps/station/src/ui/docking/README.md) for placement. Correct stale/duplicate guidance within the affected topic, preserve unresolved gates, fix links, and label proposals/history. Date evidence with its actual scope. Do not copy volatile status lists here or audit all docs for every task.

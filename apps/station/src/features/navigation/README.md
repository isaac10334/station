# Navigation and search

`domain/search.ts` projects assets and panels using injected display titles; `domain/command-search.ts` owns accent/acronym ranking. Neither depends on React or storage. `application/history.ts` exports `createNavigationHistory`; one shell owns its bounded per-workspace stacks and clears them on disposal. The React metadata adapter is `ui/workspace-search.ts`. Tests: feature-controllers and workspace-search.

Run `bun run repo context @station/app --json` and `bun run repo verify @station/app`.

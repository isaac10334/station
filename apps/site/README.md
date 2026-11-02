# Station download site

A separate static marketing site. Real copy and the canary download work without
JavaScript. React/Motion enhances the perspective illustration and the shared theme toggle; no WebGL,
continuous animation, analytics or remote fonts. Icons are shared with Station
through `@station/ui`.

From the repository root: `bun run dev:site` (port 3002) and `bun run build:site`.
The output is `apps/site/dist`. The browser resolves the fixed `canary` GitHub tag
on each page load and validates the self-contained Windows `.exe` installer URL.
Users run that one file; they do not need to extract a ZIP. It never uses the
stable-only `releases/latest` endpoint. Once resolved, it downloads the immutable
archived build so replacing the channel cannot interrupt that download. The known fixed canary asset is the fallback
when GitHub is rate-limited or offline. Publishing new canary assets still depends
on the existing release workflow.

## GitHub Pages

After committing/pushing this work, set repository Settings → Pages → Source to
**GitHub Actions**. The **Station website** workflow runs on site/shared UI changes
on `main`, after a successful canary publication, and by manual dispatch. It builds and deploys only
this site; Station's app and workspace data are separate. Add a custom domain in
Pages settings if desired. JavaScript is optional for the download button; if the
GitHub API is unavailable, it retains the fixed canary installer URL.

## Vercel alternative

Create a separate project for this repository. Set Framework to Other, Root
Directory to `apps/site`, Build Command to `bun run build`, and Output Directory
to `dist`. Enable access to files outside that root for workspace dependencies and
use `bun install` at repository root. Build `@station/ui` first (override the build
command to `bun run --cwd ../.. build:site` if the project does not run workspace
builds automatically). No secrets/environment variables are needed. Do not reuse
Station's Component-build project or credentials for the marketing site.

The site has not been deployed by this change. Enable one of these hosting paths.

Station and the site share default color/font CSS and the circle-reveal theme toggle through `@station/ui`. Brand SVG/ICO/PNG assets are generated with `bun packages/ui/scripts/brand-icons.ts`. The Windows application uses that ICO. The Windows/GitHub marks in the static page preserve SVGL geometry and use monochrome site color.

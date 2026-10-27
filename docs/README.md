# Station documentation

Documentation routes consolidated on 2026-10-27. Dates on older acceptance records
describe those runs; they do not establish acceptance of later edits.

| Current contract | Start here |
| --- | --- |
| Vision, vocabulary and current adoption gaps | [Core-system review](core-systems-review.md), [state and vocabulary](state-and-assets.md) |
| Engineering gate and baseline audit | [Engineering plan](engineering-plan.md#package-foundation-baseline-2026-10-19) |
| Application boundaries | [Architecture](architecture.md), [durable decisions](decisions.md) |
| Local development and exact instance control | [Agent control](agent-control.md) |
| Accounts and device sessions | [Accounts and sync](accounts-and-sync.md) |
| In-app AI agent, prompt context and reviewed drafts | [Station agent](station-agent.md) |
| Source sharing and collaboration limits | [Forkable workspaces](forkable-workspaces.md) |
| Widgets, definitions and placement | [Widget system](widget-system.md), [docking](../apps/station/src/ui/docking/README.md) |
| Authored widget structure, upgrades, inline editors and icon sources | [Programmable authoring](programmable-authoring.md) |
| Embedded VectorCraft, command adapter and native integration boundary | [ArtCraft integration](artcraft-integration.md) |
| Rich note/Markdown assets, widgets and inline properties | [Rich text authoring](rich-text-authoring.md) |
| TypeScript, services and portable surfaces | [Programmable foundation](programmable-workspace-foundation.md) |
| Semantic elements, actions, icons and renderer boundaries | [Semantic UI](semantic-ui.md) |
| Data providers, records and formulas | [Data and scripting](data-sources-and-scripting.md) |
| Keyboard shortcuts, desktop-global bindings and Inbox capture | [Shortcuts and capture](shortcuts-and-capture.md) |
| Packages and SDK | [Extensions](extensions.md), [composition](composition-and-decisions.md) |
| Loop Kit install, development links and releases | [Dependency workflow](loop-kit-packages.md) |
| Loop host ownership, leases and task lifecycle | [Host lifecycle contract](https://github.com/isaac10334/loop/blob/main/packages/host/LIFECYCLE.md) |
| Desktop and native browsing | [Desktop](desktop.md), [native browser](native-browser.md) |
| Component execution and grants | [Runtime profile](component-runtime-profile.md) |

Keep implementation contracts beside the code when possible. These documents
explain boundaries and workflows; one canonical document should own each topic.

## Open work and evidence

- Local account login and presence do not confer workspace authority or sync local
  assets. Agents need an exact renderer pairing. See Agent control and Accounts.
- A local browser check does not establish installed native behavior, A→B updater
  acceptance, or a configured Codex MCP client connection. Track those separately
  in Desktop, Native browser and Agent control.
- Property editors now share type resolution in trusted host UI. Runtime packages
  cannot register arbitrary React renderers. Sandbox-backed custom property editor
  contributions and broader drawing/GPU contracts remain open. Rich text authoring now has a shared built-in editor.
- Portable runtime engine alternatives, container compiler availability and GPU
  display experiments retain their independent gates in the Programmable foundation.
- Marketing publication, reviewed static export and a narrowly granted publisher
  remain separate from workspace authoring. See the [remaining checkpoints](prompts/next-station-checkpoints.md).

## Exploratory and historical material

`explorations/` contains proposals, not a second specification. The superseded UI
proposal's remaining work is consolidated in [Workspace surfaces](explorations/surface-system.md#source-aware-editing-drawing-and-gpu).
The original dock migration's decisions belong to [Decisions](decisions.md) and
its compact historical evidence is in the [docking contract](../apps/station/src/ui/docking/README.md#historical-migration-evidence).
The old package audit is summarized in the Engineering plan instead of maintaining
a second inventory of dependencies and scripts.

Paths in dated acceptance records identify the original run; generated local logs
and build/test scratch are not required repository inputs. Screenshots and
structured evidence in `outputs/` are retained where available.

[Component DOM/network transports and agent adapters](explorations/render-transports-and-agents.md)
records pinned upstream research and investigation gates; no replacement or harness
architecture is selected.

- [Workspace presentation acceptance](workspace-presentation-acceptance.md): dated browser evidence and remaining pointer/native checks.

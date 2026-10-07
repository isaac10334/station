# Design engineering route

Read this file before any UI work. Start with the locally installed **Stealth** skill (`C:/Users/ijhar/.codex/skills/stealth/SKILL.md`) for the overall design judgment. Then read only the skills that match the work. Skills guide design engineering in general; they are not limited to Stealth UI registry components. The [Stealth skills catalog](https://www.stealth.pm/skills) currently lists these 15:

Use one clear title in card and widget headers. Do not place a generic uppercase category, type, or eyebrow above a title when it repeats the title's meaning (for example, “LAYOUT” above “Widget stack”). Put actions on the same aligned row as the title; reserve supporting labels for information that changes what the user can understand or do.

| Skill | Use when |
| --- | --- |
| [stealth](https://www.stealth.pm/skills/stealth) | First pass for any UI task: hierarchy, restraint, consistency, and final quality bar. Local: `C:/Users/ijhar/.codex/skills/stealth/SKILL.md`. |
| [space](https://www.stealth.pm/skills/space) | Layout, alignment, padding, density, breakpoints, scrolling, and responsive surfaces. Local: `C:/Users/ijhar/.codex/skills/space/SKILL.md`. |
| [interaction](https://www.stealth.pm/skills/interaction) | Pointer, keyboard, focus, drag and drop, latency, and feedback. Local: `C:/Users/ijhar/.codex/skills/interaction/SKILL.md`. |
| [motion](https://www.stealth.pm/skills/motion) | Enter/exit, drag motion, transitions, and reduced motion. Local: `C:/Users/ijhar/.agents/skills/motion/SKILL.md`. |
| [components](https://www.stealth.pm/skills/components) | Reusable component API, primitives, state matrix, and accessibility contract. Local: `C:/Users/ijhar/.codex/skills/components/SKILL.md`. |
| [a11y](https://www.stealth.pm/skills/a11y) | Focus order, semantics, announcements, contrast, or assistive technology behavior. |
| [agent-ui](https://www.stealth.pm/skills/agent-ui) | Agent output, pending actions, approval states, or human and agent collaboration UI. |
| [mobile-feel](https://www.stealth.pm/skills/mobile-feel) | Touch targets, gestures, mobile layout, and device feel. |
| [polish](https://www.stealth.pm/skills/polish) | Final visual and interaction pass after behavior works. |
| [review](https://www.stealth.pm/skills/review) | Structured critique of an existing UI or an implementation before shipping. |
| [scroll-and-webgl](https://www.stealth.pm/skills/scroll-and-webgl) | Scroll-linked motion, 3D scenes, or WebGL surfaces only. |
| [states](https://www.stealth.pm/skills/states) | Empty, loading, error, disabled, success, and recovery states. |
| [surface](https://www.stealth.pm/skills/surface) | Layering, elevation, borders, materials, and backgrounds. |
| [type](https://www.stealth.pm/skills/type) | Type scale, font pairing, line height, and reading rhythm. |
| [ux-copy](https://www.stealth.pm/skills/ux-copy) | Labels, instructions, error messages, and action copy. |

The five local paths above are installed. For a catalog skill that is not installed, consult its linked catalog page when relevant; do not claim a local file exists. Treat the skill as design guidance, while the app's contracts and current source remain authoritative.

For registry work, inspect dependency lists and source with the shadcn MCP before adding an item. Use Stealth source where it fits. Keep focus, keyboard, and reduced-motion behavior intact when adapting it. Check 375, 768, 1024, and 1440px for layout changes.

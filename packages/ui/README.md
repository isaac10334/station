# Station UI

Shared semantic icons and small, portable React guest controls. The contract
catalog lives in `@station/capabilities/icons`; providers and host wiring do not
belong here. Host behavior primitives such as docking, grants and editor sessions
stay inside the Station application. This package is private while its API settles.

```tsx
import {connect} from "@station/sdk";
import {Button, Surface, Icon, bindTheme} from "@station/ui";
const station = await connect();
const unsubscribe = bindTheme(station);
// Render with React; call unsubscribe when this UI is removed.
const view = <Surface><Button><Icon name="Plus"/>Create</Button></Surface>;
```

Guest controls use SDK semantic CSS variables. Icons use host-validated static SVG
image masks, not injected markup. Host controls retain their existing interaction
motion; SVG animation and arbitrary CSS are outside this first icon-override format.

The host and marketing site also share `@station/ui/tokens.css`, `fonts.css` and `theme-toggle`. The circle reveal has reduced-motion and unsupported-API fallbacks. These rendering helpers grant no permission to alter Station app settings. `scripts/brand-icons.ts` emits SVG/ICO/PNG from one S polygon; fonts are bundled locally.

`Icon` accepts `builtIn` for catalog/recovery previews that must bypass the active
override. Invalid image loads fall back to the built-in glyph. Override snapshots
notify only when their URLs change; the host forwards icon-only updates to live
guest sessions without replacing their frames.


## Package ownership and verification

Public exports are the root controls, icons, theme-icons, theme-toggle and CSS tokens/fonts. Depends on public Station contracts, font assets and React peers; never on app implementations. Dispose theme bindings and subscriptions with their mounted surface. Run `bun run repo verify @station/ui`; rendering acceptance belongs to the consuming app.

Builds compile into a temporary sibling of `dist` and publish complete changed
files by rename. Identical outputs retain their timestamps, so running repository
checks beside desktop HMR does not expose partially written imported modules.

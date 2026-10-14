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

# Station 3D pipeline briefs

Copy a block into the external content pipeline. These specify assets; no replacement scene has been produced yet. Use `packages/ui/assets/station.svg` as the exact S silhouette. The current webpage scene is a perspective placeholder.

## Main hero: a small station for programmable tools

```text
Create a polished, playful miniature “Station” for a programmable workspace marketing site. TRUE ISOMETRIC: orthographic camera, Y-up world, viewing along normalized (1,1,1) toward origin (45° azimuth, 35.264° elevation), equal projected axis scale, no perspective convergence/orbit/parallax. Transparent 16:10 artboard; focal objects in central 80%, readable at 375px mobile width. Optional mirrored composition for copy-on-right. Typography/UI labels are host DOM overlays, not blurry microtext baked into textures.

Model a rounded-square station platform with two parallel rails, a small shelter/workbench, chunky extruded S sign from supplied SVG, and three little rail carts carrying Files, Code and Preview modules. A widget is a physical thin rounded slab with shallow bevel, title rail, pickup notch and magnetic connector geometry. Files: folder/tree silhouette. Code: two brackets and aligned grooves. Preview: framed canvas and an S tile. One forked module parks on a short siding to convey editable copies. No generic cubes, fake logos, glass gradient cards, ornate scenery or vague AI sparkles. Tactile enamel, satin metal, pale paper and restrained felt/wood; stylized and cute, not photoreal or toy overload.

Palette: Station light page #f2f2f0/frame #fbfbfa/fg #151515; dark page #080808/frame #0d0d0d/fg #ededed; small muted olive/clay accents. Transparent background with separate contact-shadow layer for either theme. Semantic material names: page, frame, raised, fg, muted, line, accent-olive, accent-clay; runtime palette replacement needs no texture re-download. One soft area key, broad fill, readable bevel highlights, mild AO/contact shadow; no bloom/noise/chromatic aberration/moving HDR. Preserve S proportions exactly.

Named deterministic states/clips:
- idle: settled composition, no continuous motion or required simulation.
- arrange: lift module 0.08 units/120ms, slide to neighboring dock/300ms, align connectors, damped magnetic catch/140ms. One restrained cart follow-through, clear before/after.
- build: Code emits a tangible token, cart carries it to Preview/550ms, preview frame opens/180ms. At most 12 connector particles fading within 600ms, no endless light ribbons.
- fork: copy unfolds/250ms then slides to siding/350ms; original stays put, connectors explain relationship.
- theme: palette crossfade/250ms with tiny mechanical sign flip, no camera motion.
- reset: interruptions return predictably to idle; clips scrubbable/reversible.

Optional interaction: constrained module pickup/drag with plane limits and three named snap zones. Simple convex collision proxies; magnetic spring/damper joints settle on release. No chaotic piles/violent impulses/offstage objects. Stop physics/rendering within 2s of settling and whenever hidden/offscreen. Buttons/keyboard invoke equivalent clips/snap choices. Reduced motion selects stable final poses immediately; information never depends on motion. Do not simulate the whole webpage with physics.

Export editable native project plus optimized GLB (meters, Y-up, applied transforms, stable names, no external URLs), optional <=512px KTX2 textures, clips and collision/snap JSON. Budgets: <=60k triangles, <=25 draw calls, <=1.5MB compressed scene, <=256KB textures. Supply consistent light/dark/neutral static WebP/PNG posters at 512/1024/1600px and simplified SVG fallback. Manifest: node IDs, semantic materials, bounding boxes, clip durations, snap targets, labels, events {arrange,build,fork,theme,reset}; no executable metadata. Renderer runs on demand, 60fps desktop/30fps low-power, DPR <=1.5, shadows/particles degrade first, context loss recovers. Navigation/download works before load. Deliver checksums/licenses/integration README; no Station account/workspace data baked in.
```

## Matching isometric icon kit

```text
Create 8 object icons in the hero's orthographic projection/material/bevel/lighting language: Files (open folder/two leaves), Code (bracket workbench), Widgets (three connecting slabs), Packages (crate/modular connector), Desks (two tidy platforms), Themes (three tiles/swatch fan), Browser (viewport/address rail), Fork (original/copy on branching rail). No numbers, generic sparkle/wand/brain symbols, vendor logos or unreadable lettering.

Read at 48px; recognize at 24px. Transparent square, optical alignment, 12% safe margins. Deliver flat SVG silhouettes for tiny UI, static 128/256/512px WebP/PNG and optional individual GLBs <=100KB/5k triangles/5 draw calls. Match semantic materials, include light/dark posters without requiring WebGL. Optional press clip: one purposeful mechanical change <300ms, returning to idle; no endless hover wobble. Keyboard/reduced motion selects stable poses. One coherent kit, editable source/manifest/licenses/checksums/naming map. Marketing illustrations are separate from host theme-glyph authority.
```

## Reusable micro-scenes

```text
From the same kit, export three 4:3 micro-scenes for social/video/web: Dock (panels align/latch, 1.2s), Fork (copy follows branch to new desk, 1.8s), Build (source token becomes preview on arrival, 1.6s). Fixed orthographic camera, no baked narrative text, consistent margins, transparent background, deterministic endpoints. Offline loop exports are optional; website playback is interaction-triggered, visible-only and finite. Export MP4/WebM/animated WebP, static posters, reusable GLB clips and no-motion SVG. No autoplay audio. Assets should work in a future Station web content project without special host dependencies.
```

## Codex integration prompt after delivery

```text
Integrate delivered Station scene assets into apps/site after inspecting actual format/licenses/manifest. Read DESIGN.md and shared UI boundaries. Prefer the pipeline renderer; avoid adding several rendering/physics libraries for baked clips. Preserve true orthographic projection and semantic palette synchronized with shared theme. Motion owns DOM controls/labels; scene owns finite clips. No real workspace access.

Reserve responsive aspect ratio; static SVG/WebP is initial/no-JS/reduced-motion/low-power/context-loss fallback. Load near visibility, pause offscreen/hidden, render on demand, cap DPR, sleep physics. Accessible Arrange/Build/Fork buttons with focus/pressed/busy states; keyboard equivalents for drags, no page-scroll capture. Handle interruption/reversal/reset/load failure without camera animation. Downloads/navigation stay DOM and usable if 3D fails.

Measure actual bytes/draw calls/memory/frame time under throttling; enforce brief budgets or simplify. Verify four widths, both themes, keyboard/reduced motion. Run typecheck/build:site and app build for shared changes; reload, inspect console/network, capture screenshots. Document assets/events and any undelivered pipeline item. No automatic deploy or claim of a live Station demo.
```

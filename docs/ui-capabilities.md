# UI capabilities: first contract proposal

This is a proposal, not an implemented guest rendering API. The built-in Files
widget now uses a reusable Stealth tree view. `@station/capabilities` contains the
existing typed capability identities and serializable guest contracts; it does
not yet expose a tree renderer, SVG renderer, or GPU device.

## Separate the responsibilities

| Boundary | Responsibility |
| --- | --- |
| Semantic UI | Accessible controls and data views: tree, list, form, table, tabs. |
| Interaction | Owner-bound events, focus requests, selection, and cancellation. |
| Drawing | A validated scene of paths, shapes, text, transforms, and clipping. |
| GPU rendering | Explicit buffers, textures, pipelines, submissions, budgets, and device loss. |

Begin with one semantic UI contract. Split packages when implemented consumers
need independent contracts, rather than publishing empty packages for every row.
Keep the drawing scene and GPU resource API distinct: an accessible tree and a
GPU submission do not have the same data model or lifecycle.

## First vertical slice: host-rendered file tree

The host allocates a surface lease in a declared slot of an existing owner. The
guest submits versioned, bounded tree data and receives typed events. The surface
uses the existing widget-instance and placement system. It cannot create another
workspace surface or move outside its owner.

An illustrative request (the exact schema and capability ID remain undecided):

```json
{
  "revision": 3,
  "component": "station:tree",
  "props": {
    "label": "Project files",
    "items": [{ "id": "main", "label": "main.ts", "kind": "file" }],
    "selected": ["main"]
  },
  "events": ["select", "expand", "activate"]
}
```

The host selects the trusted renderer and semantic theme tokens, owns DOM and
accessibility, and emits events containing the surface, revision, node ID, and
allowed event kind. It validates revisions and node membership before dispatch.
The guest cannot pass functions, React elements, HTML, CSS rules, host objects,
external resource URLs, or arbitrary event names.

Editing a selected file requires the separate editor-session grant for the opened
asset. A click event is not authority to mutate another asset or run a command.

Submission needs limits for bytes, node count, nesting, text length, update rate,
and queued events. Handle release, owner removal, desk switching, permission
revocation, and transport loss remove the surface and cancel queued work. The
host keeps the previous valid tree after a rejected update and reports an error.

## Shared SDK and component catalog

Two useful paths can coexist:

- A guest-side React UI library bundles into an iframe and uses SDK theme variables.
  It provides familiar components inside that guest's own DOM.
- A semantic UI capability asks Station to render trusted components in an
  explicitly allocated host slot. Iframe guests use the private MessageChannel;
  Components need a separately implemented and verified WIT adapter.

Both should use shared component names, prop schemas, icon identities, semantic
tokens, and event definitions. They need not share a DOM tree or React runtime.

Plugins can contribute validated composition recipes over eligible catalog
definitions, or sandboxed custom widgets. A package cannot register arbitrary
JavaScript as a privileged host React renderer. Native/provider implementations
remain trusted infrastructure with explicit installation and authority boundaries.

## SVG and WebGPU

A later drawing contract should use typed paths, shapes, text and bounded resource
handles. An SVG adapter can implement it without accepting raw SVG markup, script,
foreign objects, or unreviewed external references. A Canvas adapter can implement
the same supported subset; unsupported features must produce explicit errors.

WebGPU should expose an explicit rendering contract with bounded resource
allocation, submission limits, cancellation policy, and device-loss handling.
Shaders introduce executable work and GPU/driver risks. A serializable schema or
WASM memory isolation does not make shader execution safe by itself. Keep this
authority separate from ordinary UI composition and evaluate real backend isolation.

## Delivery order

1. Dogfood the host tree renderer with the built-in Files widget and a JS test client.
2. Add a bounded surface service and iframe SDK adapter with forged-message,
   cross-owner, revision, limits, cleanup, keyboard, and theme tests.
3. Add the WIT adapter and verify real Component bytes and host invocations.
4. Add forms/lists and composition recipes based on actual editor needs.
5. Evaluate drawing adapters and GPU contracts as independent slices.

Existing Component import checks, grants, byte verification, and hard worker
cancellation remain necessary. Host rendering adds another effectful provider;
safe capability calls depend on that provider's validation and lifetime enforcement.

# Follow-up: contextual shortcuts and configurable actions

This is a proposed mission, not implemented behavior. Start with
`docs/shortcuts-and-capture.md`, the current Loop Kit public exports, and package
context/README output. Preserve existing preferences, widget asset identities,
wire IDs, task grants and the one workspace/docking owner.

Build a reusable action/condition foundation for a Station shortcut manager that
can eventually resemble VS Code's `when` clauses without exposing host execution.
Inspect the independent Loop repository before changing its generic contracts;
use its development-link workflow rather than copying source into Station.

Deliver a typed, serializable condition tree with a closed context catalog:
workspace/desk IDs, focused widget/slot, editor/game/text-input focus, selection
state, and action availability. Define evaluation precedence, unknown/missing
values, boolean-only results, cancellation and revision semantics. Default-deny
unknown conditions. A visual formula builder and a source view must edit the same
AST. Raw strings must never become JavaScript in the trusted renderer.

Evaluate optional scripted predicates only through the existing bounded scripting
engine with explicit JSON input/output. Inspect its actual public contracts first.
Predicates receive a redacted context snapshot and no native/workspace handles,
filesystem/network access, grants or action callbacks. Script errors/timeouts
disable the binding visibly. Host lifecycle alone never authorizes invocation.

Consolidate shortcut actions onto the existing Loop Kit ActionDescriptor routing
where that contract fits. Add narrow adapters for widget definitions, live widget
references, installed package commands/widgets and capture destinations. Definitions
and instances are different reference types. Installed actions must intersect
their current installation/task/resource grants; switching a target must not
inherit the old target's authority. Add no second command registry or owner
dispatch shortcut.

Make the manager a projection over one preference source through a settings
controller/provider. Extend the property/Data view contracts only as needed for
shortcut recording, action descriptors and typed asset/instance references.
Keep trusted React editor registration separate from portable descriptors and
sandbox-backed editors. Editing a projected cell must validate and update the
same authoritative binding, not a copied table. Specify undo/reset and conflict
handling, including overlapping scopes and portable `mod` aliases.

Before adding external operations, specify Zod inputs/outputs, effects, resource
authorization, revision/cancellation behavior and denial tests. OS-global
registration needs explicit Station-owned review; importing an asset or package
must not register global shortcuts. The native transport receives bounded IDs,
never executable invocations or policy approval flags.

Accept only after tests prove context changes/revocation/stopped engines invalidate
bindings, unavailable conditions fail closed, conflicts are deterministic, and
recording never runs an action. Verify actual desktop drag/drop from the Asset
browser into a docked manager, keyboard-only configuration, restored persistence,
and outside-app invocation. Report installed-native and web acceptance separately.

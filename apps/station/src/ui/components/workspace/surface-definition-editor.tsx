import { useId, useState } from "react";
import { semanticElements, type UiNode } from "@loop-kit/ui";
import { authoredSurfaceSchema, CONTROLLER_INPUTS, type AuthoredSurface } from "../../../core/authored-surface";
import { editSurface, moveSurfaceNode } from "../../../core/surface-authoring";
import { EditorWorkbench } from "./editor-workbench";
import { PortableSurface } from "./portable-surface";
import { TreeView, type TreeNode } from "../ui/tree-view";
import { CollectionView } from "../ui/collection-view";
import { PropertyEditor } from "../ui/property-editor";
import { Button } from "../ui/button";
import { NativeSelect } from "../ui/native-select";

/** Source authoring over the same Loop element contracts used by live surfaces.
 * Selection and draft JSON are local; only validated candidates reach onChange. */
export function SurfaceDefinitionEditor({ surface, readOnly, onChange }: { surface: AuthoredSurface; readOnly: boolean; onChange: (next: AuthoredSurface) => void }) {
  const [key, select] = useState(surface.frame.root.key), [error, setError] = useState("");
  const scope = useId(), nodes = new Map<string, UiNode>();
  const tree = (node: UiNode): TreeNode => {
    nodes.set(node.key, node);
    return { id: node.key, label: `${node.label || node.text || node.type}`.slice(0,80), meta: node.type,
      drag: readOnly ? undefined : {
        onDragStart: node.key === surface.frame.root.key ? undefined : event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-station-element", JSON.stringify({ scope, key: node.key })); },
        onDragOver: event => { if (event.dataTransfer.types.includes("application/x-station-element")) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } },
        onDrop: event => { event.preventDefault(); event.stopPropagation(); commit(() => { const data = JSON.parse(event.dataTransfer.getData("application/x-station-element")); if (data.scope !== scope) throw new Error("Drop an element from this definition"); return moveSurfaceNode(surface, data.key, node.key); }); },
      }, children: node.children?.map(tree) };

  };
  const items = [tree(surface.frame.root)], selected = nodes.get(key) ?? surface.frame.root;
  const contract = semanticElements.get(selected.type)!;
  const commit = (change: () => AuthoredSurface, propagate = false) => { try { if (readOnly) return; onChange(change()); setError(""); } catch (reason) { setError(String(reason)); if (propagate) throw reason; } };
  const patch = (patch: Partial<UiNode>, propagate = false) => commit(() => editSurface(surface, selected.key, patch), propagate);
  return <EditorWorkbench hierarchy={<>
    <TreeView aria-label="Semantic element hierarchy" items={items} defaultExpanded={[...nodes.keys()]} selected={[selected.key]} onSelectedChange={keys => { if (keys[0]) select(keys[0]); }} />
    <p className="mt-3 text-xs text-fg-3">Drag an element onto a parent row to move it. Select a parent to add a child.</p>
    <details className="mt-3"><summary className="cursor-pointer text-xs">Add element</summary><CollectionView label="Element catalog" presentation="grid" source={{ roots: () => [...semanticElements.values()].filter(item => !contract.children.allowed || contract.children.allowed.includes(item.id)), id: item => item.id, label: item => item.id, children: () => undefined }} onSelect={type => {
      if (readOnly) return;
      if (!contract.children.max) { setError("Select a container to add children"); return; }
      const child = { type, key: `element-${crypto.randomUUID().slice(0,8)}`, ...(["button", "input", "toggle", "select", "metric", "list", "tree", "table", "popover", "menu"].includes(type) ? { label: `New ${type}` } : {}), ...(["text", "button", "metric"].includes(type) ? { text: `New ${type}` } : {}) };
      patch({ children: [...(selected.children ?? []), child] });
    }} /></details>

  </>} inspector={<div className="space-y-4">
    <p className="break-all text-xs text-fg-3">{selected.key} · {selected.type}</p>
    {(["text", "label"] as const).map(property => <label key={property} className="block space-y-1 text-xs">{property}<PropertyEditor field={{ key: property, label: `Element ${property}`, type: "text", multiline: property === "text", maxLength: 8192 }} value={selected[property]} readOnly={readOnly} onCommit={value => patch({ [property]: value }, true)} /></label>)}
    {Object.entries(contract.properties).filter(([name]) => !["text", "label", "tone"].includes(name)).map(([name, field]) => <label key={name} className="block space-y-1 text-xs">{name}<PropertyEditor field={{ key: name, label: `Element ${name}`, type: field.type === "boolean" ? "boolean" : field.enum ? "select" : "text", options: field.enum }} value={(selected as unknown as Record<string, unknown>)[name] ?? selected.properties?.[name] ?? field.default} readOnly={readOnly} onCommit={value => patch(["disabled", "loading", "value"].includes(name) ? { [name]: value } : { properties: { ...selected.properties, [name]: value as string | boolean } }, true)} /></label>)}
    {selected.key !== surface.frame.root.key && <label className="block space-y-1 text-xs">Move to parent<NativeSelect aria-label="Move element to parent" disabled={readOnly} value="" onChange={event => { if (event.target.value) commit(() => moveSurfaceNode(surface, selected.key, event.target.value)); }}><option value="">Choose container…</option>{[...nodes.values()].filter(node => node.key !== selected.key && semanticElements.get(node.type)?.children.max).map(node => <option key={node.key} value={node.key}>{node.label || node.key}</option>)}</NativeSelect></label>}
    <label className="block space-y-1 text-xs">Tone<NativeSelect disabled={readOnly} value={selected.tone ?? "default"} onChange={event => patch({ tone: event.target.value as UiNode["tone"] })}>{["default", "muted", "accent", "danger"].map(tone => <option key={tone}>{tone}</option>)}</NativeSelect></label>
    <details><summary className="cursor-pointer text-xs font-medium">Controller bindings</summary><div className="mt-2 space-y-2 text-xs text-fg-3">
      <p>{surface.controller} controller · inputs are text/boolean; events invoke named actions. Capability wiring and script execution keep their existing scopes.</p>
      <dl>{Object.entries(CONTROLLER_INPUTS[surface.controller] ?? {}).map(([name, type]) => <div key={name} className="flex justify-between gap-2"><dt>{name}</dt><dd>{type}</dd></div>)}</dl>
      <PropertyEditor key={selected.key} field={{ key: "bindings", label: "Element bindings", type: "json", maxLength: 8192 }} value={surface.bindings.filter(binding => binding.key === selected.key)} readOnly={readOnly} onCommit={value => commit(() => authoredSurfaceSchema.parse({ ...surface, bindings: [...surface.bindings.filter(binding => binding.key !== selected.key), ...(value as object[])] }), true)} />
      {contract.events.includes("activate") && <label className="block">Action → void<NativeSelect aria-label="Controller action" disabled={readOnly} value={surface.actions[selected.key] ?? ""} onChange={event => commit(() => { const actions = { ...surface.actions }; if (event.target.value) actions[selected.key] = event.target.value as "activate" | "locate"; else delete actions[selected.key]; return authoredSurfaceSchema.parse({ ...surface, actions }); })}><option value="">No action</option>{["weather", "action-button"].includes(surface.controller) && <option value={surface.controller === "weather" ? "locate" : "activate"}>{surface.controller === "weather" ? "locate · browser location + forecast network" : "activate · configured command / scoped script"}</option>}</NativeSelect></label>}
    </div></details>
    <details><summary className="cursor-pointer text-xs font-medium">Full definition source</summary><PropertyEditor field={{ key: "surface", label: "Semantic surface source", type: "json", maxLength: 262144 }} value={surface} readOnly={readOnly} onCommit={value => commit(() => authoredSurfaceSchema.parse(value), true)} /></details>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    <Button size="sm" variant="ghost" disabled={readOnly || selected.key === surface.frame.root.key || surface.bindings.some(binding => binding.key === selected.key) || !!surface.actions[selected.key]} onClick={() => commit(() => { const remove = (node: UiNode): UiNode => ({ ...node, children: node.children?.filter(child => child.key !== selected.key).map(remove) }); const next = authoredSurfaceSchema.parse({ ...surface, frame: { ...surface.frame, root: remove(surface.frame.root) } }); select(surface.frame.root.key); return next; })}>Remove unbound element</Button>
  </div>}><div inert><PortableSurface preview frame={surface.frame} onEvent={() => {}} /></div></EditorWorkbench>;
}

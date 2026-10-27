import { ShellBackgroundControl } from "./shell-background-control";
import { useId, useState } from "react";
import {
  BUILTIN_WIDGET_DEFINITIONS,
  embedWidgetRecipe,
  type WidgetRecipe,
  type WidgetSeed,
  type WidgetDefaults,
} from "../../../core/widget-definitions";
import { WIDGET_IDS, type WidgetId } from "../../../core/panel-layout";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettledInput } from "../ui/settled-input";
import { NativeSelect } from "../ui/native-select";
import { WidgetPreview } from "./widget-preview";
import { TreeView, type TreeNode } from "../ui/tree-view";
import { parseWidgetDefinitionDrag } from "../../lib/widget-definition-drag";

const dragType = "application/x-station-widget-default";
const shellKinds = ["app-shell", "desktop-shell"];
const shellSlots = ["Sidebar", "Main surface", "Bottom dock", "Dashboard"];
const layoutKinds = ["widget-list", "stack", "web-browser", "main-surface", ...shellKinds];
function nodeAt(root: WidgetSeed, path: number[]): WidgetSeed | undefined {
  let node: WidgetSeed | undefined = root;
  for (let i = 0; i < path.length; i += 2)
    node = node?.slots?.[path[i]]?.[path[i + 1]];
  return node;
}
/** Visual source editor. Callers commit against their current asset revision;
 * previews are inert and drag payloads only select known trusted widget types. */
export function WidgetVisualEditor({
  recipe,
  readOnly = false,
  onChange,
  authored = [],
}: {
  authored?: { id: string; seed: WidgetRecipe }[];
  recipe: WidgetRecipe;
  readOnly?: boolean;
  onChange: (change: (current: WidgetRecipe) => WidgetRecipe) => void;
}) {
  const referenceScope = useId();
  const available = [
    ...WIDGET_IDS.filter(
      (widget) => !["app-shell", "desktop-shell"].includes(widget),
    ).map((widget) => ({
      id: `builtin:${widget}`,
      title: BUILTIN_WIDGET_DEFINITIONS[widget].title,
      seed: { widget } as WidgetSeed,
    })),
    ...authored
      .filter(
        (item) => !["app-shell", "desktop-shell"].includes(item.seed.widget),
      )
      .map((item) => ({
        id: item.id,
        title: item.seed.title,
        seed: item.seed,
      })),
  ];
  const [query, setQuery] = useState("");
  const [previewWidth, setPreviewWidth] = useState("fill");
  const [path, setPath] = useState<number[]>([]);
  const [slotTarget, setSlotTarget] = useState<{
    path: number[];
    index: number;
  } | null>(null);
  const [error, setError] = useState("");
  const selected = nodeAt(recipe, path) ?? recipe;
  const selectedPath = nodeAt(recipe, path) ? path : [];
  const edit = (action: (root: WidgetRecipe) => void) => {
    if (readOnly) return;
    try {
      onChange((current) => {
        const next = structuredClone(current);
        action(next);
        return next;
      });
      setError("");
    } catch (reason) {
      setError(String(reason));
    }
  };
  const defaults = (value: Partial<WidgetDefaults>) =>
    edit((root) => {
      const node = nodeAt(root, selectedPath);
      if (node) node.defaults = { ...node.defaults, ...value };
    });
  const add = (
    widget: WidgetId,
    ownerPath = selectedPath,
    slotIndex = 0,
    from?: number[],
    definitionId?: string,
  ) =>
    edit((root) => {
      const owner = nodeAt(root, ownerPath);
      if (!owner || !layoutKinds.includes(owner.widget))
        throw new Error("Select a Layout to add children");
      if (from && ownerPath.slice(0, from.length).join(".") === from.join("."))
        throw new Error("A widget cannot contain itself");
      const definition =
        definitionId && available.find((item) => item.id === definitionId);
      const seed = from
        ? nodeAt(root, from)
        : definition
          ? embedWidgetRecipe({ version: 1, title: definition.title, description: "", defaults: {}, ...definition.seed })
          : {
              widget,
              defaults: {},
              ...(layoutKinds.includes(widget) ? { slots: [[]] } : {}),
            };
      if (!seed) throw new Error("The dragged widget changed; try again");
      if (from && seed.widget !== widget) throw new Error("The dragged widget changed; try again");
      if (from)
        nodeAt(root, from.slice(0, -2))?.slots?.[from.at(-2)!]?.splice(
          from.at(-1)!,
          1,
        );
      owner.slots ??= shellKinds.includes(owner.widget)
        ? [[], [], [], []]
        : [[]];
      owner.slots[slotIndex] ??= [];
      owner.slots[slotIndex].push(seed);
    });
  const render = (
    node: WidgetSeed,
    currentPath: number[],
    depth = 0,
  ): import("react").ReactNode => (
    <div
      key={currentPath.join(".")}
      className="station-definition-node"
      data-selected={
        selectedPath.join(".") === currentPath.join(".") || undefined
      }
    >
      <button
        type="button"
        draggable={!readOnly && !!currentPath.length}
        aria-pressed={selectedPath.join(".") === currentPath.join(".")}
        className="station-definition-node-select"
        onClick={() => setPath(currentPath)}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData(
            dragType,
            JSON.stringify({ widget: node.widget, path: currentPath, scope: referenceScope }),
          );
        }}
      >
        <WidgetPreview seed={{ ...node, slots: undefined }} small={depth > 0} />
        <span className="sr-only">
          Select{" "}
          {node.defaults?.displayName ||
            BUILTIN_WIDGET_DEFINITIONS[node.widget].title}
        </span>
      </button>
      {layoutKinds.includes(node.widget) && (
        <div className="station-definition-slots">
          {(node.slots?.length
            ? node.slots
            : shellKinds.includes(node.widget)
              ? [[], [], [], []]
              : [[]]
          ).map((slot, index) => (
            <section
              key={index}
              className="station-definition-slot"
              aria-label={
                shellKinds.includes(node.widget)
                  ? shellSlots[index]
                  : `Slot ${index + 1}`
              }
              onDragOver={(event) => {
                if (!readOnly && event.dataTransfer.types.includes(dragType)) {
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (readOnly) return;
                try {
                  const data = parseWidgetDefinitionDrag(event.dataTransfer.getData(dragType), referenceScope);
                  add(
                    data.widget,
                    currentPath,
                    index,
                    data.path,
                    data.definitionId,
                  );
                } catch (reason) {
                  setError(String(reason));
                }
              }}
            >
              <button
                type="button"
                className="rounded px-1 py-0.5 text-left text-xs text-fg-3 hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                aria-label={`Select ${shellKinds.includes(node.widget) ? shellSlots[index] : `slot ${index + 1}`} for new widgets`}
                aria-pressed={
                  slotTarget?.path.join(".") === currentPath.join(".") &&
                  slotTarget.index === index
                }
                onClick={() => {
                  setPath(currentPath);
                  setSlotTarget({ path: currentPath, index });
                }}
              >
                {shellKinds.includes(node.widget)
                  ? shellSlots[index]
                  : `Slot ${index + 1}`}
              </button>
              {slot.map((child, childIndex) =>
                render(child, [...currentPath, index, childIndex], depth + 1),
              )}
              {!slot.length && (
                <span className="text-xs text-fg-3">Drop a widget here</span>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="station-widget-visual-editor">
      <aside className="station-widget-palette" aria-label="Available widgets">
        <h3 className="text-sm font-medium">Hierarchy</h3>
        <TreeView aria-label="Widget composition hierarchy" items={(() => {
          const tree = (node: WidgetSeed, path: number[]): TreeNode => ({ id: path.join(".") || "root", label: node.defaults?.displayName || BUILTIN_WIDGET_DEFINITIONS[node.widget].title, children: node.slots?.flatMap((slot, index) => slot.map((child, childIndex) => tree(child, [...path, index, childIndex]))) });
          return [tree(recipe, [])];
        })()} defaultExpanded={["root"]} selected={[selectedPath.join(".") || "root"]} onSelectedChange={keys => { if (keys[0]) setPath(keys[0] === "root" ? [] : keys[0].split(".").map(Number)); }} />
        <h3 className="text-sm font-medium">Add widgets</h3>
        <Input
          type="search"
          aria-label="Search available widgets"
          placeholder="Find a widget…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="text-xs text-fg-3">
          Drag into a slot, or select a Layout and click a widget.
        </p>
        {available
          .filter((item) =>
            `${item.title} ${BUILTIN_WIDGET_DEFINITIONS[item.seed.widget].description}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={readOnly}
              draggable={!readOnly}
              className="station-widget-palette-item"
              onClick={() =>
                add(
                  item.seed.widget,
                  selectedPath,
                  slotTarget?.path.join(".") === selectedPath.join(".")
                    ? slotTarget.index
                    : 0,
                  undefined,
                  item.id,
                )
              }
              onDragStart={(event) =>
                event.dataTransfer.setData(
                  dragType,
                  JSON.stringify({
                    widget: item.seed.widget,
                    definitionId: item.id,
                  }),
                )
              }
            >
              <WidgetPreview seed={item.seed} small />
              <span className="text-xs font-medium">{item.title}</span>
            </button>
          ))}
      </aside>
      <div className="station-definition-canvas" aria-label="Widget preview">
        <div role="group" aria-label="Preview width" className="mb-3 flex flex-wrap gap-1">{["375", "768", "fill"].map(width => <Button key={width} size="sm" variant={previewWidth === width ? "secondary" : "ghost"} onClick={() => setPreviewWidth(width)}>{width === "fill" ? "Fit" : `${width}px`}</Button>)}</div>
        <div className="mx-auto max-w-full" style={{ width: previewWidth === "fill" ? "100%" : `${previewWidth}px` }}>{render(recipe, [])}</div>
      </div>
      <aside
        className="station-definition-properties"
        aria-label="Selected widget defaults"
      >
        <strong className="text-sm">
          {selectedPath.length ? "Child defaults" : "Definition defaults"}
        </strong>
        <label className="space-y-1 text-xs">Definition key<SettledInput label="Definition key" value={selected.key ?? ""} validate={value => value && !/^[\w-]{1,80}$/.test(value) ? "Use letters, numbers, underscore or dash" : undefined} disabled={readOnly} onCommit={value => edit(root => { const node = nodeAt(root, selectedPath); if (!node) return; const before = node.key; node.key = value || undefined; const update = (n: WidgetSeed) => { if (before && n.targetRef?.key === before) n.targetRef = value ? { ...n.targetRef, key: value } : undefined; n.slots?.flat().forEach(update); }; update(root); })} /></label>
        {selected.widget === "navigation" && <div className="space-y-2" onDragOver={e => { if (!readOnly && e.dataTransfer.types.includes(dragType)) { e.preventDefault(); e.stopPropagation(); } }} onDrop={e => { e.preventDefault(); e.stopPropagation(); try { const data = JSON.parse(e.dataTransfer.getData(dragType)); if (data.scope !== referenceScope || !Array.isArray(data.path)) throw new Error("Drop a Layout from this definition"); edit(root => { const target = nodeAt(root, data.path), node = nodeAt(root, selectedPath); if (!target || !node || !layoutKinds.includes(target.widget)) throw new Error("Choose a Layout target"); target.key ??= `target_${crypto.randomUUID().slice(0,8)}`; node.targetRef = { key: target.key }; }); } catch (e) { setError(String(e)); } }}>
          <label className="space-y-1 text-xs">Target Layout<NativeSelect aria-label="Definition target Layout" disabled={readOnly} value={selected.targetRef?.key ?? ""} onChange={e => edit(root => { const node = nodeAt(root, selectedPath); if (node) node.targetRef = e.target.value ? { key: e.target.value } : undefined; })}><option value="">Desk main slot</option>{(() => { const choices: WidgetSeed[] = []; const visit = (node: WidgetSeed) => { if (node.key && layoutKinds.includes(node.widget)) choices.push(node); node.slots?.flat().forEach(visit); }; visit(recipe); return choices.map(n => <option key={n.key} value={n.key}>{n.defaults?.displayName || n.key}</option>); })()}</NativeSelect></label>
          {selected.targetRef && <label className="space-y-1 text-xs">Target slot<NativeSelect aria-label="Definition target slot" disabled={readOnly} value={selected.targetRef.slot ?? 0} onChange={e => edit(root => { const node = nodeAt(root, selectedPath); if (node?.targetRef) node.targetRef.slot = Number(e.target.value); })}>{Array.from({ length: 32 }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}</NativeSelect></label>}
          <p className="text-xs text-fg-3">Drop a Layout here, or give it a definition key and choose it. Spawning resolves this key within the new instance tree.</p>
        </div>}
        <span className="text-xs text-fg-3">Display name</span>
        <SettledInput
          label="Display name"
          value={selected.defaults?.displayName ?? ""}
          validate={(value) =>
            value.length > 120 ? "Use at most 120 characters" : undefined
          }
          disabled={readOnly}
          onCommit={(displayName) => defaults({ displayName })}
        />
        <label className="flex gap-2 text-xs">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={selected.defaults?.hideDisplayName ?? false}
            onChange={(event) =>
              defaults({ hideDisplayName: event.target.checked })
            }
          />
          Hide display name
        </label>
        <label className="flex gap-2 text-xs">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={selected.defaults?.flippable ?? false}
            onChange={(event) => defaults({ flippable: event.target.checked })}
          />
          Allow flipping
        </label>
        <label className="space-y-1 text-xs">
          Chrome
          <NativeSelect
            disabled={readOnly}
            value={selected.defaults?.chrome ?? "default"}
            onChange={(event) =>
              defaults({
                chrome: event.target.value as WidgetDefaults["chrome"],
              })
            }
          >
            <option value="default">Standard</option>
            <option value="compact">Compact</option>
            <option value="seamless">Seamless</option>
          </NativeSelect>
        </label>
        {layoutKinds.includes(selected.widget) && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={
                readOnly ||
                (shellKinds.includes(selected.widget) &&
                  (selected.slots?.length ?? 4) >= 4)
              }
              onClick={() =>
                edit((root) => {
                  const node = nodeAt(root, selectedPath);
                  if (node) {
                    node.slots ??= [[]];
                    node.slots.push([]);
                  }
                })
              }
            >
              Add slot
            </Button>
            {!shellKinds.includes(selected.widget) && (
              <label className="space-y-1 text-xs">
                Child presentation
                <NativeSelect
                  disabled={readOnly}
                  value={selected.defaults?.stackMode ?? "tabs"}
                  onChange={(event) =>
                    defaults({
                      stackMode: event.target
                        .value as WidgetDefaults["stackMode"],
                    })
                  }
                >
                  <option value="tabs">Tabs</option>
                  <option value="sidebar">Vertical tabs</option>
                  <option value="carousel">Carousel</option>
                </NativeSelect>
              </label>
            )}
          </>
        )}
        {["app-shell", "desktop-shell"].includes(selected.widget) && (
          <ShellBackgroundControl
            value={selected.defaults?.background}
            disabled={readOnly}
            onChange={(background) => defaults({ background: background || undefined })}
          />
        )}
        {!!selectedPath.length && (
          <Button
            size="sm"
            variant="ghost"
            disabled={readOnly}
            onClick={() => {
              edit((root) => {
                nodeAt(root, selectedPath.slice(0, -2))?.slots?.[
                  selectedPath.at(-2)!
                ]?.splice(selectedPath.at(-1)!, 1);
              });
              setPath([]);
            }}
          >
            Remove child
          </Button>
        )}
        <p className="text-xs text-fg-3">
          Previews are inert. New instances receive fresh children and their own
          permissions.
        </p>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </aside>
    </div>
  );
}

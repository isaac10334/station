import { ShellDefinitionField } from "./shell-definition-field";
import { SlotSettings } from "./slot-settings";
import { ShellBackgroundControl } from "./shell-background-control";
import { ActionButtonSettings } from "./action-button";
import { ProgramAuthor } from "./program-author";
import { WidgetTargetPicker } from "./widget-target-picker";
import { NativeSelect } from "../ui/native-select";
import { useState, type ReactNode } from "react";
import {
  AlignHorizontalJustifyCenter,
  Columns2,
  Rows2,
  LayoutGrid,
  PanelLeft,
  PanelBottom,
  ExternalLink,
  Maximize2,
  Eye,
  EyeOff,
  PanelTop,
  Minus,
  Scan,
  Plus,
  FlipHorizontal2,
} from "lucide-react";
import {
  dropReason,
  isLayoutPanel,
  panelSlot,
  panelSurface,
  type Surface,
  type Command,
} from "../../../core/docking";
import type {
  StackMode,
  WidgetChrome,
  WidgetId,
  WidgetTone,
} from "../../../core/panel-layout";
import { useDockController } from "../../docking/react";
import { SettledInput } from "../ui/settled-input";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { IconAction } from "../ui/icon-action";
import { Button } from "../ui/button";
import { WidgetDefinitionPicker } from "./widget-definition-picker";
import { WIDGET_CATALOG } from "../../widget-catalog";
import { WidgetRemovalActions } from "./widget-removal-actions";

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-fg-3">{label}</span>
      {children}
    </div>
  );
}

/** One controls surface for the flip side, widget popover, and selected-widget inspector.

 * All writes use dock commands; opening this view never grants or starts a service.

 */

export function WidgetSettings(props: {
  panelId: string;
  onFlip?: () => void;
  onDismiss?: () => void;
  onOpenSource?: () => void;
}) {
  const { layout, panelTitle, selectWidget } = useDockController();
  const [target, setTarget] = useState(props.panelId),
    [slotId, setSlotId] = useState<string>();
  const panel = layout.panels[target],
    slot = panelSlot(layout, target);
  const parent = slot?.target.ownerId ?? panel?.ownerId ?? (layout.rootId !== target ? layout.rootId : undefined);
  const inspect = (id: string) => {
    setTarget(id);
    setSlotId(undefined);
    selectWidget(id);
  };
  return (
    <div className="space-y-3">
      <nav
        aria-label="Widget location"
        className="flex flex-wrap items-center gap-1 border-b border-line pb-2"
      >
        {parent && (
          <Button size="sm" variant="ghost" onClick={() => inspect(parent)}>
            ↑ {panelTitle(layout.panels[parent])}
          </Button>
        )}
        {slot && (
          <Button
            size="sm"
            variant={slotId ? "secondary" : "ghost"}
            onClick={() => setSlotId(slot.node.id)}
          >
            Slot
          </Button>
        )}
        <Button
          size="sm"
          variant={!slotId ? "secondary" : "ghost"}
          onClick={() => setSlotId(undefined)}
        >
          {panel ? panelTitle(panel) : "Widget"}
        </Button>
      </nav>
      {slotId ? (
        <SlotSettings nodeId={slotId} onInspectWidget={inspect} />
      ) : (
        <WidgetSettingsContent key={target} {...props} panelId={target} />
      )}
    </div>
  );
}

function WidgetSettingsContent({
  panelId,
  onFlip,
  onOpenSource,
  onDismiss,
}: {
  panelId: string;

  onFlip?: () => void;

  onDismiss?: () => void;

  onOpenSource?: () => void;
}) {
  const {
    layout,
    command: dispatch,
    panelTitle,
    focusPanel,
    openCatalog,
    policy,
    definitions,
    definitionSources,
    onOpenDefinition,
    onForkDefinition,
  } = useDockController();

  const [error, setError] = useState("");

  const command = (action: Command) => {
    const result = dispatch(action);

    setError(result.ok ? "" : result.reason);

    return result;
  };

  const panel = layout.panels[panelId];

  if (!panel) return null;
  if (["home", "navigation", "browser"].includes(panel.kind))
    return (
      <section className="space-y-2 text-xs">
        <p className="text-fg-3">
          Protected shell widget. Its identity and lifecycle are managed by the
          desk.
        </p>
        <dl className="grid grid-cols-2 gap-2">
          <dt>Widget</dt>
          <dd>{panelTitle(panel)}</dd>
          <dt>Type</dt>
          <dd>{panel.kind}</dd>
          <dt>Configuration</dt>
          <dd>Read only</dd>
        </dl>
      </section>
    );

  if (panel.id === layout.rootId && panel.kind === "widget")
    return (
      <div className="space-y-3" data-widget-settings={panel.id}>
        {definitionSources && <ShellDefinitionField workspace={{ id: definitionSources.workspaceId, assets: definitionSources.assets }} definitionId={panel.definitionId ?? `builtin:${panel.widget}`} label="Root layout widget" onChange={selection => { const result = command(selection); if (!result.ok) throw new Error(result.reason); }} onOpen={onOpenDefinition} />}

        <ShellBackgroundControl
          value={panel.background}
          onChange={(background) => {
            command({ type: "configureShell", background });
          }}
        />

        {onOpenDefinition && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onOpenDefinition(panel.definitionId ?? `builtin:${panel.widget}`)
            }
          >
            Open definition
          </Button>
        )}

        {onForkDefinition && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onForkDefinition(panel.definitionId ?? `builtin:${panel.widget}`)
            }
          >
            Fork definition
          </Button>
        )}

        <p className="text-xs text-fg-3">
          This is the desk root. Its named surfaces and windows share the same
          widget graph.
        </p>
      </div>
    );

  const slot = panelSlot(layout, panelId);

  const surface = panelSurface(layout, panelId);

  const placement = layout.floating[panelId]
    ? layout.floating[panelId].presentation === "peek"
      ? "peek"
      : "float"
    : slot?.target.ownerId
      ? null
      : surface;

  const configure = (value: {
    contentSizing?: "fill" | "scroll" | "clip";
    displayName?: string;
    hideDisplayName?: boolean;
    chrome?: WidgetChrome;
    flippable?: boolean;
  }) => {
    const result = command({ type: "configurePanel", panelId, ...value });

    if (!result.ok) throw new Error(result.reason);
  };

  const definition = definitions?.find(
    (item) =>
      item.id ===
      (panel.kind === "widget"
        ? (panel.definitionId ?? `builtin:${panel.widget}`)
        : panel.kind === "web-widget"
          ? `web:${panel.assetId}`
          : panel.definitionId),
  );

  const compatible =
    definitions?.filter(
      (item) =>
        item.create?.kind === "widget" &&
        panel.kind === "widget" &&
        item.create.widget === panel.widget,
    ) ?? [];

  const layoutPanel = isLayoutPanel(panel);

  const framed = panel.kind === "widget" || panel.kind === "web-widget";

  return (
    <div className="flex min-w-0 flex-col gap-3" data-widget-settings={panelId}>
      {panel.kind === "widget" && panel.widget === "action-button" && (
        <ActionButtonSettings panel={panel} />
      )}

      {panel.kind === "widget" && panel.widget === "program" && (
        <Button size="sm" variant="outline" onClick={() => { onDismiss?.(); focusPanel(panel.id); }}>Open program editor</Button>
      )}

      {panel.kind === "widget" &&
        ["navigation", "widget-list"].includes(panel.widget) && (
          <div className="space-y-2">
            <span className="text-xs font-medium">Target slot</span>
            <WidgetTargetPicker
              layout={layout}
              value={panel.targetRef}
              onChange={(reference) => {
                const r = command({
                  type: "setWidgetTarget",
                  panelId,
                  reference,
                });
                if (!r.ok) throw new Error(r.reason);
              }}
            />
            <p className="text-xs text-fg-3">
              A live slot reference. Drag a slot target here or choose one; this
              does not reference a definition asset.
            </p>
          </div>
        )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-fg-2">Display name</span>

          {framed && (
            <ToggleGroup
              size="sm"
              value={[panel.hideDisplayName ? "hidden" : "shown"]}
              required
              onValueChange={(value) =>
                configure({ hideDisplayName: value[0] === "hidden" })
              }
              aria-label="Display name visibility"
            >
              <ToggleGroupItem value="shown" label="Show display name">
                <Eye />
              </ToggleGroupItem>

              <ToggleGroupItem value="hidden" label="Hide display name">
                <EyeOff />
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        <SettledInput
          label="Display name"
          value={panelTitle(panel)}
          validate={(value) =>
            value.trim().length > 120
              ? "Use at most 120 characters."
              : undefined
          }
          onCommit={(displayName) => configure({ displayName })}
        />

        <p className="text-[11px] text-fg-3">
          Empty uses the original widget name.
        </p>
      </div>

      {framed && <SettingRow label="Content sizing"><NativeSelect compact aria-label="Widget content sizing" value={panel.contentSizing ?? "fill"} onChange={event => configure({ contentSizing: event.target.value as "fill" | "scroll" | "clip" })}><option value="fill">Grow to fill slot</option><option value="scroll">Natural size · scroll overflow</option><option value="clip">Constrain · clip overflow</option></NativeSelect></SettingRow>}
      {framed && (
        <SettingRow label="Chrome">
          <ToggleGroup
            size="md"
            value={[panel.chrome ?? "default"]}
            required
            aria-label="Widget chrome"
            onValueChange={(value) =>
              configure({ chrome: value[0] as WidgetChrome })
            }
          >
            <ToggleGroupItem value="default" label="Standard header">
              <PanelTop />
            </ToggleGroupItem>

            <ToggleGroupItem value="compact" label="Compact header">
              <Minus />
            </ToggleGroupItem>

            <ToggleGroupItem
              value="seamless"
              label="Seamless · controls on hover"
            >
              <Scan />
            </ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>
      )}

      {framed && (
        <label className="flex items-center justify-between gap-2 text-xs text-fg-3">
          Allow flipping to settings
          <input
            type="checkbox"
            checked={panel.flippable ?? false}
            onChange={(event) => configure({ flippable: event.target.checked })}
          />
        </label>
      )}

      {panel.kind === "widget" && (
        <SettingRow label="Tint">
          <ToggleGroup
            size="md"
            value={[panel.tone ?? "slate"]}
            required
            aria-label="Widget tint"
            onValueChange={(value) =>
              command({
                type: "configureWidget",
                panelId,
                tone: value[0] as WidgetTone,
              })
            }
          >
            {(["slate", "blue", "violet", "coral", "mint"] as const).map(
              (tone) => (
                <ToggleGroupItem value={tone} key={tone} label={`${tone} tint`}>
                  <span
                    aria-hidden
                    className={`widget-swatch-${tone} size-3.5 rounded-full bg-(--swatch)`}
                  />
                </ToggleGroupItem>
              ),
            )}
          </ToggleGroup>
        </SettingRow>
      )}

      {layoutPanel && (
        <>
          <SettingRow label="Arrangement">
            <ToggleGroup
              value={[
                layout.containers[panelId]?.kind === "grid" ? "rows" : "split",
              ]}
              required
              size="md"
              aria-label="Layout arrangement"
              onValueChange={(value) =>
                command({
                  type: "setLayoutArrangement",
                  panelId,
                  arrangement: value[0] as "rows" | "split",
                })
              }
            >
              <ToggleGroupItem value="split" label="Split slots">
                <Columns2 />
              </ToggleGroupItem>
              <ToggleGroupItem value="rows" label="Resizable row grid">
                <Rows2 />
              </ToggleGroupItem>
            </ToggleGroup>
          </SettingRow>

          <SettingRow label="Presentation">
            <ToggleGroup
              size="md"
              value={[panel.stackMode ?? "tabs"]}
              required
              aria-label="Child presentation"
              onValueChange={(value) =>
                command({
                  type: "configureWidget",
                  panelId,
                  stackMode: value[0] as StackMode,
                })
              }
            >
              <ToggleGroupItem value="tabs" label="Tabs">
                <PanelTop />
              </ToggleGroupItem>

              <ToggleGroupItem value="sidebar" label="Vertical tabs">
                <PanelLeft />
              </ToggleGroupItem>

              <ToggleGroupItem value="carousel" label="Horizontal carousel">
                <AlignHorizontalJustifyCenter />
              </ToggleGroupItem>
            </ToggleGroup>
          </SettingRow>

          <label className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-3">
            New children
            <WidgetDefinitionPicker
              label="Default child widget"
              value={panel.childWidget ? `builtin:${panel.childWidget}` : ""}
              emptyLabel="Choose each time"

              items={Object.entries(WIDGET_CATALOG)
                .filter(([id]) => !["app-shell", "desktop-shell"].includes(id))
                .map(([id, item]) => ({
                  ...item,
                  id: `builtin:${id}`,
                  provider: "builtin",
                  renderer: item.renderer,
                }))}

              onValueChange={(id) =>
                command({
                  type: "configureWidget",
                  panelId,
                  childWidget: id ? (id.slice(8) as WidgetId) : null,
                })
              }
            />
          </label>

          <SettingRow label="Contents">
            <div className="flex gap-1">
              <IconAction
                className="size-7"
                label="Add child widget"
                onClick={() =>
                  openCatalog({
                    surface: surface ?? "dashboard",
                    ownerId: panelId,
                    intent: "tab",
                  })
                }
              >
                <Plus size={14} />
              </IconAction>

              <IconAction
                className="size-7"
                label="Add empty slot"
                onClick={() =>
                  command({
                    type: "addSlot",
                    surface: surface ?? "dashboard",
                    ownerId: panelId,
                  })
                }
              >
                <LayoutGrid size={14} />
              </IconAction>
            </div>
          </SettingRow>
        </>
      )}

      {!panel.ownerId && (
        <SettingRow label={slot?.target.ownerId ? "Move out to" : "Placement"}>
          <ToggleGroup
            size="md"
            value={placement ? [placement] : []}
            required
            aria-label="Widget placement"
            onValueChange={(value) => {
              const next = value[0];

              if (next === placement) return;

              if (next === "peek")
                command({
                  type: "presentPanel",
                  panelId,
                  mode: "peek",
                  edge: "right",
                });
              else if (next === "float")
                command({ type: "presentPanel", panelId, mode: "window" });
              else
                command({
                  type: layout.floating[panelId] ? "dockFloat" : "move",
                  panelId,
                  target: { surface: next as Surface, intent: "append" },
                });
            }}
          >
            <ToggleGroupItem
              value="main"
              label="Main surface"
              disabled={
                !!dropReason(
                  layout,
                  panel,
                  { surface: "main", intent: "append" },
                  policy,
                )
              }
            >
              <PanelTop />
            </ToggleGroupItem>

            <ToggleGroupItem
              value="dashboard"
              label="Dashboard"
              disabled={
                !!dropReason(
                  layout,
                  panel,
                  { surface: "dashboard", intent: "append" },
                  policy,
                )
              }
            >
              <LayoutGrid />
            </ToggleGroupItem>

            <ToggleGroupItem
              value="sidebar"
              label="Sidebar"
              disabled={
                !!dropReason(
                  layout,
                  panel,
                  { surface: "sidebar", intent: "append" },
                  policy,
                )
              }
            >
              <PanelLeft />
            </ToggleGroupItem>

            <ToggleGroupItem
              value="bottom"
              label="Bottom dock"
              disabled={
                !!dropReason(
                  layout,
                  panel,
                  { surface: "bottom", intent: "append" },
                  policy,
                )
              }
            >
              <PanelBottom />
            </ToggleGroupItem>

            <ToggleGroupItem value="float" label="Floating window">
              <ExternalLink />
            </ToggleGroupItem>

            <ToggleGroupItem value="peek" label="Side peek">
              <PanelLeft />
            </ToggleGroupItem>
          </ToggleGroup>
        </SettingRow>
      )}

      {!panel.ownerId && (
        <SettingRow label="Open as">
          <NativeSelect
            aria-label="Panel presentation"
            value={
              layout.floating[panelId]?.presentation === "peek"
                ? (layout.floating[panelId].edge ?? "right")
                : ""
            }
            onChange={(event) => {
              const edge = event.target.value;
              if (edge)
                command({
                  type: "presentPanel",
                  panelId,
                  mode: "peek",
                  edge: edge as "top" | "bottom" | "left" | "right",
                });
            }}
          >
            <option value="">Choose side peek...</option>
            <option value="right">Right side peek</option>
            <option value="left">Left side peek</option>
            <option value="bottom">Bottom peek</option>
            <option value="top">Top peek</option>
          </NativeSelect>

          {layout.floating[panelId]?.presentation === "peek" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                command({
                  type: "peekVisibility",
                  panelId,
                  hidden: !layout.floating[panelId].hidden,
                })
              }
            >
              {layout.floating[panelId].hidden ? "Show peek" : "Hide peek"}
            </Button>
          )}
        </SettingRow>
      )}

      {panel.definitionSnapshot && onForkDefinition && <Button size="sm" variant="ghost" onClick={() => onForkDefinition(panel.definitionSnapshot!.assetId)}>Fork or recover snapshot source</Button>}
      {definition?.assetId && (
        <div className="space-y-2 border-t border-line-2 pt-2">
          {panel.kind === "widget" && <div className="space-y-2 text-xs text-fg-3">
            <p>{panel.definitionSnapshot ? `Definition revision ${panel.definitionSnapshot.revision} · instance overrides retained` : "Legacy instance · review defaults before updating"}</p>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="outline" onClick={() => command({ type: "setWidgetDefinition", panelId, widget: panel.widget, definitionId: panel.definitionId ?? definition.id, reconciliation: "preserve" })}>Update from definition</Button>
              <Button size="sm" variant="ghost" onClick={() => command({ type: "setWidgetDefinition", panelId, widget: panel.widget, definitionId: panel.definitionId ?? definition.id, reconciliation: "reset" })}>Reset overrides</Button>
            </div>
          </div>}
          <div className="flex flex-wrap gap-1">
            {onOpenDefinition && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onDismiss?.();
                  onOpenDefinition(definition.assetId!);
                }}
              >
                Open definition
              </Button>
            )}

            {onForkDefinition && definition.create?.kind === "widget" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onDismiss?.();
                  onForkDefinition(definition.assetId!);
                }}
              >
                Fork definition
              </Button>
            )}
          </div>

          {panel.kind === "widget" && compatible.length > 1 && (
            <label className="flex flex-col gap-1 text-xs text-fg-3">
              Compatible definition
              <WidgetDefinitionPicker
                label="Widget definition"
                value={definition.id}
                items={compatible}
                onValueChange={(definitionId) =>
                  command({
                    type: "setWidgetDefinition",
                    panelId,
                    widget: panel.widget,
                    definitionId,
                  })
                }
              />
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-t border-line-2 pt-2">
        {framed && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onDismiss?.();
              command({
                type: "createWidget",
                widget: "widget-editor",
                target: { surface: "main", intent: "tab" },
              });
            }}
          >
            Edit instance
          </Button>
        )}

        {framed && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onDismiss?.();
              focusPanel(panelId);
            }}
          >
            <Maximize2 size={14} />
            Focus widget
          </Button>
        )}

        {onFlip && (
          <Button size="sm" variant="ghost" onClick={onFlip}>
            <FlipHorizontal2 size={14} />
            Flip to settings
          </Button>
        )}

        {onOpenSource && (
          <Button size="sm" variant="ghost" onClick={onOpenSource}>
            Edit source
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <WidgetRemovalActions panelId={panelId} keepChildren={layoutPanel} />

      <span className="sr-only">Settings for {panelTitle(panel)}</span>
    </div>
  );
}

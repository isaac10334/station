import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  validateFrame,
  semanticElements,
  elementProperties,
  type ElementRegistry,
  type UiFrame,
  type UiNode,
  type UiEvent,
} from "@loop-kit/ui";
import { SemanticIcon } from "../../semantic-icons";
import { SemanticThemeContext } from "../../semantic-theme";
import { semanticTokenVariables } from "../../../core/semantic-theme";
import { TreeView } from "../ui/tree-view";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/native-select";
import { ActionTooltip } from "../ui/action-tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";
export type ElementRendererProps = {
  node: UiNode;
  emit: (node: UiNode, type: UiEvent["type"], value?: string | boolean) => void;
};
export type ElementAdapters = Readonly<
  Record<string, ComponentType<ElementRendererProps>>
>;
const AdapterContext = createContext<ElementAdapters>({});
type ButtonAppearance = { variant: "default" | "secondary" | "outline" | "ghost"; fullWidth?: boolean; graphic?: ReactNode; tooltip?: string };
const ButtonAppearanceContext = createContext<ButtonAppearance | undefined>(undefined);
const PreviewContext = createContext(false);
function NodeView(props: ElementRendererProps) {
  const adapters = useContext(AdapterContext),
    Renderer = adapters[props.node.type];
  if (!Renderer) throw new Error(`Missing host renderer: ${props.node.type}`);
  return <Renderer {...props} />;
}
function NativeNodeView({ node, emit }: ElementRendererProps) {
  const appearance = useContext(ButtonAppearanceContext);
  const preview = useContext(PreviewContext);
  const [value, setValue] = useState(node.value ?? "");
  useEffect(() => setValue(node.value ?? ""), [node.value]);
  const children = node.children?.map((child) => (
    <NodeView key={child.key} node={child} emit={emit} />
  ));
  const classes =
    node.tone === "danger"
      ? "text-danger"
      : node.tone === "muted"
        ? "text-fg-3"
        : node.tone === "accent"
          ? "text-accent"
          : "text-fg";
  const icon =
    node.icon &&
    (typeof node.icon === "string"
      ? {
          kind: "symbol" as const,
          name: node.icon,
          ...(node.type === "icon" && node.label
            ? { role: "image" as const, label: node.label }
            : {}),
        }
      : node.icon);
  const glyph = icon ? <SemanticIcon icon={icon} /> : null;
  if (preview && !["row", "column", "grid", "text", "metric", "icon"].includes(node.type))
    return <div className={`min-w-0 rounded border border-line p-2 text-xs ${classes}`}><span>{node.text ?? node.label ?? String(node.value ?? "")}</span>{children}</div>;
  if (node.type === "grid")
    return (
      <div
        role="group"
        aria-label={node.label}
        className={`grid min-w-0 gap-2 ${{ "1": "grid-cols-1", "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" }[String(elementProperties(node).columns) as "1" | "2" | "3" | "4"]}`}
      >
        {children}
      </div>
    );
  if (node.type === "menu")
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={node.disabled || node.loading}
          aria-busy={node.loading || undefined}
          aria-label={node.label}
        >
          {glyph}
          {node.text ?? node.label}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {node.children?.map((child) => (
            <DropdownMenuItem
              key={child.key}
              disabled={
                node.disabled || node.loading || child.disabled || child.loading
              }
              icon={
                child.icon ? (
                  <SemanticIcon
                    icon={
                      typeof child.icon === "string"
                        ? { kind: "symbol", name: child.icon }
                        : child.icon
                    }
                  />
                ) : undefined
              }
              onClick={() => emit(child, "activate")}
            >
              {child.text ?? child.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  if (node.type === "row" || node.type === "column")
    return (
      <div
        className={`flex min-w-0 gap-2 ${node.type === "row" ? "flex-wrap items-center" : "flex-col"} ${classes}`}
      >
        {children}
      </div>
    );
  if (node.type === "button") {
    const button = (
      <Button
        size="sm"
        variant={appearance?.variant ?? "outline"}
        className={appearance?.fullWidth ? "w-full" : undefined}
        aria-label={node.label}
        disabled={node.disabled || node.loading}
        aria-busy={node.loading || undefined}
        onClick={() => emit(node, "activate")}
      >
        {appearance?.graphic ?? glyph}
        {node.text}
        {children}
      </Button>
    );
    return appearance?.tooltip || node.label ? (
      <ActionTooltip label={appearance?.tooltip ?? node.label!}>{button}</ActionTooltip>
    ) : (
      button
    );
  }
  if (node.type === "popover")
    return (
      <Popover
        onOpenChange={(open) => {
          if (open) emit(node, "activate");
        }}
      >
        <PopoverTrigger
          size="sm"
          variant="ghost"
          aria-label={node.label}
          disabled={node.disabled || node.loading}
          aria-busy={node.loading || undefined}
        >
          {glyph}
          {node.text}
        </PopoverTrigger>
        <PopoverContent
          aria-label={node.label}
          className="max-h-96 overflow-auto"
        >
          <div className="flex min-w-0 flex-col gap-3">{children}</div>
        </PopoverContent>
      </Popover>
    );
  if (node.type === "icon") return glyph;
  if (node.type === "input")
    return (
      <label className="flex min-w-0 flex-col gap-1 text-xs">
        {node.label}
        <Input
          aria-label={node.label}
          disabled={node.disabled || node.loading}
          aria-busy={node.loading || undefined}
          value={String(value)}
          onChange={(event) => setValue(event.target.value)}
          onBlur={(event) => {
            if (event.target.value !== String(node.value ?? ""))
              emit(node, "change", event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
    );
  if (node.type === "toggle")
    return (
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!value}
          disabled={node.disabled || node.loading}
          aria-busy={node.loading || undefined}
          onChange={(event) => {
            setValue(event.target.checked);
            emit(node, "change", event.target.checked);
          }}
        />
        {node.label}
      </label>
    );
  if (node.type === "select")
    return (
      <label className="flex flex-col gap-1 text-xs">
        {node.label}
        <NativeSelect
          aria-label={node.label}
          disabled={node.disabled || node.loading}
          aria-busy={node.loading || undefined}
          value={String(value)}
          onChange={(event) => {
            setValue(event.target.value);
            emit(node, "change", event.target.value);
          }}
        >
          {node.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </label>
    );
  if (node.type === "metric")
    return (
      <div className={`portable-surface-metric rounded border border-line p-3 ${classes}`}>
        <span className="text-xs text-fg-3">{node.label}</span>
        <strong className="block text-2xl tabular-nums">{node.text}</strong>
      </div>
    );

  if (node.type === "tree")
    return (
      <TreeView
        aria-label={node.label}
        items={(node.children ?? []).map((child) => ({
          id: child.key,
          label: child.label ?? child.text ?? child.key,
          disabled:
            node.disabled || node.loading || child.disabled || child.loading,
          actions: child.children?.map((item) => (
            <NodeView key={item.key} node={item} emit={emit} />
          )),
        }))}
        selected={typeof node.value === "string" ? [node.value] : []}
        onSelectedChange={(ids) => {
          if (ids[0]) emit(node, "select", ids[0]);
        }}
      />
    );
  if (node.type === "table")
    return (
      <table aria-label={node.label} className="w-full text-sm">
        <tbody>
          {node.children?.map((child) => (
            <tr key={child.key} aria-selected={node.value === child.key}>
              <td>
                <button
                  type="button"
                  disabled={
                    node.disabled ||
                    node.loading ||
                    child.disabled ||
                    child.loading
                  }
                  className="rounded p-1 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => emit(node, "select", child.key)}
                >
                  {child.label ?? child.text ?? child.key}
                </button>
              </td>
              {child.children?.map((item) => (
                <td key={item.key}>
                  <NodeView node={item} emit={emit} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  if (node.type === "list")
    return (
      <div
        role="listbox"
        aria-label={node.label}
        aria-disabled={node.disabled || node.loading}
        aria-busy={node.loading || undefined}
        className="flex flex-col gap-1"
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
            return;
          const options = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "[role=option]:not(:disabled)",
            ),
          );
          const index = options.indexOf(event.target as HTMLButtonElement);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? options.length - 1
                : Math.max(
                    0,
                    Math.min(
                      options.length - 1,
                      index + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  );
          event.preventDefault();
          options[next]?.focus();
        }}
      >
        {node.children?.map((child) => (
          <button
            role="option"
            aria-selected={node.value === child.key}
            disabled={
              node.disabled || node.loading || child.disabled || child.loading
            }
            key={child.key}
            type="button"
            className="rounded p-1 text-left text-sm hover:bg-hover aria-selected:bg-selected focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
            onClick={() => emit(node, "select", child.key)}
          >
            {child.label ?? child.text ?? child.key}
          </button>
        ))}
      </div>
    );

  return (
    <span className={`whitespace-pre-wrap break-words text-sm ${classes}`}>
      {node.text}
      {children}
    </span>
  );
}
/** Host DOM adapter. React keys preserve focus; markup/CSS/placement never come from guests. */
export const stationElementAdapters: ElementAdapters = Object.fromEntries(
  [...semanticElements.keys()].map((id) => [id, NativeNodeView]),
);
export function PortableSurface({
  frame,
  onEvent,
  registry = semanticElements,
  adapters = stationElementAdapters,
  buttonAppearance,
  preview = false,
}: {
  frame: UiFrame;
  onEvent: (event: UiEvent) => void;
  registry?: ElementRegistry;
  adapters?: ElementAdapters;
  buttonAppearance?: ButtonAppearance;
  /** Static noninteractive controls, safe inside catalog buttons. */
  preview?: boolean;
}) {
  const [sequence] = useState(() => ({ value: 0 }));
  const tokens = useContext(SemanticThemeContext);
  const validated = validateFrame(frame, registry);
  return (
    <AdapterContext.Provider value={adapters}><ButtonAppearanceContext.Provider value={buttonAppearance}><PreviewContext.Provider value={preview}>
      <div
        className="min-w-0 p-2"
        data-portable-surface
        data-theme={tokens.mode}
        style={semanticTokenVariables(tokens)}
      >
        <NodeView
          node={validated.root}
          emit={(node, type, value) => {
            if (
              !node.disabled &&
              !node.loading &&
              registry.get(node.type)?.events.includes(type)
            )
              onEvent({
                revision: frame.revision,
                sequence: ++sequence.value,
                key: node.key,
                type,
                ...(value === undefined ? {} : { value }),
              });
          }}
        />
      </div>
    </PreviewContext.Provider></ButtonAppearanceContext.Provider></AdapterContext.Provider>
  );
}

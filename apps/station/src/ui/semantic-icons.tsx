/** Trusted renderer: references resolve through explicit host inputs; no provider code loads. */
import { createContext, useContext, type ComponentType } from "react";
import {
  validateIconRef,
  type IconRef,
  type SemanticTokens,
} from "@loop-kit/ui";
import * as symbols from "@station/ui/icons";
export interface IconResolution {
  readonly sizes?: SemanticTokens["icon"];
  readonly symbols: Readonly<Record<string, string>>;
  readonly asset: (assetId: string, path: string) => string | undefined;
  readonly providers: Readonly<
    Record<string, (name: string) => string | undefined>
  >;
}
const empty: IconResolution = {
  symbols: {},
  asset: () => undefined,
  providers: {},
};
const legacySymbols: Readonly<Record<string, string>> = {
  RefreshCw: "Refresh",
  Settings2: "Settings",
  LayoutGrid: "Home",
  Box: "Folder",
  ListTree: "Sliders",
  PanelLeftOpen: "Sidebar",
  PanelTopOpen: "Columns",
  Undo2: "Undo",
  Redo2: "Redo",
};
export const IconResolutionContext = createContext<IconResolution>(empty);
/** Only host-validated SVG image URLs cross the renderer boundary. */
export function resolveIcon(
  ref: IconRef,
  inputs: IconResolution,
):
  | { kind: "symbol"; name: string }
  | { kind: "image"; url: string }
  | { kind: "missing" } {
  validateIconRef(ref);
  const name =
    ref.kind === "symbol" ? (legacySymbols[ref.name] ?? ref.name) : "";
  const url =
    ref.kind === "symbol"
      ? inputs.symbols[name]
      : ref.kind === "svg"
        ? inputs.asset(ref.assetId, ref.path)
        : Object.hasOwn(inputs.providers, ref.provider)
          ? inputs.providers[ref.provider]?.(ref.name)
          : undefined;
  if (url?.startsWith("data:image/svg+xml,")) return { kind: "image", url };
  if (ref.kind === "symbol" && Object.hasOwn(symbols, name))
    return { kind: "symbol", name };
  return { kind: "missing" };
}
export function SemanticIcon({
  icon,
  inputs,
}: {
  icon: IconRef;
  inputs?: IconResolution;
}) {
  const context = useContext(IconResolutionContext),
    result = resolveIcon(icon, inputs ?? context);
  const size = (inputs?.sizes ??
    context.sizes ?? { small: 14, medium: 16, large: 20 })[
    icon.size ?? "medium"
  ];
  const accessibility =
    icon.role === "image"
      ? { role: "img", "aria-label": icon.label, "aria-hidden": false as const }
      : { "aria-hidden": true as const };
  if (result.kind === "image")
    return (
      <img
        src={result.url}
        width={size}
        height={size}
        alt={icon.role === "image" ? icon.label : ""}
        {...accessibility}
      />
    );
  if (result.kind === "symbol") {
    const Icon = symbols[
      result.name as keyof typeof symbols
    ] as ComponentType<symbols.IconProps>;
    return <Icon size={size} builtIn {...accessibility} />;
  }
  return (
    <span
      {...accessibility}
      data-missing-icon={icon.kind}
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center"
    >
      ?
    </span>
  );
}

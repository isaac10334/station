import { builtinIconSources } from "./builtin-icon-sources";
import type { DataAsset } from "./asset-state";

/** Read-only asset identities for built-in defaults. Fork to edit; references
 * resolve by identity just like authored SVGs and never contain host markup. */
export const builtinIconAssets = (): DataAsset[] => Object.entries(builtinIconSources).map(([name, source]) => ({
  kind: "svg", id: `builtin:icon:${name}`, instanceId: `builtin:icon:${name}:v1`,
  name: `${name} icon`, description: "Built-in icon default · fork to edit", revision: 0,
  files: { "image.svg": source },
}));
export const builtinIconAsset = (id: string): DataAsset | undefined => {
  const name = id.slice(13), source = id.startsWith("builtin:icon:") && builtinIconSources[name];
  return source ? { kind: "svg", id, instanceId: `${id}:v1`, name: `${name} icon`, description: "Built-in icon default · fork to edit", revision: 0, files: { "image.svg": source } } : undefined;
};
export const isBuiltinIconAsset = (id: string) => id.startsWith("builtin:icon:") && Object.hasOwn(builtinIconSources, id.slice(13));

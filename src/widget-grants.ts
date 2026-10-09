import type { Capability } from "@loop-kit/capabilities";
import type { Scope } from "@loop-kit/host";

/** Session-only authority for a built-in widget. Revocation invalidates retained methods.
 * Trusted React can still access the host; this is an application permission boundary,
 * not isolation for untrusted JavaScript. Never pass the raw scope to model tools.
 * @example
 * const session = grantedWidgetScope(ownedScope, [assetCatalog.id]);
 * const catalog = await session.acquire(assetCatalog);
 * try { catalog.list(); } finally { await session.revoke(); }
 */
export function grantedWidgetScope(scope: Scope, grants: Iterable<string>) {
  const allowed = new Set(grants);
  let revoked = false;
  const check = (id: string, signal?: AbortSignal) => {
    if (revoked || signal?.aborted) throw new Error("Widget capability cancelled.");
    if (!allowed.has(id)) throw new Error(`Widget grant required: ${id}`);
  };
  return {
    async acquire<T extends object>(capability: Capability<T>) {
      check(capability.id);
      const handle = await scope.acquire(capability);
      check(capability.id, handle.signal);
      return new Proxy(handle.value, {
        get(target, property) {
          check(capability.id, handle.signal);
          const value = Reflect.get(target, property);
          if (typeof value !== "function") return value;
          return (...args: unknown[]) => {
            check(capability.id, handle.signal);
            const result = Reflect.apply(value, target, args);
            return result instanceof Promise ? result.then(output => { check(capability.id, handle.signal); return output; }) : result;
          };
        },
      });
    },
    revoke() { revoked = true; return scope.revoke(); },
  };
}
export type GrantedWidgetScope = ReturnType<typeof grantedWidgetScope>;

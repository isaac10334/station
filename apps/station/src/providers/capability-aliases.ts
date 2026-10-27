import type { Capability } from "@loop-kit/capabilities";
import type { Host } from "@loop-kit/host";

/** Exact legacy identity adapter. Acquisition never translates grants: the caller
 * must already be authorized for the identity it requested. The canonical provider
 * owns resources, while releasing this alias releases only its own acquisition. */
export function provideCompatibilityAlias<T extends object>(
  host: Host,
  legacy: Capability<T>,
  canonical: Capability<T>,
) {
  const handles = new WeakMap<object, { release(): Promise<void> }>();
  host.define(legacy, {
    name: `Legacy: ${legacy.id}`,
    description: `Compatibility contract. New consumers use ${canonical.id}@${canonical.version}. Effects and permissions remain unchanged.`,
  });
  host.provide(
    legacy,
    {
      async create({ scope, signal }) {
        const handle = await scope.acquire(canonical);
        const check = () => {
          signal.throwIfAborted();
          handle.signal.throwIfAborted();
        };
        const value = new Proxy(handle.value, {
          get(target, key) {
            check();
            const member = Reflect.get(target, key);
            return typeof member !== "function"
              ? member
              : (...args: unknown[]) => {
                  check();
                  const result = Reflect.apply(member, target, args);
                  return result instanceof Promise
                    ? result.then((output) => {
                        check();
                        return output;
                      })
                    : result;
                };
          },
        });
        handles.set(value, handle);
        return value;
      },
      async dispose(value) {
        await handles.get(value)?.release();
      },
    },
    {
      name: "Legacy compatibility adapter",
      description: `Exact adapter to ${canonical.id}; no extra methods, grants or effects.`,
    },
  );
}

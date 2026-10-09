/**
 * Typed identities for service contracts. This package defines identities only;
 * a host or provider supplies the service value.
 *
 * @example
 * ```ts
 * interface Clock { now(): number }
 * const clock = defineCapability<Clock>({ id: "loop:time/clock", version: "1.0.0" });
 * ```
 */
declare const serviceType: unique symbol;

/**
 * A stable runtime identity associated with a TypeScript service type.
 * Identities with equal `id` and `version` denote the same runtime contract;
 * `T` is erased and implementations are not checked at runtime.
 * @typeParam T - The service interface consumers expect to acquire.
 */
export interface Capability<T> {
  /** Namespaced contract ID, for example `loop:time/clock`. */
  readonly id: string;
  /** Explicit contract version. The host requires an exact string match. */
  readonly version: string;
  /** Type-only marker; no implementation is stored on a capability. */
  readonly [serviceType]?: (value: T) => T;
}

/**
 * Define an immutable contract identity. Recreate the same ID and version in
 * another module to refer to the same runtime contract; coordinate `T` separately.
 *
 * @typeParam T - Service interface associated with this identity.
 * @param definition - Namespaced ID and nonempty version string.
 * @returns A frozen identity carrying no service implementation.
 * @throws {TypeError} If the ID is malformed or the version is blank.
 * @example
 * ```ts
 * const clock = defineCapability<{ now(): number }>({
 *   id: "loop:time/clock", version: "1.0.0"
 * });
 * ```
 */
export function defineCapability<T>(definition: { readonly id: string; readonly version: string }): Capability<T> {
  if (!/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+$/.test(definition.id)) {
    throw new TypeError(`Invalid capability ID: ${definition.id}`);
  }
  if (!definition.version.trim()) throw new TypeError("Capability version must be nonempty");
  return Object.freeze({ id: definition.id, version: definition.version }) as Capability<T>;
}

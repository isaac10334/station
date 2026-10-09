/**
 * An in-process lifecycle host for typed capability providers. Each acquisition
 * creates a value owned by a revocable scope; cancellation is cooperative.
 *
 * @example
 * ```ts
 * import { defineCapability } from "@loop-kit/capabilities";
 * import { createHost } from "@loop-kit/host";
 * const clock = defineCapability<{ now(): number }>({
 *   id: "loop:time/clock", version: "1.0.0"
 * });
 * const host = createHost();
 * const registration = host.provide(clock, { create: () => ({ now: Date.now }) });
 * const scope = host.scope();
 * const handle = await scope.acquire(clock);
 * try { console.log(handle.value.now()); } finally {
 *   await scope.revoke();
 *   await registration.unregister();
 *   await host.dispose();
 * }
 * ```
 */
import type { Capability } from "@loop-kit/capabilities";

/** Context for one provider creation. The signal aborts when its acquisition is cancelled. */
export interface ProviderContext {
  /** Aborts on handle release, scope revocation, provider removal, or host disposal. */
  readonly signal: AbortSignal;
  /** Scope requesting this instance; it may acquire other registered capabilities. */
  readonly scope: Scope;
}

/**
 * Creates one service instance per acquisition and optionally cleans it up.
 * Creation may be async. Observe `context.signal` for cooperative cancellation;
 * a creation promise that never settles can delay revocation and disposal.
 * @typeParam T - Service value returned by this provider.
 */
export interface Provider<T> {
  /** Create a fresh instance. A rejection rejects only that acquisition. */
  create(context: ProviderContext): T | Promise<T>;
  /** Clean up a created instance once. Errors reject the relevant lifecycle operation. */
  dispose?(value: T): void | Promise<void>;
}

/**
 * An acquired service. Release it when finished. `value` is ordinary JavaScript:
 * retained references remain callable after cancellation unless the provider
 * implements its own checks. This handle is not a security boundary.
 * @typeParam T - Service interface associated with the acquired capability.
 */
export interface CapabilityHandle<T> {
  /** The instance returned by `Provider.create`. */
  readonly value: T;
  /** Same signal passed to the provider during creation. */
  readonly signal: AbortSignal;
  /** Abort this handle immediately, then await provider cleanup. Idempotent. */
  release(): Promise<void>;
}

/** Owns acquisitions; revocation aborts and releases all of its handles. */
export interface Scope {
  /** Host-local identity, stable for this scope's lifetime. */
  readonly id: string;
  /** Human-readable diagnostic name; not an authorization rule. */
  readonly name: string;
  /** Update display metadata without changing ownership or authority. Throws after revocation. */
  rename(name: string): void;
  /**
   * Create a fresh instance for this acquisition.
   * @throws If revoked, no provider exists, versions differ, or creation fails.
   */
  acquire<T>(capability: Capability<T>): Promise<CapabilityHandle<T>>;
  /**
   * Abort all work immediately and await pending creation and cleanup. Idempotent.
   * Cleanup failures reject with an `AggregateError`.
   */
  revoke(reason?: unknown): Promise<void>;
}

/** Owns one provider registration and all instances created through it. */
export interface ProviderRegistration {
  /**
   * Stop new acquisition, abort active handles, and await cleanup. Idempotent.
   * Cleanup failures reject with an `AggregateError`.
   */
  unregister(reason?: unknown): Promise<void>;
}

/** Local in-process provider runtime. Dispose it to revoke scopes and registrations. */
export interface Host {
  /**
   * Describe a contract without registering a provider or granting access.
   * Definitions are keyed by ID and version and retained until host disposal.
   * Calling again replaces display metadata. Throws after disposal.
   */
  define<T>(capability: Capability<T>, options?: CapabilityDefinitionOptions): void;
  /**
   * Register one provider per ID; an exact version is required at acquisition.
   * Records an undocumented definition if this ID/version is not yet known.
   * @throws If the ID is already registered or this host is disposed.
   */
  provide<T>(capability: Capability<T>, provider: Provider<T>, options?: ProviderOptions): ProviderRegistration;
  /** Create an independently revocable acquisition scope. Throws after disposal. */
  scope(options?: ScopeOptions): Scope;
  /** Cached, deeply frozen diagnostic data. Contains no service values, signals or lifecycle controls. */
  inspect(): HostSnapshot;
  /** Coalesced microtask notifications. Observer errors cannot affect provider lifecycle. */
  subscribe(listener: () => void): () => void;
  /** Revoke all scopes and remove providers. Idempotent; cleanup failures reject. */
  dispose(reason?: unknown): Promise<void>;
}

/** Optional contract documentation, independent of any provider implementation. */
export interface CapabilityDefinitionOptions {
  /** Display name; defaults to the path after `namespace:package/`. */
  readonly name?: string;
  /** Contract behavior and limits; defaults to an empty string. */
  readonly description?: string;
}

/** Host-known contract identity and documentation; no service values or inferred TypeScript members. */
export interface CapabilityDefinition {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  /** Prefix before the colon in the capability ID, e.g. `loop`. */
  readonly namespace: string;
  /** Contract package after the colon and before the first slash, e.g. `time`. Not an npm package. */
  readonly package: string;
}

/** Optional display metadata for a provider registration. */
export interface ProviderOptions {
  /** Display name; defaults to the capability ID. */
  readonly name?: string;
  /** Short description of the implementation and its limits. */
  readonly description?: string;
}

/** Named ownership. Revoking a parent also revokes its descendants. */
export interface ScopeOptions {
  /** Display name; defaults to a generated host-local identity. */
  readonly name?: string;
  /** Must be an active scope of this host. A child cannot outlive its parent. */
  readonly parent?: Scope;
}

/** An acquisition stays visible until creation or cleanup finishes. */
export interface AcquisitionSnapshot {
  readonly id: string;
  readonly capabilityId: string;
  readonly version: string;
  readonly state: "pending" | "active" | "releasing";
}

/** Read-only scope ownership and acquisitions; completed scopes are not retained. */
export interface ScopeSnapshot {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly state: "active" | "revoking";
  readonly acquisitions: readonly AcquisitionSnapshot[];
}

/** Registration metadata and the instances currently owned by it. */
export interface ProviderSnapshot {
  readonly capabilityId: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly state: "registered" | "unregistering";
  readonly acquisitions: readonly (AcquisitionSnapshot & { readonly scopeId: string })[];
}

/** Reflection is host-local lifecycle information, not grants or a security membrane. */
export interface HostSnapshot {
  readonly state: "active" | "disposing" | "disposed";
  readonly definitions: readonly CapabilityDefinition[];
  readonly scopes: readonly ScopeSnapshot[];
  readonly providers: readonly ProviderSnapshot[];
}

type ScopeRecord = {
  id: string; name: string; parentId: string | null; state: ScopeSnapshot["state"];
  acquisitions: Map<string, AcquisitionSnapshot>;
};

type Lease = CapabilityHandle<unknown> & { abort(reason?: unknown): void };
type Registration = ProviderRegistration & {
  readonly name: string;
  readonly description: string;
  readonly acquisitions: Map<string, AcquisitionSnapshot & { readonly scopeId: string }>;
  readonly id: string;
  readonly version: string;
  readonly leases: Set<Lease>;
  readonly pending: Set<Promise<unknown>>;
  readonly controllers: Set<AbortController>;
  closed: boolean;
};

class AcquisitionCancelled extends Error {}

async function settleAll(promises: Iterable<Promise<unknown>>, ignoreCancelled = false): Promise<void> {
  const results = await Promise.allSettled(promises);
  const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map(result => result.reason)
    .filter(error => !ignoreCancelled || !(error instanceof AcquisitionCancelled));
  if (errors.length) throw new AggregateError(errors, "Capability cleanup failed");
}

/**
 * Construct an empty host. Providers are initialized only when acquired.
 * @returns A host that owns registrations and acquisition scopes.
 */
export function createHost(): Host {
  const definitions = new Map<string, CapabilityDefinition>();
  const registrations = new Map<string, Registration>();
  const scopes = new Set<Scope>();
  const lifecycleTasks = new Set<Promise<void>>();
  const scopeRecords = new Map<Scope, ScopeRecord>();
  const observedRegistrations = new Set<Registration>();
  const listeners = new Set<() => void>();
  let snapshot: HostSnapshot | undefined;
  let scheduled = false;
  let nextScope = 0;
  let nextAcquisition = 0;
  let disposed = false;
  let closed = false;
  let closing: Promise<void> | undefined;

  function changed() {
    snapshot = undefined;
    if (scheduled || !listeners.size) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      for (const listener of [...listeners]) {
        if (!listeners.has(listener)) continue;
        try { listener(); } catch { /* Diagnostics cannot interrupt lifecycle operations. */ }
      }
    });
  }

  function inspect(): HostSnapshot {
    if (snapshot) return snapshot;
    const scopeData = [...scopeRecords.values()].map(record => Object.freeze({
      id: record.id, name: record.name, parentId: record.parentId, state: record.state,
      acquisitions: Object.freeze([...record.acquisitions.values()].map(item => Object.freeze({ ...item }))),
    }));
    snapshot = Object.freeze({
      state: disposed ? "disposed" : closed ? "disposing" : "active",
      definitions: Object.freeze([...definitions.values()]),
      scopes: Object.freeze(scopeData),
      providers: Object.freeze([...observedRegistrations].map(registration => Object.freeze({
        capabilityId: registration.id, version: registration.version, name: registration.name,
        description: registration.description, state: registration.closed ? "unregistering" as const : "registered" as const,
        acquisitions: Object.freeze([...registration.acquisitions.values()].map(item => Object.freeze({ ...item }))),
      }))),
    });
    return snapshot;
  }

  function define<T>(capability: Capability<T>, options: CapabilityDefinitionOptions = {}): void {
    if (closed) throw new Error("Host is disposed");
    const colon = capability.id.indexOf(":");
    const slash = capability.id.indexOf("/", colon + 1);
    const definition = Object.freeze({
      id: capability.id, version: capability.version,
      name: options.name?.trim() || capability.id.slice(slash + 1),
      description: options.description ?? "",
      namespace: capability.id.slice(0, colon), package: capability.id.slice(colon + 1, slash),
    });
    const key = JSON.stringify([capability.id, capability.version]);
    const previous = definitions.get(key);
    if (previous?.name === definition.name && previous.description === definition.description) return;
    definitions.set(key, definition);
    changed();
  }

  function track(task: Promise<void>): Promise<void> {
    lifecycleTasks.add(task);
    void task.finally(() => lifecycleTasks.delete(task)).catch(() => {});
    return task;
  }

  function provide<T>(capability: Capability<T>, provider: Provider<T>, options: ProviderOptions = {}): ProviderRegistration {
    if (closed) throw new Error("Host is disposed");
    if (registrations.has(capability.id)) throw new Error(`Capability already provided: ${capability.id}`);
    if (!definitions.has(JSON.stringify([capability.id, capability.version]))) define(capability);
    const leases = new Set<Lease>();
    const pending = new Set<Promise<unknown>>();
    const controllers = new Set<AbortController>();
    let removal: Promise<void> | undefined;
    const registration: Registration = {
      name: options.name?.trim() || capability.id, description: options.description ?? "",
      acquisitions: new Map(),
      id: capability.id, version: capability.version, leases, pending, controllers, closed: false,
      unregister(reason?: unknown) {
        if (removal) return removal;
        registration.closed = true;
        registrations.delete(capability.id);
        changed();
        for (const controller of controllers) controller.abort(reason);
        for (const lease of leases) lease.abort(reason);
        removal = track((async () => {
          const errors: unknown[] = [];
          try { await settleAll(pending, true); } catch (error) { errors.push(error); }
          try { await settleAll([...leases].map(lease => lease.release())); } catch (error) { errors.push(error); }
          if (errors.length) throw new AggregateError(errors, "Provider removal failed");
        })().finally(() => { observedRegistrations.delete(registration); changed(); }));
        return removal;
      }
    };
    registrations.set(capability.id, registration);
    observedRegistrations.add(registration);
    changed();
    return registration;
  }

  function scope(options: ScopeOptions = {}): Scope {
    if (closed) throw new Error("Host is disposed");
    const parent = options.parent && scopeRecords.get(options.parent);
    if (options.parent && (!parent || parent.state !== "active")) throw new Error("Parent scope must be active and belong to this host");
    const id = `scope:${++nextScope}`;
    const record: ScopeRecord = { id, name: options.name?.trim() || id, parentId: parent?.id ?? null, state: "active", acquisitions: new Map() };
    const leases = new Set<Lease>();
    const pending = new Set<Promise<unknown>>();
    const controllers = new Set<AbortController>();
    let revoked = false;
    let revocation: Promise<void> | undefined;
    const result: Scope = {
      id, get name() { return record.name; },
      rename(name) {
        if (revoked) throw new Error("Scope is revoked");
        if (!name.trim()) throw new TypeError("Scope name must be nonempty");
        if (record.name === name.trim()) return;
        record.name = name.trim(); changed();
      },
      acquire<T>(capability: Capability<T>): Promise<CapabilityHandle<T>> {
        if (revoked) return Promise.reject(new Error("Scope is revoked"));
        const registration = registrations.get(capability.id);
        if (!registration || registration.closed) return Promise.reject(new Error(`No provider for ${capability.id}`));
        if (registration.version !== capability.version) return Promise.reject(new Error(`Version mismatch for ${capability.id}: expected ${registration.version}, got ${capability.version}`));
        const controller = new AbortController();
        controllers.add(controller);
        registration.controllers.add(controller);
        const acquisitionId = `acquisition:${++nextAcquisition}`;
        let acquired = false;
        const updateAcquisition = (state: AcquisitionSnapshot["state"]) => {
          const data = { id: acquisitionId, capabilityId: capability.id, version: capability.version, state };
          record.acquisitions.set(acquisitionId, data);
          registration.acquisitions.set(acquisitionId, { ...data, scopeId: id });
          changed();
        };
        updateAcquisition("pending");
        const task = (async (): Promise<CapabilityHandle<T>> => {
          const value = await (providerFor(registration) as Provider<T>).create({ scope: result, signal: controller.signal });
          if (revoked || registration.closed || closed) {
            updateAcquisition("releasing");
            controller.abort(new Error("Acquisition cancelled"));
            await (providerFor(registration) as Provider<T>).dispose?.(value);
            throw new AcquisitionCancelled("Acquisition cancelled");
          }
          let releaseTask: Promise<void> | undefined;
          const lease: Lease = {
            value,
            signal: controller.signal,
            abort(reason?: unknown) { controller.abort(reason); },
            release() {
              if (releaseTask) return releaseTask;
              controller.abort(new Error("Handle released"));
              updateAcquisition("releasing");
              releaseTask = Promise.resolve()
                .then(() => (providerFor(registration) as Provider<T>).dispose?.(value))
                .finally(() => { leases.delete(lease); registration.leases.delete(lease); record.acquisitions.delete(acquisitionId); registration.acquisitions.delete(acquisitionId); changed(); });
              pending.add(releaseTask);
              registration.pending.add(releaseTask);
              void releaseTask.finally(() => { pending.delete(releaseTask!); registration.pending.delete(releaseTask!); }).catch(() => {});
              return releaseTask;
            }
          };
          leases.add(lease);
          registration.leases.add(lease);
          acquired = true;
          updateAcquisition("active");
          return lease as CapabilityHandle<T>;
        })();
        pending.add(task);
        registration.pending.add(task);
        void task.finally(() => {
          pending.delete(task);
          registration.pending.delete(task);
          controllers.delete(controller);
          registration.controllers.delete(controller);
          if (!acquired) {
            record.acquisitions.delete(acquisitionId);
            registration.acquisitions.delete(acquisitionId);
            changed();
          }
        }).catch(() => {});
        return task;
      },
      revoke(reason?: unknown) {
        if (revocation) return revocation;
        revoked = true;
        record.state = "revoking";
        scopes.delete(result);
        changed();
        const children = [...scopeRecords].filter(([, child]) => child.parentId === id).map(([child]) => child.revoke(reason));
        for (const controller of controllers) controller.abort(reason);
        for (const lease of leases) lease.abort(reason);
        revocation = track((async () => {
          const errors: unknown[] = [];
          try { await settleAll(children); } catch (error) { errors.push(error); }
          try { await settleAll(pending, true); } catch (error) { errors.push(error); }
          try { await settleAll([...leases].map(lease => lease.release())); } catch (error) { errors.push(error); }
          if (errors.length) throw new AggregateError(errors, "Scope revocation failed");
        })().finally(() => { scopeRecords.delete(result); changed(); }));
        return revocation;
      }
    };
    scopes.add(result);
    scopeRecords.set(result, record);
    changed();
    return result;
  }

  // Provider objects are retained privately; registrations expose only lifecycle.
  const providers = new WeakMap<Registration, Provider<unknown>>();
  function providerFor(registration: Registration): Provider<unknown> {
    return providers.get(registration)!;
  }
  const register = provide;
  return {
    define,
    provide<T>(capability: Capability<T>, provider: Provider<T>, options?: ProviderOptions) {
      const registration = register(capability, provider, options) as Registration;
      providers.set(registration, provider as Provider<unknown>);
      return registration;
    },
    scope,
    inspect,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose(reason?: unknown) {
      if (closing) return closing;
      closed = true;
      changed();
      closing = (async () => {
        const errors: unknown[] = [];
        try { await settleAll([...scopes].map(scope => scope.revoke(reason))); } catch (error) { errors.push(error); }
        try { await settleAll([...registrations.values()].map(registration => registration.unregister(reason))); } catch (error) { errors.push(error); }
        try { await settleAll(lifecycleTasks); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, "Host disposal failed");
      })().finally(() => { definitions.clear(); disposed = true; changed(); });
      return closing;
    }
  };
}

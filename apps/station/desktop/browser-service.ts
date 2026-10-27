import type {
  BrowserAvailability,
  BrowserConfiguration,
  BrowserFrame,
  BrowserOperation,
  BrowserSession,
  BrowserTab,
} from "@station/capabilities";
import {
  browserConfiguration,
  browserFrame,
  browserUrl,
} from "../src/core/browser-policy";

/** Native effects stay behind this private adapter. A conforming driver must
 * preserve origin security and OS renderer sandboxing, deny downloads/devices/
 * external protocols by default, block Station/local destinations at native
 * navigation boundaries, and never attach app RPC or secrets to foreign pages.
 * Status is untrusted display data; it can never authorize an operation.
 */
export interface NativeBrowserDriver {
  /** Must return a hidden, non-interactive view, including before first paint. */
  create(url: string): {
    snapshot(): Omit<BrowserTab, "id">;
    navigate(url: string): void;
    command(type: "back" | "forward" | "reload" | "stop"): void;
    present(frame: BrowserFrame): void;
    dispose(): void;
  };
}
type View = ReturnType<NativeBrowserDriver["create"]>;
type Resource = {
  id: string;
  tabs: Map<string, View>;
  activeTab: string;
  frame: BrowserFrame;
};

/** One acquisition is one resource grant. The caller owns expiry/renewal; close,
 * revoke and expiry destroy native views exactly once. Hiding only presents the
 * same resource invisibly. No authority is derived from a guest event or URL.
 */
export function createBrowserService(
  driver?: NativeBrowserDriver,
  now = Date.now,
) {
  const leases = new Map<
    string,
    { expires: number; resources: Map<string, Resource> }
  >();
  const availability: BrowserAvailability = driver
    ? { available: true, reason: "" }
    : {
        available: false,
        reason:
          "Browsing is unavailable in this desktop build. A browser security update is required before websites can open.",
      };
  const disposeResource = (resource: Resource) => {
    const views = [...resource.tabs.values()];
    resource.tabs.clear();
    const errors: unknown[] = [];
    for (const view of views) {
      try {
        view.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, "Native browser cleanup failed.");
  };
  const revoke = (id: string) => {
    const lease = leases.get(id);
    leases.delete(id);
    const errors: unknown[] = [];
    if (lease)
      for (const resource of lease.resources.values()) {
        try {
          disposeResource(resource);
        } catch (error) {
          errors.push(error);
        }
      }
    if (errors.length)
      throw new AggregateError(errors, "Browser lease cleanup failed.");
  };
  const leaseFor = (id: string) => {
    const lease = leases.get(id);
    if (!lease || lease.expires <= now()) {
      revoke(id);
      throw new Error("Browser lease expired or revoked.");
    }
    return lease;
  };
  const present = (resource: Resource) => {
    for (const [id, view] of resource.tabs)
      view.present({
        ...resource.frame,
        visible: resource.frame.visible && id === resource.activeTab,
      });
  };
  const snapshot = (resource: Resource): BrowserSession => ({
    id: resource.id,
    activeTab: resource.activeTab,
    tabs: [...resource.tabs].map(([id, view]) => {
      const status = view.snapshot();
      // Neither URLs nor title strings from a foreign page become authority.
      let url = "";
      try {
        url = browserUrl(status.url);
      } catch {
        /* Display no privileged URL. */
      }
      return {
        id,
        url,
        title: String(status.title).slice(0, 256),
        loading: !!status.loading,
        back: !!status.back,
        forward: !!status.forward,
        error: String(status.error).slice(0, 512),
        ...(Number.isSafeInteger(status.addressFocus) && status.addressFocus! > 0
          ? { addressFocus: status.addressFocus } : {}),
      };
    }),
  });
  return {
    availability: () => ({ ...availability }),
    grant() {
      if (!driver) throw new Error(availability.reason);
      if (leases.size >= 32) throw new Error("Browser lease limit reached.");
      const id = crypto.randomUUID();
      leases.set(id, { expires: now() + 15_000, resources: new Map() });
      return id;
    },
    renew(id: string) {
      leaseFor(id).expires = now() + 15_000;
    },
    revoke,
    open(id: string, input: BrowserConfiguration) {
      const lease = leaseFor(id),
        config = browserConfiguration(input);
      if (lease.resources.size >= 4)
        throw new Error("Browser session limit reached.");
      const resource: Resource = {
        id: crypto.randomUUID(),
        tabs: new Map(),
        activeTab: config.activeTab,
        frame: { x: 0, y: 0, width: 0, height: 0, visible: false },
      };
      try {
        for (const tab of config.tabs)
          resource.tabs.set(tab.id, driver!.create(tab.url));
        present(resource);
        const result = snapshot(resource);
        lease.resources.set(resource.id, resource);
        return result;
      } catch (error) {
        disposeResource(resource);
        throw error;
      }
    },
    perform(id: string, session: string, input: BrowserOperation) {
      const resource = leaseFor(id).resources.get(session);
      if (!resource)
        throw new Error("Browser session does not belong to this lease.");
      if (!input || typeof input !== "object")
        throw new Error("Invalid browser operation.");
      if (input.type === "present") {
        resource.frame = browserFrame(input.frame);
        present(resource);
      } else if (input.type === "add") {
        if (
          resource.tabs.size >= 12 ||
          typeof input.tab !== "string" ||
          !/^[a-zA-Z0-9:_-]{1,100}$/.test(input.tab) ||
          resource.tabs.has(input.tab)
        )
          throw new Error("Invalid browser tab.");
        const view = driver!.create(browserUrl(input.url));
        resource.tabs.set(input.tab, view);
        resource.activeTab = input.tab;
        present(resource);
      } else if (input.type !== "snapshot") {
        const view = resource.tabs.get(input.tab);
        if (!view) throw new Error("Browser tab not found.");
        if (input.type === "navigate") view.navigate(browserUrl(input.url));
        else if (input.type === "activate") {
          resource.activeTab = input.tab;
          present(resource);
        } else if (input.type === "remove") {
          if (resource.tabs.size <= 1)
            throw new Error("Keep at least one browser tab.");
          view.dispose();
          resource.tabs.delete(input.tab);
          if (resource.activeTab === input.tab)
            resource.activeTab = resource.tabs.keys().next().value!;
          present(resource);
        } else if (["back", "forward", "reload", "stop"].includes(input.type))
          view.command(input.type as "back" | "forward" | "reload" | "stop");
        else throw new Error("Unknown browser operation.");
      }
      return snapshot(resource);
    },
    close(id: string, session: string) {
      const lease = leaseFor(id),
        resource = lease.resources.get(session);
      lease.resources.delete(session);
      if (resource) disposeResource(resource);
    },
    expire() {
      const errors: unknown[] = [];
      for (const [id, lease] of leases)
        if (lease.expires <= now()) {
          try {
            revoke(id);
          } catch (error) {
            errors.push(error);
          }
        }
      if (errors.length)
        throw new AggregateError(errors, "Expired browser cleanup failed.");
    },
    dispose() {
      const errors: unknown[] = [];
      for (const id of leases.keys()) {
        try {
          revoke(id);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(errors, "Browser shutdown cleanup failed.");
    },
  };
}
export type BrowserService = ReturnType<typeof createBrowserService>;

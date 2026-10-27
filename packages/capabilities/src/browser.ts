import { defineCapability } from "@loop-kit/capabilities";

/** Portable browsing contract. Availability is provider-specific; web hosts may
 * provide no browser, or an explicitly authorized remote/headless provider.
 * Acquisition owns all sessions. Neither native objects nor script evaluation
 * cross this boundary. Page automation requires a separate capability.
 */
export interface BrowserContexts {
  availability(): Promise<BrowserAvailability>;
  open(config: BrowserConfiguration): Promise<BrowserSession>;
  perform(
    session: string,
    operation: BrowserOperation,
  ): Promise<BrowserSession>;
  close(session: string): Promise<void>;
}
export type BrowserAvailability = { available: boolean; reason: string };
/** Exportable configuration only. Providers choose private partition identities.
 * Query strings/fragments, cookies, credentials and grants are not configuration.
 */
export type BrowserConfiguration = {
  tabs: { id: string; url: string }[];
  activeTab: string;
};
export type BrowserTab = {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  back: boolean;
  forward: boolean;
  error: string;
  /** Monotonic native shortcut signal; display/focus only, never authority. */
  addressFocus?: number;
};
export type BrowserSession = {
  id: string;
  tabs: BrowserTab[];
  activeTab: string;
};
/** Bounds relative to the host viewport in CSS pixels, before root page zoom.
 * Native adapters convert page zoom and monitor DPI; callers never supply native
 * pixels or derive authority from these presentation-only coordinates.
 */
export type BrowserFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};
/** All operations are bounded data. `present` positions an existing resource;
 * moving or hiding it never creates a new browsing session.
 */
export type BrowserOperation =
  | { type: "navigate"; tab: string; url: string }
  | { type: "add"; tab: string; url: string }
  | {
      type: "activate" | "remove" | "back" | "forward" | "reload" | "stop";
      tab: string;
    }
  | { type: "present"; frame: BrowserFrame }
  | { type: "snapshot" };

export const browserContexts = defineCapability<BrowserContexts>({
  id: "station:browser/contexts",
  version: "1.0.0",
});

/** A receiver is a separately granted write destination, not a path supplied by
 * a website. This descriptor carries no authority by itself. Delivery must bind
 * the sender lease and receiver grant, stage bounded bytes, and commit atomically.
 * Asset receivers create data/proposed revisions; receiving never executes code.
 */
export type DownloadReceiver = {
  id: string;
  name: string;
  accepts: readonly string[];
  maxBytes: number;
};

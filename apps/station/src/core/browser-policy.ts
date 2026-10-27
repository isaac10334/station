import type { BrowserConfiguration, BrowserFrame } from "@station/capabilities";

/** App boundary validation, not a network firewall. Native providers must also
 * enforce policy on redirects, subframes, popups and resource requests. DNS names
 * can resolve to private addresses; URL checks alone do not prevent rebinding.
 */
export function browserUrl(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length > 4096 ||
    /[\u0000-\u0020\u007f\\]/.test(input)
  )
    throw new Error("Enter an HTTP or HTTPS address without credentials.");
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Only HTTP and HTTPS addresses without credentials are allowed.",
    );
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host ||
    url.port === "43157" ||
    host === "local" ||
    host === "localhost.localdomain" ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "[::]" ||
    host === "[::1]" ||
    host.includes(":") ||
    /^(0|10|127)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
    /^(22[4-9]|23\d|24\d|25[0-5])\./.test(host)
  )
    throw new Error(
      "Local, private and Station addresses are not browser destinations.",
    );
  return url.href;
}

/** Persist only ordinary path bookmarks; query/fragment values can contain tokens. */
export function browserBookmark(input: unknown): string {
  const url = new URL(browserUrl(input));
  url.search = "";
  url.hash = "";
  return url.href;
}
export function browserConfiguration(input: unknown): BrowserConfiguration {
  if (!input || typeof input !== "object")
    throw new Error("Invalid browser configuration.");
  const value = input as BrowserConfiguration;
  if (
    !Array.isArray(value.tabs) ||
    !value.tabs.length ||
    value.tabs.length > 12
  )
    throw new Error("A browser supports 1–12 tabs.");
  const ids = new Set<string>();
  const tabs = value.tabs.map((tab) => {
    if (
      !tab ||
      typeof tab.id !== "string" ||
      !/^[a-zA-Z0-9:_-]{1,100}$/.test(tab.id) ||
      ids.has(tab.id)
    )
      throw new Error("Invalid or duplicate browser tab.");
    ids.add(tab.id);
    return { id: tab.id, url: browserBookmark(tab.url) };
  });
  return {
    tabs,
    activeTab: ids.has(value.activeTab) ? value.activeTab : tabs[0].id,
  };
}
export const defaultBrowserConfiguration = (): BrowserConfiguration => ({
  tabs: [{ id: "start", url: "https://example.com/" }],
  activeTab: "start",
});
export function browserFrame(input: unknown): BrowserFrame {
  const value = input as BrowserFrame;
  if (
    !value ||
    typeof value.visible !== "boolean" ||
    ![value.x, value.y, value.width, value.height].every(Number.isFinite) ||
    value.width < 0 ||
    value.height < 0 ||
    value.width > 16384 ||
    value.height > 16384 ||
    Math.abs(value.x) > 32768 ||
    Math.abs(value.y) > 32768
  )
    throw new Error("Invalid browser presentation.");
  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    visible: value.visible,
  };
}

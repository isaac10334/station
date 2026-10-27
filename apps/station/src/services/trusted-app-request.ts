/** Credentials belong to the trusted root, never guest capabilities or source. */
let bootstrap: Promise<Record<string, string>> | undefined;
import { rootDesktopCredential } from "./root-credential";
export function trustedAppHeaders(): Promise<Record<string, string>> {
  if (typeof document === "undefined" || window.top !== window)
    return Promise.resolve({});
  return (bootstrap ??= (async (): Promise<Record<string, string>> => {
    const native = await rootDesktopCredential();
    if (native) return { "x-station-app": native };
    const response = await fetch("/api/app-bootstrap");
    return response.ok
      ? { "x-station-app": (await response.json()).token }
      : {};
  })());
}

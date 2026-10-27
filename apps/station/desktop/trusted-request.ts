/** Shared private desktop membrane. A secret alone is insufficient: opaque
 * guests and foreign origins must fail independently of the requested service.
 * This protects the renderer/guest boundary, not other local OS processes.
 */
export function isTrustedDesktopRequest(
  request: Request,
  token: string,
  origin = "http://127.0.0.1:43157",
): boolean {
  return (
    new URL(request.url).origin === origin &&
    request.headers.get("host") === new URL(origin).host &&
    request.headers.get("sec-fetch-site") === "same-origin" &&
    request.headers.get("x-station-desktop") === token &&
    (!request.headers.has("origin") ||
      request.headers.get("origin") === origin) &&
    (request.method !== "POST" || request.headers.get("origin") === origin)
  );
}

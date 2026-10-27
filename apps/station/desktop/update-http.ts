import type { DesktopUpdateState } from "../src/contracts/desktop-updates";
import { isTrustedDesktopRequest } from "./trusted-request";

/** Session secret appears only in the trusted top-level app document. Opaque guests
 * cannot read it. Origin, Fetch Metadata, Host and secret are checked independently.
 */
export function createUpdateHttp(
  token: string,
  service: {
    getSnapshot(): DesktopUpdateState;
    check(): Promise<void>;
    apply(): Promise<void>;
  },
  origin?: string,
) {
  return (request: Request): Response => {
    const url = new URL(request.url);
    if (!isTrustedDesktopRequest(request, token, origin))
      return new Response("Forbidden", { status: 403 });
    const headers = { "Cache-Control": "no-store" };
    if (url.pathname === "/api/desktop/updates" && request.method === "GET")
      return Response.json(service.getSnapshot(), { headers });
    if (
      request.method === "POST" &&
      (url.pathname === "/api/desktop/updates/check" ||
        url.pathname === "/api/desktop/updates/apply")
    ) {
      if (
        request.body !== null ||
        (request.headers.has("content-length") &&
          request.headers.get("content-length") !== "0")
      )
        return new Response("No body allowed", { status: 400 });
      void (
        url.pathname.endsWith("/check") ? service.check() : service.apply()
      ).catch(console.error);
      return new Response(null, { status: 202, headers });
    }
    return new Response("Not found", { status: 404 });
  };
}

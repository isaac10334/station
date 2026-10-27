import type {
  BrowserConfiguration,
  BrowserOperation,
} from "@station/capabilities";
import type { BrowserService } from "./browser-service";
import { isTrustedDesktopRequest } from "./trusted-request";

/** Private top-level controller transport. Never mounted in the web server or
 * SDK guest bridge. Session secrets, lease IDs and native IDs never enter URLs.
 * Guest `postMessage`/Electrobun event packets are not accepted on this route.
 */
export function createBrowserHttp(
  token: string,
  service: BrowserService,
  origin?: string,
) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (!isTrustedDesktopRequest(request, token, origin))
      return new Response("Forbidden", { status: 403, headers });
    if (url.pathname === "/api/desktop/browser" && request.method === "GET")
      return Response.json(service.availability(), { headers });
    if (url.pathname !== "/api/desktop/browser" || request.method !== "POST")
      return new Response("Not found", { status: 404, headers });
    if (request.headers.get("content-type") !== "application/json")
      return new Response("JSON required", { status: 415, headers });
    try {
      const reader = request.body?.getReader();
      if (!reader) throw new Error("Missing browser request.");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > 16_384) throw new Error("Browser request exceeds 16 KiB.");
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const value = JSON.parse(new TextDecoder().decode(bytes));
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid browser request.");
      if (value.action === "grant")
        return Response.json({ lease: service.grant() }, { headers });
      if (typeof value.lease !== "string" || value.lease.length > 100)
        throw new Error("Missing browser lease.");
      let result: unknown = null;
      switch (value.action) {
        case "renew":
          service.renew(value.lease);
          break;
        case "revoke":
          service.revoke(value.lease);
          break;
        case "open":
          result = service.open(
            value.lease,
            value.config as BrowserConfiguration,
          );
          break;
        case "perform":
          if (typeof value.session !== "string")
            throw new Error("Missing browser session.");
          result = service.perform(
            value.lease,
            value.session,
            value.operation as BrowserOperation,
          );
          break;
        case "close":
          if (typeof value.session !== "string")
            throw new Error("Missing browser session.");
          service.close(value.lease, value.session);
          break;
        default:
          throw new Error("Unknown browser request.");
      }
      return Response.json(result, { headers });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error ? error.message : "Browser request failed.",
        },
        { status: 400, headers },
      );
    }
  };
}

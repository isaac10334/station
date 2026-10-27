import { resolve, relative, isAbsolute, sep } from "node:path";
const prefix = "/integrations/vectorcraft/";
/** Public, pinned vendor resources only. Opaque sandbox frames need CORS for
 * module/wasm/font loads. No API/credential response uses these headers. */
export function createVectorcraftResources(directory: string) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix)) return null;
    const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache", "Cross-Origin-Resource-Policy": "cross-origin" };
    const available = await Bun.file(resolve(directory, "vendor.json")).exists();
    if (url.pathname === `${prefix}status`) return Response.json({ available, version: "0.14.0" }, { headers });
    if (!available) return new Response("VectorCraft resources are unavailable. Run prepare:vectorcraft.", { status: 503, headers });
    if (url.pathname === `${prefix}editor`) {
      const vendor = await Bun.file(resolve(directory, "index.html")).text();
      const origin = url.origin;
      const policy = `default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' ${origin}${prefix}; style-src 'unsafe-inline'; connect-src ${origin}${prefix}; img-src data: blob:; font-src ${origin}${prefix} data:; base-uri ${origin}${prefix}; form-action 'none'`;
      const html = vendor.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><base href="${origin}${prefix}"><script src="${origin}${prefix}bridge.js"></script>`);
      return new Response(html, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "sandbox allow-scripts", "Referrer-Policy": "no-referrer" } });
    }
    let decoded: string;
    try { decoded = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { return new Response("Invalid path", { status: 400, headers }); }
    const path = resolve(directory, decoded);
    const name = relative(directory, path);
    if (!name || name === ".." || name.startsWith(`..${sep}`) || isAbsolute(name)) return new Response("Not found", { status: 404, headers });
    const file = Bun.file(path);
    return await file.exists() ? new Response(file, { headers: { ...headers, ...(path.endsWith(".html") ? { "Content-Security-Policy": "sandbox allow-scripts" } : {}) } }) : new Response("Not found", { status: 404, headers });
  };
}

/** Parsed before authored markup; opaque origin denies host DOM and storage access. */
export const WEB_CONTENT_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
export function webContentDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${WEB_CONTENT_CSP}"></head><body>${html}</body></html>`;
}

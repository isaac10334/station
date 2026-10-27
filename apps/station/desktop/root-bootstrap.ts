/** Fixed host-to-root bootstrap, never an agent-controlled script/evaluation API.
 * The public loopback HTML contains only a marker. Credentials are delivered to
 * the exact native root after DOM readiness, independently of spoofable HTTP headers.
 */
export function desktopRootBootstrap(origin: string, token: string, verifyPrograms=false) {
  return `(() => {
    if (window.top !== window || location.origin !== ${JSON.stringify(origin)} || location.pathname !== "/") return;
    let meta = document.querySelector('meta[name="station-desktop"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "station-desktop"; document.head.appendChild(meta); }
    meta.content = ${JSON.stringify(token)};
    if (${verifyPrograms}) { const probe=document.createElement('meta');probe.name='station-programs-verify';probe.content='1';document.head.append(probe); }
    window.dispatchEvent(new Event("station:desktop-ready"));
  })();`;
}

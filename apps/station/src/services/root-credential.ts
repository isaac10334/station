/** Native credentials arrive through the fixed host bootstrap, not an HTTP page.
 * Opaque guests cannot read parent DOM; ordinary loopback browsers get no secret.
 */
export async function rootDesktopCredential(): Promise<string | undefined> {
  if (typeof document === "undefined" || window.top !== window) return;
  const read = () =>
    document.querySelector<HTMLMetaElement>('meta[name="station-desktop"]')
      ?.content;
  if (read()) return read();
  if (!document.querySelector('meta[name="station-native-root"]')) return;
  return new Promise((resolve, reject) => {
    const ready = () => {
      const token = read();
      if (!token) return;
      clearTimeout(timeout);
      window.removeEventListener("station:desktop-ready", ready);
      resolve(token);
    };
    const timeout = setTimeout(() => {
      window.removeEventListener("station:desktop-ready", ready);
      reject(
        new Error(
          "Native owner bootstrap unavailable; private services remain disabled",
        ),
      );
    }, 5000);
    window.addEventListener("station:desktop-ready", ready);
    ready();
  });
}

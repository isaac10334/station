export type IconOverrides = Readonly<Record<string, string>>;
let current: IconOverrides = Object.freeze({});
const listeners = new Set<() => void>();
/** Accept only host-validated SVG image URLs. No raw markup is mounted into host DOM. */
export function setIconOverrides(next: IconOverrides) {
  const safe: Record<string, string> = {};
  let bytes = 0;
  for (const [name, url] of Object.entries(next)) {
    if (
      !url.startsWith("data:image/svg+xml,") ||
      bytes + url.length > 131072
    )
      continue;
    bytes += url.length;
    safe[name] = url;
  }
  current = Object.freeze(safe);
  listeners.forEach((fn) => fn());
}
export const getIcons = () => current;
export const subscribeIcons = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

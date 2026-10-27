/** Literal colors shared by source validation and the picker. No CSS or resources. */
export type Rgba = { r: number; g: number; b: number; a: number };
const clamp = (n: number, max = 1) => Math.max(0, Math.min(max, n));
const number =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(%|deg|grad|rad|turn)?$/i;
export function parseThemeColor(input: string): Rgba | null {
  const text = input.trim().toLowerCase();
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.test(text)) {
    const hex = text.slice(1);
    const full = hex.length < 5 ? [...hex].map((c) => c + c).join("") : hex;
    const channel = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: full.length === 8 ? channel(6) / 255 : 1,
    };
  }
  const fn = /^(rgb|rgba|hsl|hsla|oklch)\((.*)\)$/.exec(text);
  if (!fn) return null;
  const [, kind, body] = fn;
  const comma = body.includes(",");
  if (comma && (kind === "oklch" || body.includes("/"))) return null;
  const sections = body.split("/");
  if (sections.length > 2) return null;
  const parts = comma
    ? body.split(",").map((p) => p.trim())
    : sections[0].trim().split(/\s+/);
  const opacity = comma ? parts[3] : sections[1]?.trim();
  if (
    (comma && (parts.length < 3 || parts.length > 4)) ||
    (!comma && parts.length !== 3)
  )
    return null;
  const read = (part: string, percentScale: number, angle = false): number => {
    const match = number.exec(part);
    if (!match) return NaN;
    const unit = match[1],
      n = parseFloat(part);
    if (!Number.isFinite(n)) return NaN;
    if (unit === "%") return angle ? NaN : (n * percentScale) / 100;
    if (unit && !angle) return NaN;
    return unit === "turn"
      ? n * 360
      : unit === "rad"
        ? (n * 180) / Math.PI
        : unit === "grad"
          ? n * 0.9
          : n;
  };
  const a = opacity === undefined ? 1 : clamp(read(opacity, 1));
  let channels: number[];
  if (kind.startsWith("rgb")) {
    if (
      comma &&
      !parts
        .slice(0, 3)
        .every((p) => p.endsWith("%") === parts[0].endsWith("%"))
    )
      return null;
    channels = parts.slice(0, 3).map((p) => clamp(read(p, 255), 255));
  } else if (kind.startsWith("hsl")) {
    if (!parts[1].endsWith("%") || !parts[2].endsWith("%")) return null;
    const h = ((read(parts[0], 1, true) % 360) + 360) % 360;
    const s = clamp(read(parts[1], 1)),
      l = clamp(read(parts[2], 1));
    const c = s * Math.min(l, 1 - l);
    channels = [0, 8, 4].map((n) => {
      const k = (n + h / 30) % 12;
      return 255 * (l - c * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    });
  } else {
    const l = clamp(read(parts[0], 1)),
      c = Math.max(0, read(parts[1], 0.4));
    const h = (read(parts[2], 1, true) * Math.PI) / 180;
    const x = c * Math.cos(h),
      y = c * Math.sin(h);
    const L = (l + 0.3963377774 * x + 0.2158037573 * y) ** 3;
    const M = (l - 0.1055613458 * x - 0.0638541728 * y) ** 3;
    const S = (l - 0.0894841775 * x - 1.291485548 * y) ** 3;
    channels = [
      4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
      -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
      -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
    ].map(
      (n) =>
        clamp(n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055) *
        255,
    );
  }
  if (![...channels, a].every(Number.isFinite)) return null;
  return { r: channels[0], g: channels[1], b: channels[2], a };
}

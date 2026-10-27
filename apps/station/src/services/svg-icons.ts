const elements = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "title",
  "desc",
]);
const attributes = new Set([
  "xmlns",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "vector-effect",
  "clip-rule",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "transform",
  "id",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "clip-path",
  "mask",
  "preserveAspectRatio",
]);
/** Theme icons use a bounded, static SVG subset as an image mask. No host DOM is authored.
 * Script, HTML, links, resources, CSS and animation are rejected rather than silently stripped.
 */
export function svgIconUrl(source: string): string {
  if (typeof source !== "string") throw new Error("SVG file missing");
  if (
    new TextEncoder().encode(source).length > 32768 ||
    /<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(source)
  )
    throw new Error("SVG icon exceeds limits or contains entities");
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    document.querySelector("parsererror") ||
    document.documentElement.localName !== "svg"
  )
    throw new Error("Invalid SVG");
  const nodes = [
    document.documentElement,
    ...Array.from(document.documentElement.querySelectorAll("*")),
  ];
  if (nodes.length > 256) throw new Error("SVG icon has too many shapes");
  for (const node of nodes) {
    if (
      node.namespaceURI !== "http://www.w3.org/2000/svg" ||
      !elements.has(node.localName)
    )
      throw new Error(`Unsupported SVG element: ${node.localName}`);
    for (const attribute of Array.from(node.attributes)) {
      if (
        !attributes.has(attribute.name) ||
        attribute.value.length > 8192 ||
        /[\\\u0000-\u001f\u007f]/.test(attribute.value) ||
        /[<>]/.test(attribute.value) ||
        (/(?:https?:|data:|javascript:|\/\/)/i.test(attribute.value) &&
          attribute.name !== "xmlns") ||
        (/url\(/i.test(attribute.value) &&
          !/^url\(#[\w-]+\)$/.test(attribute.value))
      )
        throw new Error(`Unsupported SVG attribute: ${attribute.name}`);
    }
  }
  return `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(document.documentElement))}`;
}

// A bounded content cache avoids XML parsing during every theme drag frame.
const cached = new Map<string, { url?: string; error?: string }>();
/** Content-keyed validation also invalidates immediately when an SVG is edited. */
export function resolvedSvgIcon(source: string): string {
  const prior = cached.get(source);
  if (prior?.url) return prior.url;
  if (prior?.error) throw new Error(prior.error);
  try {
    const url = svgIconUrl(source);
    if (cached.size >= 64) cached.delete(cached.keys().next().value!);
    cached.set(source, { url });
    return url;
  } catch (error) {
    if (cached.size >= 64) cached.delete(cached.keys().next().value!);
    cached.set(source, { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

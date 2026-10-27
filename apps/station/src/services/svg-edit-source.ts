import { svgIconUrl } from "./svg-icons";

/** SVG-Edit 7.4.2 drops presentation attributes on the root svg. Preserve their
 * inherited semantics on an ordinary group before its sanitizer imports source.
 * This is an editor projection only; persisted source changes solely on Apply. */
export function prepareSvgEditSource(source: string): string {
  svgIconUrl(source);
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  const inherited = Array.from(root.attributes).filter(attr => /^(?:fill(?:-rule|-opacity)?|stroke(?:-width|-linecap|-linejoin|-opacity|-dasharray|-dashoffset)?|opacity|transform|clip-path|mask)$/.test(attr.name));
  if (inherited.length) {
    const group = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    for (const attr of inherited) { group.setAttribute(attr.name, attr.value); root.removeAttributeNode(attr); }
    while (root.firstChild) group.appendChild(root.firstChild);
    root.appendChild(group);
  }
  return new XMLSerializer().serializeToString(root);
}

/** Strip only SVG-Edit's inert layer/namespace annotations before validating
 * every remaining authored element, attribute and value as static SVG.
 */
export function normalizeSvgEditSource(raw: string): string {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > 32768) throw new Error("SVG exceeds 32 KiB");
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(raw)) throw new Error("SVG entities and processing instructions are unsupported");
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg") throw new Error("Invalid SVG. Repair the source before applying.");
  for (const node of [doc.documentElement, ...Array.from(doc.querySelectorAll("*"))]) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.namespaceURI === "http://svg-edit.googlecode.com"
        || (attr.name.startsWith("xmlns:") && ["http://svg-edit.googlecode.com", "http://www.w3.org/2000/svg", "http://www.w3.org/1999/xlink"].includes(attr.value))
        || (node.localName === "g" && attr.name === "class" && attr.value === "layer")
        || (attr.name === "style" && /^pointer-events:\s*(?:all|inherit);?\s*$/.test(attr.value))) node.removeAttributeNode(attr);
    }
  }
  const source = new XMLSerializer().serializeToString(doc.documentElement);
  svgIconUrl(source);
  return source;
}

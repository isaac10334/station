import type { BrowserFrame } from "@station/capabilities";
import { clippedBounds } from "./docking/geometry";

/** WebView2 has no visual hole masks in this Electrobun pin. Hide the retained
 * native surface while shell overlays/dragging overlap it. Partial clipping also
 * hides the surface rather than allowing pixels/input outside the owner. This
 * deliberately trades uninterrupted page visibility for safe host interaction.
 */
export function browserPresentation(element: HTMLElement): BrowserFrame {
  const rect = element.getBoundingClientRect(),
    clipped = clippedBounds(element);
  const owner = element.closest<HTMLElement>("[data-presentation-owner]");
  // Listboxes also include ordinary asset content. Only popup listboxes and
  // visible overlay surfaces take over the native layer.
  const overlay = Array.from(
    document.querySelectorAll<HTMLElement>(
      'dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [role="tooltip"], [data-native-overlay], [data-pickup]',
    ),
  ).some(
    (node) =>
      !node.contains(element) &&
      !(node.dataset.nativeOverlayOwner && node.dataset.nativeOverlayOwner === owner?.dataset.presentationFloatRoot) &&
      node.getBoundingClientRect().width > 0 &&
      node.getBoundingClientRect().height > 0 &&
      getComputedStyle(node).visibility === "visible" &&
      !node.closest('[hidden], [inert], [aria-hidden="true"]'),
  );
  const covered =
    owner &&
    Array.from(
      document.querySelectorAll<HTMLElement>("[data-presentation-owner]"),
    ).some((node) => {
      if (
        node === owner ||
        node.contains(element) ||
        owner.contains(node) ||
        Number(getComputedStyle(node).zIndex) <=
          Number(getComputedStyle(owner).zIndex) ||
        getComputedStyle(node).visibility !== "visible" ||
        node.inert
      )
        return false;
      const other = clippedBounds(node);
      return (
        other.width > 0 &&
        other.height > 0 &&
        other.left < rect.right &&
        other.right > rect.left &&
        other.top < rect.bottom &&
        other.bottom > rect.top
      );
    });
  const visible =
    rect.width > 1 &&
    rect.height > 1 &&
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.right <= innerWidth &&
    rect.bottom <= innerHeight &&
    clipped.width >= rect.width - 1 &&
    clipped.height >= rect.height - 1 &&
    getComputedStyle(element).visibility === "visible" &&
    !element.closest(
      '[hidden], [inert], [aria-hidden="true"], [data-pickup]',
    ) &&
    !overlay &&
    !covered;
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    visible: !!visible,
  };
}

/** One subscription follows existing placement geometry; never a placement store. */
export function observeBrowserPresentation(
  element: HTMLElement,
  changed: (frame: BrowserFrame) => void,
) {
  let previous = "",
    pending = 0;
  const measure = () => {
    const frame = browserPresentation(element),
      // Zoom/DPI can change even when an anchor's CSS bounds stay identical.
      // The native adapter reads root zoom and Electrobun applies monitor DPI.
      key = JSON.stringify([frame, window.devicePixelRatio]);
    if (key !== previous) {
      previous = key;
      changed(frame);
    }
  };
  const schedule = () => {
    if (!pending)
      pending = requestAnimationFrame(() => {
        pending = 0;
        measure();
      });
  };
  const resize = new ResizeObserver(schedule);
  resize.observe(element);
  const mutation = new MutationObserver(measure);
  mutation.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "style",
      "class",
      "hidden",
      "inert",
      "aria-hidden",
      "data-pickup",
      "data-native-overlay",
    ],
  });
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  window.visualViewport?.addEventListener("resize", schedule);
  // CSS transitions and physical pickup can change measured bounds without resize.
  const timer = setInterval(schedule, 100);
  schedule();
  return () => {
    clearInterval(timer);
    cancelAnimationFrame(pending);
    resize.disconnect();
    mutation.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule, true);
    window.visualViewport?.removeEventListener("resize", schedule);
  };
}

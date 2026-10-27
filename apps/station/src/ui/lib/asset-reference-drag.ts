export const ASSET_REFERENCE_DROP = "station:asset-reference-drop";
/** Reference gestures stay inside the trusted document. Windows OLE drag/drop
 * can deactivate a WebView2 controller; pointer ownership avoids that handoff.
 * Receivers still validate workspace identity and compatibility at commit. */
export function beginAssetReferenceDrag(event: PointerEvent, source: HTMLElement, reference: { workspaceId: string; assetId: string }) {
  event.preventDefault(); event.stopPropagation();
  const doc = source.ownerDocument, win = doc.defaultView!;
  let target: HTMLElement | null = null, moved = false, ended = false;
  const updateTarget = (next: HTMLElement | null) => {
    if (target === next) return;
    target?.removeAttribute("data-reference-hover"); target = next; target?.setAttribute("data-reference-hover", "");
  };
  const cleanup = () => {
    if (ended) return; ended = true;
    updateTarget(null); source.removeAttribute("data-reference-dragging");
    win.removeEventListener("pointermove", move, true); win.removeEventListener("pointerup", up, true);
    win.removeEventListener("pointercancel", cleanup, true); win.removeEventListener("blur", cleanup); win.removeEventListener("keydown", key, true);
  };
  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    if (!moved && Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) < 6) return;
    moved = true; next.preventDefault(); source.setAttribute("data-reference-dragging", "");
    updateTarget(doc.elementFromPoint(next.clientX, next.clientY)?.closest<HTMLElement>("[data-asset-reference-drop]") ?? null);
  };
  const up = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    const receiver = moved ? target : null; cleanup();
    if (receiver?.isConnected) receiver.dispatchEvent(new win.CustomEvent(ASSET_REFERENCE_DROP, { detail: reference }));
  };
  const key = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); next.stopImmediatePropagation(); cleanup(); } };
  win.addEventListener("pointermove", move, true); win.addEventListener("pointerup", up, true);
  win.addEventListener("pointercancel", cleanup, true); win.addEventListener("blur", cleanup); win.addEventListener("keydown", key, true);
  return cleanup;
}

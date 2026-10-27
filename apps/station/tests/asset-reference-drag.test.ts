import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { ASSET_REFERENCE_DROP, beginAssetReferenceDrag } from "../src/ui/lib/asset-reference-drag";

test("reference gestures need intentional movement and clear feedback after drop, cancel and disposal", () => {
  const win = new Window(), doc = win.document;
  const source = doc.createElement("span"), target = doc.createElement("div"), child = doc.createElement("button");
  target.setAttribute("data-asset-reference-drop", ""); target.append(child); doc.body.append(source, target);
  doc.elementFromPoint = () => child;
  const drops: unknown[] = []; target.addEventListener(ASSET_REFERENCE_DROP, e => drops.push((e as CustomEvent).detail));
  const begin = () => beginAssetReferenceDrag(new win.PointerEvent("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 }) as unknown as PointerEvent, source as unknown as HTMLElement, { workspaceId: "one", assetId: "builtin:clock" });
  const move = (x: number) => win.dispatchEvent(new win.PointerEvent("pointermove", { pointerId: 1, clientX: x, clientY: 0 }));
  const up = () => win.dispatchEvent(new win.PointerEvent("pointerup", { pointerId: 1 }));
  try {
    begin(); move(3); up(); expect(drops).toHaveLength(0);
    begin(); move(20); expect(target.hasAttribute("data-reference-hover")).toBe(true); up();
    expect(drops).toEqual([{ workspaceId: "one", assetId: "builtin:clock" }]);
    expect(target.hasAttribute("data-reference-hover")).toBe(false); expect(source.hasAttribute("data-reference-dragging")).toBe(false);
    begin(); move(20); win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" })); up(); expect(drops).toHaveLength(1);
    const dispose = begin(); move(20); dispose(); up(); expect(drops).toHaveLength(1); expect(target.hasAttribute("data-reference-hover")).toBe(false);
    begin(); move(20); target.remove(); up(); expect(drops).toHaveLength(1);
  } finally { win.happyDOM.abort(); }
});

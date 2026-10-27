import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { browserPresentation, observeBrowserPresentation } from "../src/ui/browser-presentation";

test("native presentation distinguishes asset listboxes from overlays and respects clipping/occlusion", () => {
  const dom = new Window();
  const keys = [
    "document",
    "getComputedStyle",
    "innerWidth",
    "innerHeight",
  ] as const;
  const previous = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  const setRect = (node: any, x = 100, y = 100, width = 400, height = 300) => {
    node.getBoundingClientRect = () => new dom.DOMRect(x, y, width, height);
  };
  try {
    Object.assign(globalThis, {
      document: dom.document,
      innerWidth: 1000,
      innerHeight: 800,
      getComputedStyle: (node: any) => ({
        visibility: node.style.visibility || "visible",
        display: "block",
        overflow: node.style.overflow || "visible",
        overflowX: "visible",
        overflowY: "visible",
        clipPath: "none",
        zIndex: node.style.zIndex || "0",
      }),
    });
    const owner = dom.document.createElement("div");
    owner.dataset.presentationOwner = "browser";
    owner.style.zIndex = "2";
    setRect(owner);
    const viewport = dom.document.createElement("div");
    setRect(viewport);
    owner.append(viewport);
    dom.document.body.append(owner);
    const listbox = dom.document.createElement("div");
    listbox.role = "listbox";
    setRect(listbox);
    dom.document.body.append(listbox);
    const visible = () =>
      browserPresentation(viewport as unknown as HTMLElement).visible;
    expect(visible()).toBe(true);
    const focused = dom.document.createElement("dialog");
    focused.setAttribute("open", "");
    focused.role = "dialog";
    setRect(focused, 0, 0, 1000, 800);
    dom.document.body.append(focused);
    focused.append(owner);
    expect(visible()).toBe(true);
    const focusedMenu = dom.document.createElement("div");
    focusedMenu.role = "menu";
    setRect(focusedMenu);
    focused.append(focusedMenu);
    expect(visible()).toBe(false);
    focusedMenu.remove();
    dom.document.body.append(owner);
    focused.remove();
    expect(visible()).toBe(true);
    const peek = dom.document.createElement("section");
    peek.dataset.nativeOverlay = "";
    peek.dataset.nativeOverlayOwner = "peek-owner";
    owner.dataset.presentationFloatRoot = "peek-owner";
    setRect(peek); dom.document.body.append(peek);
    expect(visible()).toBe(true); // Its own drawer chrome cannot occlude retained content.
    peek.dataset.nativeOverlayOwner = "other-owner";
    expect(visible()).toBe(false); // A different drawer retains the normal overlay mask.
    peek.remove(); delete owner.dataset.presentationFloatRoot;
    const menu = dom.document.createElement("div");
    menu.role = "menu";
    setRect(menu);
    dom.document.body.append(menu);
    expect(visible()).toBe(false);
    menu.hidden = true;
    expect(visible()).toBe(true);
    menu.remove();
    listbox.dataset.nativeOverlay = "";
    expect(visible()).toBe(false);
    delete listbox.dataset.nativeOverlay;
    expect(visible()).toBe(true);
    owner.inert = true;
    expect(visible()).toBe(false);
    owner.inert = false;
    owner.style.overflow = "hidden";
    setRect(owner, 100, 100, 200, 300);
    expect(visible()).toBe(false);
    setRect(owner);
    owner.style.overflow = "visible";
    const floating = dom.document.createElement("div");
    floating.dataset.presentationOwner = "floating";
    floating.style.zIndex = "100";
    setRect(floating, 300, 200, 400, 300);
    dom.document.body.append(floating);
    expect(visible()).toBe(false);
    floating.style.visibility = "hidden";
    expect(visible()).toBe(true);
    setRect(viewport, -20);
    expect(visible()).toBe(false);
  } finally {
    keys.forEach((key, i) => {
      const value = previous[i];
      if (value) Object.defineProperty(globalThis, key, value);
      else delete (globalThis as any)[key];
    });
    dom.happyDOM.abort();
  }
});

test("presentation renews unchanged CSS bounds after zoom and cancels pending observation on dispose", () => {
  const dom = new Window();
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  let tick!: () => void;
  let mutated!: () => void;
  const globals = {
    window: dom,
    document: dom.document,
    innerWidth: 1000, innerHeight: 800,
    getComputedStyle: () => ({ visibility: "visible", overflow: "visible", overflowX: "visible", overflowY: "visible", clipPath: "none" }),
    ResizeObserver: class { observe() {} disconnect() {} },
    MutationObserver: class { constructor(callback: () => void) { mutated = callback; } observe() {} disconnect() {} },
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; },
    cancelAnimationFrame: (id: number) => { frames.delete(id); },
    setInterval: (callback: () => void) => { tick = callback; return 1; },
    clearInterval: () => {},
  };
  const previous = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const flush = () => {
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(0);
  };
  try {
    Object.assign(globalThis, globals);
    const element = dom.document.createElement("div");
    element.getBoundingClientRect = () => new dom.DOMRect(100.25, 100.5, 400.25, 300.5);
    dom.document.body.append(element);
    const changes: unknown[] = [];
    const dispose = observeBrowserPresentation(element as unknown as HTMLElement, frame => changes.push(frame));
    flush();
    expect(changes).toHaveLength(1);
    Object.defineProperty(dom, "devicePixelRatio", { configurable: true, value: 1.25 });
    tick(); flush();
    expect(changes).toHaveLength(2);
    expect(changes[0]).toEqual(changes[1]);
    tick(); mutated();
    expect(frames.size).toBe(1);
    dispose();
    expect(frames.size).toBe(0);
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
    dom.happyDOM.abort();
  }
});

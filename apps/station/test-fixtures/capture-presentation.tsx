import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createStore } from "../src/features/workspace/application/store";

const dom = new Window({ url: "http://localhost:3000" });
const keys = ["window", "document", "navigator", "HTMLElement", "HTMLTextAreaElement", "Element", "Node", "Event", "CustomEvent", "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame"] as const;
const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "window" ? dom : (dom as any)[key] });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { QuickCapture } = await import("../src/ui/components/workspace/quick-capture");
afterAll(() => {
  for (const key of keys) { const descriptor = previous.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key]; }
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  dom.happyDOM.abort();
});

test("capture publishes its exact presentation identity only after a successful save and retains failed drafts", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} }), workspace = store.active();
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container), captured: unknown[] = [];
  const listen = (event: Event) => captured.push((event as CustomEvent).detail);
  window.addEventListener("station:capture-saved", listen);
  let fail = true, writes = 0;
  try {
    act(() => root.render(<QuickCapture workspace={workspace} panel={{ id: "capture", kind: "widget", widget: "quick-capture" }} onCapture={() => { if (fail) throw new Error("Source changed"); writes++; }} />));
    const input = container.querySelector("textarea")!;
    act(() => {
      Object.getOwnPropertyDescriptor(dom.HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Keep this idea");
      input.dispatchEvent(new dom.Event("input", { bubbles: true }));
    });
    act(() => container.querySelector("form")!.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true })));
    expect(captured).toEqual([]); expect(writes).toBe(0);
    expect(input.value).toBe("Keep this idea"); expect(container.textContent).toContain("Source changed");
    fail = false;
    act(() => container.querySelector("form")!.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true })));
    expect(writes).toBe(1); expect(captured).toEqual([{ panelId: "capture", workspaceId: workspace.id }]);
    expect(input.value).toBe("");
  } finally {
    window.removeEventListener("station:capture-saved", listen);
    act(() => root.unmount()); container.remove();
  }
});

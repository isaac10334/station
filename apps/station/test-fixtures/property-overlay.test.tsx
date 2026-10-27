import { expect, test, afterAll } from "bun:test";
import { Window } from "happy-dom";
const dom = new Window({ url: "http://localhost:3055" });
for (const key of [
  "window",
  "document",
  "navigator",
  "Element",
  "Node",
  "DocumentFragment",
  "ShadowRoot",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "getComputedStyle",
  "MutationObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: key === "window" ? dom : (dom as any)[key],
  });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
afterAll(() => dom.happyDOM.abort());
function mount(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
test("property overlays mount on demand, retain unsaved editor state and never save on dismissal", async () => {
  const { MorphingEditor } =
    await import("../src/ui/components/ui/morphing-editor");
  let writes = 0;
  const ui = mount(
    <MorphingEditor label="Contract draft" kind="JSON" preview="Original">
      <textarea aria-label="Retained draft" defaultValue="Original" />
      <button onClick={() => writes++}>Save contract</button>
    </MorphingEditor>,
  );
  try {
    expect(document.querySelector('[aria-label="Retained draft"]')).toBeNull();
    // Base UI establishes its floating root in an effect before the first press.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const trigger = ui.container.querySelector<HTMLButtonElement>(
      '[aria-label="Contract draft editor"]',
    )!;
    await act(async () => {
      trigger.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    for (
      let i = 0;
      i < 100 && !document.querySelector('[aria-label="Retained draft"]');
      i++
    )
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    const draft = document.querySelector<HTMLTextAreaElement>(
      '[aria-label="Retained draft"]',
    )!;
    expect(draft).not.toBeNull();
    draft.value = "Unsaved changes";
    const popup = draft.closest('[role="dialog"]')!;
    await act(async () => {
      popup.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    });
    expect(writes).toBe(0);
    await act(async () => {
      trigger.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(document.querySelector('[aria-label="Retained draft"]')).toBe(draft);
    expect(draft.value).toBe("Unsaved changes");
    await act(async () => {
      [...popup.querySelectorAll("button")]
        .find((button) => button.textContent === "Save contract")!
        .click();
    });
    expect(writes).toBe(1);
  } finally {
    ui.close();
  }
});

test("nested and pinned settings share column state and guide-line ordering", async () => {
  const { useState } = await import('react');
  const { DataViewSettings } = await import('../src/ui/components/workspace/data-view-settings');
  const { DEFAULT_DATA, viewConfigurationSchema } = await import('../src/core/data-sources');
  let saved = viewConfigurationSchema.parse({});
  function View() { const [config,setConfig]=useState(saved); return <DataViewSettings config={config} data={{...DEFAULT_DATA,sourceId:'source',revision:1,readOnly:false}} source={<span>Source picker</span>} change={patch=>setConfig(current=>{saved=viewConfigurationSchema.parse({...current,...patch});return saved;})}/>; }
  const ui=mount(<View/>);
  const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(el=>el.getAttribute('aria-label')===label||el.textContent?.trim()===label)!;
  const click=async(label:string)=>{await act(async()=>{button(label).click();await new Promise(resolve=>setTimeout(resolve,20));});};
  try {
    await click('View settings'); await click('Properties'); await click('Hide Amount');
    expect(saved.hiddenColumns).toEqual(['amount']); await click('Pin Properties');
    await click('Back to view settings'); await click('View settings'); await click('Properties');
    expect(document.querySelector('[aria-label="Properties settings"]')).not.toBeNull();
    expect(button('Show Amount')).toBeDefined();
    const row=(label:string)=>button(label).closest('[draggable]')!;
    const entries=new Map<string,string>(); const transfer={effectAllowed:'',setData:(type:string,value:string)=>entries.set(type,value),getData:(type:string)=>entries.get(type)??''};
    const drag=(el:Element,type:string)=>act(()=>{const event=new dom.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:transfer});el.dispatchEvent(event);});
    drag(row('Hide Status'),'dragstart');drag(row('Hide Name'),'dragover');
    expect((row('Hide Name') as HTMLElement).style.boxShadow).toContain('inset');
    drag(row('Hide Name'),'drop'); expect(saved.columnOrder).toEqual(['status','name','amount']);
    expect(saved.pinnedMenus).toEqual(['properties']); expect(saved.sortBy).toBeUndefined();
  } finally {ui.close();}
});

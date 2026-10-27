import { normalizeSvgEditSource, prepareSvgEditSource } from "../src/services/svg-edit-source";
import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { parseThemeColor } from "../src/core/theme-color";
import {
  DEFAULT_THEME,
  parseTheme,
  patchThemeSource,
  themeVariables,
} from "../src/core/theme-assets";
import { createStore } from "../src/features/workspace/application/store";
import { svgIconUrl } from "../src/services/svg-icons";
import { parsePropertyText } from "../src/core/property-editors";

const dom = new Window({ url: "http://localhost:3000" });
test("theme layout is bounded data and older assets retain valid renderer defaults", () => {
  const legacy = { ...DEFAULT_THEME, layout: undefined, colors: { ...DEFAULT_THEME.colors, sidebar: undefined } };
  const variables = themeVariables(parseTheme(JSON.stringify(legacy)));
  expect(variables["--sidebar"]).toBe(DEFAULT_THEME.colors.frame);
  expect(variables["--station-row-height"]).toBe("36px");
  expect(() => parseTheme(JSON.stringify({ ...DEFAULT_THEME, layout: { ...DEFAULT_THEME.layout, rowHeight: 500 } }))).toThrow();
  const edited = parseTheme(patchThemeSource(JSON.stringify(DEFAULT_THEME), current => ({ ...current, layout: { ...current.layout!, pageTitle: 40 } })));
  expect(themeVariables(edited)["--station-page-title"]).toBe("40px");
  expect(edited.colors).toEqual(DEFAULT_THEME.colors);
});
const globals = [
  "window",
  "document",
  "navigator",
  "Element",
  "Node",
  "DocumentFragment",
  "ShadowRoot",
  "HTMLElement",
  "HTMLTextAreaElement",
  "HTMLInputElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "CompositionEvent",
  "DOMParser",
  "XMLSerializer",
  "getComputedStyle",
  "MutationObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
] as const;
const prior = new Map(
  globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);
for (const key of globals)
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: key === "window" ? dom : (dom as any)[key],
  });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ThemeNumberField } =
  await import("../src/ui/components/workspace/theme-number-field");
const { SettledInput } = await import("../src/ui/components/ui/settled-input");
const { ColorPickerPanel, rgbToHsv } =
  await import("../src/ui/components/ui/color-picker");
const { PropertyEditor } = await import("../src/ui/components/ui/property-editor");
const { ShellDefinitionField } = await import("../src/ui/components/workspace/shell-definition-field");
const { ASSET_REFERENCE_DROP } = await import("../src/ui/lib/asset-reference-drag");
afterAll(() => {
  for (const key of globals) {
    const descriptor = prior.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as any)[key];
  }
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  dom.happyDOM.abort();
});
function mount(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    render: (next: React.ReactNode) => act(() => root.render(next)),
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}
function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      dom.HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new dom.Event("input", { bubbles: true }) as any);
  });
}
function key(input: HTMLInputElement, key: string, isComposing = false) {
  act(() =>
    input.dispatchEvent(
      new dom.KeyboardEvent("keydown", {
        key,
        bubbles: true,
        isComposing,
      }) as any,
    ),
  );
}

test("reference properties reject foreign/incompatible drops and preserve the source after async denial", async () => {
  let rejectSave!: (reason: Error) => void;
  const commits: unknown[] = [];
  const mounted = mount(<PropertyEditor field={{ key: "source", label: "Source", type: "asset", required: true }}
    value={{ assetId: "original" }} reference={{ workspaceId: "one", options: [
      { assetId: "original", label: "Original" }, { assetId: "replacement", label: "Replacement" },
      { assetId: "blocked", label: "Blocked", error: "Incompatible" },
    ] }} onCommit={value => { commits.push(value); return new Promise<void>((_, reject) => { rejectSave = reject; }); }} />);
  const drop = mounted.container.querySelector("[data-asset-reference-drop]")!;
  const send = (workspaceId: string, assetId: string) => act(() => {
    drop.dispatchEvent(new dom.CustomEvent(ASSET_REFERENCE_DROP, { detail: { workspaceId, assetId } }) as any);
  });
  try {
    expect(mounted.container.querySelector('[aria-label="Clear Source"]')).toBeNull();
    send("other", "replacement"); send("one", "blocked"); send("one", "missing");
    expect(commits).toHaveLength(0);
    expect(mounted.container.textContent).toContain("compatible asset from this workspace");
    send("one", "replacement"); send("one", "original");
    expect(commits).toEqual([{ assetId: "replacement" }]);
    expect(drop.getAttribute("aria-busy")).toBe("true");
    await act(async () => { rejectSave(new Error("Source changed; retry against current revision.")); });
    expect(drop.hasAttribute("aria-busy")).toBe(false);
    expect(mounted.container.textContent).toContain("Original");
    expect(mounted.container.querySelector('[role="alert"]')?.textContent).toContain("Source changed");
    expect(mounted.container.querySelector('[aria-label="Choose Source"]')?.hasAttribute("disabled")).toBe(false);
  } finally { mounted.close(); }
});

test("read-only reference properties never accept drop gestures", () => {
  const mounted = mount(<PropertyEditor field={{ key: "source", label: "Source", type: "asset", readOnly: true }}
    value={{ assetId: "original" }} reference={{ workspaceId: "one", options: [{ assetId: "original", label: "Original" }] }}
    onCommit={() => { throw new Error("Read-only reference wrote"); }} />);
  try { expect(mounted.container.querySelector("[data-asset-reference-drop]")).toBeNull(); }
  finally { mounted.close(); }
});

test("root shell properties await their owner and expose rejected async changes without replacing the reference", async () => {
  const commands: unknown[] = [];
  const mounted = mount(<ShellDefinitionField workspace={{ id: "one", assets: [] }} definitionId="builtin:app-shell"
    onChange={async command => { commands.push(command); throw new Error("Root changed in another session"); }} />);
  try {
    await act(async () => { mounted.container.querySelector("[data-asset-reference-drop]")!.dispatchEvent(
      new dom.CustomEvent(ASSET_REFERENCE_DROP, { detail: { workspaceId: "one", assetId: "builtin:desktop-shell" } }) as any,
    ); });
    expect(commands).toEqual([{ type: "setRootWidget", widget: "desktop-shell", definitionId: "builtin:desktop-shell", slots: [] }]);
    expect(mounted.container.textContent).toContain("App shell");
    expect(mounted.container.querySelector('[role="alert"]')?.textContent).toContain("Root changed in another session");
    expect(mounted.container.querySelector('[aria-label="Clear Root layout"]')).toBeNull();
  } finally { mounted.close(); }
});

test("document fields preserve whitespace and asynchronous denial retains an editable draft", async () => {
  let reject!: (reason: Error) => void;
  const writes: string[] = [];
  const ui = mount(<SettledInput label="Document" value="Original" trim={false} validate={() => undefined} onCommit={value => {
    writes.push(value); return new Promise<void>((_, fail) => { reject = fail; });
  }} />);
  try {
    const input = ui.container.querySelector("input")!;
    act(() => input.focus()); type(input, "  indented text  "); key(input, "Enter");
    expect(writes).toEqual(["  indented text  "]); expect(input.disabled).toBe(true);
    await act(async () => { reject(new Error("Revision changed")); await Promise.resolve(); });
    expect(input.value).toBe("  indented text  "); expect(input.disabled).toBe(false);
    expect(ui.container.textContent).toContain("Revision changed");
    key(input, "Escape"); expect(input.value).toBe("Original");
  } finally { ui.close(); }
});

test("typed numbers preserve null, zero, exponents and authored text without coercing malformed drafts", () => {
  const field = { key:"amount",label:"Amount",type:"number" as const };
  expect(parsePropertyText(field," ")).toBeNull(); expect(parsePropertyText(field,"0")).toBe(0);
  expect(parsePropertyText(field,"1e2")).toBe(100);
  for(const value of ["0x20","Infinity","NaN","1e","-","."])expect(()=>parsePropertyText(field,value)).toThrow();
  expect(parsePropertyText({key:"note",label:"Note",type:"text"},"  note\n")).toBe("  note\n");
});

test("spacing clears/retypes naturally, retains external edits, rejects partials, restores latest source", () => {
  const writes: number[] = [];
  const view = (value: number) => (
    <ThemeNumberField
      label="Spacing"
      value={value}
      min={4}
      max={24}
      onCommit={(n) => writes.push(n)}
    />
  );
  const ui = mount(view(8));
  const input = ui.container.querySelector("input")!;
  act(() => input.focus());
  type(input, "");
  expect(input.value).toBe("");
  type(input, "1");
  type(input, "12");
  expect(writes).toEqual([]);
  ui.render(view(10));
  expect(input.value).toBe("12");
  key(input, "Enter");
  expect(writes).toEqual([12]);
  for (const partial of ["", "-", ".", "0x12", "25", "NaN"]) {
    type(input, partial);
    key(input, "Enter");
    expect(input.value).toBe(partial);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  }
  ui.render(view(16));
  key(input, "Escape");
  expect(input.value).toBe("16");
  key(input, "ArrowUp");
  expect(input.value).toBe("17");
  expect(writes).toEqual([12]);
  key(input, "Enter");
  expect(writes).toEqual([12, 17]);
  type(input, "12.5");
  key(input, "Enter", true);
  expect(writes).toEqual([12, 17]);
  act(() =>
    input.dispatchEvent(
      new dom.CompositionEvent("compositionstart", { bubbles: true }) as any,
    ),
  );
  key(input, "Enter");
  expect(writes).toEqual([12, 17]);
  act(() =>
    input.dispatchEvent(
      new dom.CompositionEvent("compositionend", { bubbles: true }) as any,
    ),
  );
  act(() => input.blur());
  expect(writes).toEqual([12, 17, 12.5]);
  ui.close();
});

test("unmodified focus cannot overwrite a newer source; failed writes preserve draft", () => {
  const writes: number[] = [];
  const view = (value: number, fail = false) => (
    <ThemeNumberField
      label="Radius"
      value={value}
      min={0}
      max={24}
      onCommit={(n) => {
        if (fail) throw new Error("Viewing only");
        writes.push(n);
      }}
    />
  );
  const ui = mount(view(8));
  const input = ui.container.querySelector("input")!;
  act(() => input.focus());
  ui.render(view(12));
  expect(input.value).toBe("8");
  act(() => input.blur());
  expect(writes).toEqual([]);
  expect(input.value).toBe("12");
  act(() => input.focus());
  type(input, "14");
  ui.render(view(12, true));
  key(input, "Enter");
  expect(input.value).toBe("14");
  expect(ui.container.textContent).toContain("Viewing only");
  ui.close();
});

test("color text and RGB/HSL/alpha channels write only settled valid drafts", () => {
  const writes: string[] = [];
  const ui = mount(
    <ColorPickerPanel
      defaultValue="#112233"
      onValueChange={(c) => writes.push(c)}
    />,
  );
  const field = () =>
    ui.container.querySelector<HTMLInputElement>(
      'input[aria-label="Color value"]',
    )!;
  act(() => field().focus());
  type(field(), "#");
  type(field(), "#12");
  expect(writes).toEqual([]);
  key(field(), "Enter");
  expect(field().value).toBe("#12");
  expect(writes).toEqual([]);
  type(field(), "oklch(62% 0.12 240 / 50%)");
  key(field(), "Enter");
  expect(writes).toEqual(["oklch(62% 0.12 240 / 50%)"]);
  expect(field().value).toBe(writes[0]);
  act(() =>
    ui.container
      .querySelector<HTMLButtonElement>('button[aria-label^="Color format"]')!
      .click(),
  );
  const red = ui.container.querySelector<HTMLInputElement>(
    'input[aria-label="Red"]',
  )!;
  act(() => red.focus());
  type(red, "");
  type(red, "12");
  expect(writes.length).toBe(1);
  key(red, "Enter");
  expect(writes.length).toBe(2);
  expect(parseThemeColor(writes[1])!.r).toBe(12);
  const alpha = ui.container.querySelector<HTMLInputElement>(
    'input[aria-label="Opacity (%)"]',
  )!;
  act(() => alpha.focus());
  type(alpha, "-");
  key(alpha, "Enter");
  expect(writes.length).toBe(2);
  type(alpha, "25.5");
  key(alpha, "Enter");
  expect(parseThemeColor(writes.at(-1)!)!.a).toBeCloseTo(0.255, 2);
  ui.close();
});

test("theme color grammar validates all channels and preserves hue through gray and black", () => {
  for (const color of [
    "#abc",
    "#abcd",
    "#11223344",
    "rgb(100% 0% 0% / 25%)",
    "rgba(255, 0, 0, .5)",
    "hsl(.5turn 100% 50% / .5)",
    "hsla(180,100%,50%,.5)",
    "oklch(62% .12 240 / 50%)",
  ]) {
    expect(parseThemeColor(color)).not.toBeNull();
    expect(() =>
      parseTheme(
        JSON.stringify({
          ...DEFAULT_THEME,
          colors: { ...DEFAULT_THEME.colors, frame: color },
        }),
      ),
    ).not.toThrow();
  }
  for (const color of [
    "rgb(1 2 3 / NaN)",
    "rgb(1 2)",
    "rgb(1 2 3 4 5)",
    "rgb(1x 2 3)",
    "hsl(20 20 20)",
    "oklch(50% .2)",
    "var(--fg)",
    "url(https://bad)",
    "red; color: blue",
  ])
    expect(parseThemeColor(color)).toBeNull();
  expect(parseThemeColor("hsl(.5turn 100% 50%)")).toEqual({
    r: 0,
    g: 255,
    b: 255,
    a: 1,
  });
  const oklch = parseThemeColor("oklch(62% .12 240 / 50%)")!;
  expect(oklch.r).toBeCloseTo(51, 0);
  expect(oklch.g).toBeCloseTo(143, 0);
  expect(oklch.b).toBeCloseTo(199, 0);
  expect(oklch.a).toBe(0.5);
  const prev = { h: 240, s: 0.8, v: 0.5, a: 1 };
  expect(rgbToHsv({ r: 80, g: 80, b: 80, a: 1 }, prev).h).toBe(240);
  expect(rgbToHsv({ r: 0, g: 0, b: 0, a: 1 }, prev).s).toBe(0.8);
});

test("rapid token patches rebase on current JSON and refuse invalid Code source", () => {
  let source = JSON.stringify(DEFAULT_THEME);
  source = patchThemeSource(source, (t) => ({ ...t, radius: 12 }));
  for (let i = 0; i < 100; i++)
    source = patchThemeSource(source, (t) => ({
      ...t,
      colors: { ...t.colors, frame: `rgb(${i} 20 30 / .5)` },
    }));
  const next = parseTheme(source);
  expect(next.radius).toBe(12);
  expect(next.colors.fg).toBe(DEFAULT_THEME.colors.fg);
  expect(() => patchThemeSource("{", (t) => ({ ...t, radius: 4 }))).toThrow();
});

test("SVG rejects unsafe resources and recovers after source repair", () => {
  const safe =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1 1h14v14H1z"/></svg>';
  expect(svgIconUrl(safe)).toStartWith("data:image/svg+xml,");
  for (const source of [
    safe.replace("<path", "<script>alert(1)</script><path"),
    safe.replace('d="M1', 'onclick="run()" d="M1'),
    safe.replace('d="M1', 'fill="url(https://bad)" d="M1'),
    safe.replace("<path", "<foreignObject/><path"),
    safe.replace("<path", "<animate/><path"),
    "missing",
  ])
    expect(() => svgIconUrl(source)).toThrow();
});

test("resource viewer policy denies editor-session store mutations while allowing private copies", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} });
  const id = store.createDataAsset("theme", "Shared theme");
  const local = store.createDataAsset("theme", "Private theme");
  store.setSourceAccess(store.active().id, false, [id]);
  expect(() => store.editFile(id, "theme.json", "{}")).toThrow("viewing only");
  expect(() => store.renameFile(id, "theme.json", "old.json")).toThrow(
    "viewing only",
  );
  expect(() => store.removeFile(id, "theme.json")).toThrow("viewing only");
  expect(() =>
    store.editFile(local, "theme.json", JSON.stringify(DEFAULT_THEME)),
  ).not.toThrow();
});

test("every picker channel preserves incomplete decimals, IME and Escape without writes", () => {
  const writes: string[] = [];
  const ui = mount(
    <ColorPickerPanel
      defaultValue="#2255AA80"
      onValueChange={(c) => writes.push(c)}
    />,
  );
  const switchFormat = () =>
    act(() =>
      ui.container
        .querySelector<HTMLButtonElement>('button[aria-label^="Color format"]')!
        .click(),
    );
  for (const format of ["rgb", "hsl"]) {
    switchFormat();
    const fields = Array.from(
      ui.container.querySelectorAll<HTMLInputElement>("input[aria-invalid]"),
    );
    for (const field of fields) {
      act(() => field.focus());
      const original = field.value;
      for (const partial of ["", "-", ".", "-.5"]) {
        type(field, partial);
        expect(field.value).toBe(partial);
        expect(writes).toEqual([]);
      }
      key(field, "Enter");
      expect(field.getAttribute("aria-invalid")).toBe("true");
      key(field, "Escape");
      expect(field.value).toBe(original);
      type(field, "12.5");
      key(field, "Enter", true);
      expect(writes).toEqual([]);
      key(field, "Escape");
      act(() => field.blur());
    }
  }
  ui.close();
});

test("a denied channel commit retains its draft with an actionable error", () => {
  const ui = mount(
    <ColorPickerPanel
      defaultValue="#2255AA"
      onValueChange={() => {
        throw new Error("Viewing only");
      }}
    />,
  );
  act(() =>
    ui.container
      .querySelector<HTMLButtonElement>('button[aria-label^="Color format"]')!
      .click(),
  );
  const field = ui.container.querySelector<HTMLInputElement>(
    'input[aria-label="Red"]',
  )!;
  act(() => field.focus());
  type(field, "12");
  key(field, "Enter");
  expect(field.value).toBe("12");
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(ui.container.textContent).toContain("Restore edit access");
  ui.close();
});


test("SVG-Edit metadata is normalized while executable and authored CSS remain rejected", () => {
  const source=normalizeSvgEditSource('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g class="layer" style="pointer-events: all;"><title style="pointer-events: inherit;">Layer 1</title><rect x="1" y="2" width="3" height="4" fill="#336699"/></g></svg>');
  expect(source).toContain('width="3"');expect(source).not.toContain('class=');expect(source).not.toContain('style=');
  expect(()=>normalizeSvgEditSource('<svg xmlns="http://www.w3.org/2000/svg"><g class="layer" onclick="alert(1)"/></svg>')).toThrow();
  expect(()=>normalizeSvgEditSource('<svg xmlns="http://www.w3.org/2000/svg"><g style="background:url(https://example.com)"/></svg>')).toThrow();
});

test("SVG transport stays ready after invalid initial source so repaired source can reload", async () => {
  const { SvgEditCanvas } = await import("../src/ui/components/workspace/svg-edit-canvas");
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const render = (source: string) => act(() => root.render(<SvgEditCanvas source={source} editable onCommit={() => {}} />));
  render("<svg broken");
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  for (let i = 0; i < 100 && !container.querySelector("iframe"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  const frame = container.querySelector("iframe")!;
  expect(frame).not.toBeNull();
  const receive = (action: string) => act(() => window.dispatchEvent(new dom.MessageEvent("message", { source: frame.contentWindow, origin: "null", data: { type: "station:svg-edit", action } }) as unknown as MessageEvent));
  receive("ready");
  const button = (name: string) => [...container.querySelectorAll("button")].find(button => button.textContent === name)!;
  expect(container.textContent).toContain("Invalid SVG");
  expect(button("Reload saved source").disabled).toBe(false);
  expect(button("Apply drawing").disabled).toBe(true);
  render('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle r="4"/></svg>');
  act(() => button("Reload saved source").click());
  receive("loaded");
  expect(button("Apply drawing").disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  render('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle r="5"/></svg>');
  expect(button("Apply drawing").disabled).toBe(true);
  expect(container.textContent).toContain("Saved source changed");
  act(() => button("Reload saved source").click());
  expect(button("Apply drawing").disabled).toBe(true);
  receive("loaded");
  expect(button("Apply drawing").disabled).toBe(false);
  expect(container.textContent).not.toContain("Saved source changed");
  act(() => root.unmount()); container.remove();
});

test("built-in icons are validated immutable SVG source assets that can be referenced explicitly", async () => {
  const { builtinIconAssets, isBuiltinIconAsset } = await import("../src/core/builtin-icons");
  for (const asset of builtinIconAssets()) {
    expect(isBuiltinIconAsset(asset.id)).toBe(true);
    expect(svgIconUrl(asset.files["image.svg"])).toStartWith("data:image/svg+xml,");
  }
  expect(parseTheme(JSON.stringify({ ...DEFAULT_THEME, icons: { Plus: { assetId: "builtin:icon:Check", path: "image.svg" } } })).icons?.Plus.assetId).toBe("builtin:icon:Check");
});

test("SVG-Edit import preserves root fill/stroke inheritance instead of losing icon appearance", () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 3v10"/></svg>';
  const prepared = prepareSvgEditSource(source);
  const doc = new DOMParser().parseFromString(prepared, "image/svg+xml");
  expect(doc.documentElement.hasAttribute("stroke")).toBe(false);
  expect(doc.querySelector("g")?.getAttribute("stroke")).toBe("currentColor");
  expect(doc.querySelector("g")?.getAttribute("fill")).toBe("none");
  expect(doc.querySelector("g")?.getAttribute("stroke-linecap")).toBe("round");
  expect(normalizeSvgEditSource(prepared)).toContain('stroke="currentColor"');
  expect(() => prepareSvgEditSource('<svg xmlns="http://www.w3.org/2000/svg" onclick="alert(1)"/>')).toThrow();
});

test("semantic tree drag transports its real payload and commits a validated child move", async () => {
  const { SurfaceDefinitionEditor } = await import("../src/ui/components/workspace/surface-definition-editor");
  const { BUILTIN_AUTHORED_SURFACES } = await import("../src/core/authored-surface");
  const { editSurface } = await import("../src/core/surface-authoring");
  const original = BUILTIN_AUTHORED_SURFACES.clock;
  const source = editSurface(original, "root", { children: [...original.frame.root.children!, { type: "row", key: "target", children: [] }] });
  let result = source;
  const ui = mount(<SurfaceDefinitionEditor surface={source} readOnly={false} onChange={next => { result = next; }} />);
  const entries = new Map<string, string>();
  const transfer = { effectAllowed: "", dropEffect: "", types: [] as string[], setData(type: string, value: string) { entries.set(type, value); this.types = [...entries.keys()]; }, getData: (type: string) => entries.get(type) ?? "" };
  const drag = (element: Element, type: string) => {
    const event = new dom.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    act(() => element.dispatchEvent(event));
    return event;
  };
  const from = ui.container.querySelector('[data-tree-id="date"]')!, target = ui.container.querySelector('[data-tree-id="target"]')!;
  expect(from.getAttribute("draggable")).toBe("true");
  drag(from, "dragstart");
  expect(transfer.types).toContain("application/x-station-element");
  expect(drag(target, "dragover").defaultPrevented).toBe(true);
  drag(target, "drop");
  expect(result.frame.root.children?.some(node => node.key === "date")).toBe(false);
  expect(result.frame.root.children?.find(node => node.key === "target")?.children?.[0].key).toBe("date");
  expect(original.frame.root.children?.[0].key).toBe("date");
  ui.close();
});

test("authored palette completes page and hover tokens independently of the selected mode", () => {
  for (const mode of ["dark", "light"] as const) {
    const vars = themeVariables({ ...DEFAULT_THEME, mode });
    expect(vars["--page"]).toBe(DEFAULT_THEME.colors.frame);
    expect(vars["--hover"]).toBe(DEFAULT_THEME.colors.selected);
    expect(vars["--fg"]).toBe(DEFAULT_THEME.colors.fg);
  }
});


test("VectorCraft static export accepts miter limits without admitting active SVG content", () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g data-name="Layer 1"><path d="M24 24h48v32H24z" fill="#6366f1" stroke="#000000" stroke-width="1" stroke-miterlimit="10"/></g></svg>';
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  document.querySelector("g")!.removeAttribute("data-name");
  const normalized = normalizeSvgEditSource(new XMLSerializer().serializeToString(document));
  expect(svgIconUrl(normalized)).toStartWith("data:image/svg+xml,");
  expect(() => svgIconUrl(normalized.replace('stroke-miterlimit="10"', 'onload="alert(1)"'))).toThrow();
});

test("property overlay retains drafts in an isolated DOM realm", () => {
  // SSR tests import Base UI before a DOM exists. Keep browser globals and its
  // module-level environment detection in one realm, as in the browser bundle.
  const result = Bun.spawnSync([process.execPath, "test", "apps/station/test-fixtures/property-overlay.test.tsx"], { cwd: new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") });
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
});

test("Markdown properties stay compact in editable and read-only inspectors without mounting a rich editor", async () => {
  const { PropertyEditor } = await import("../src/ui/components/ui/property-editor");
  for (const readOnly of [false, true]) {
    const ui = mount(<PropertyEditor field={{ key: "body", label: "Compact description", type: "markdown" }} value="**A short note**" readOnly={readOnly} onCommit={() => { throw new Error("Unexpected save"); }} />);
    try {
      expect(ui.container.querySelector('[aria-label="Compact description editor"]')?.textContent).toContain("A short note");
      expect(ui.container.querySelector('.bn-editor')).toBeNull();
      expect(ui.container.querySelector('[role="toolbar"]')).toBeNull();
    } finally { ui.close(); }
  }
});

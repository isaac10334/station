import { expect, test } from "bun:test";
import { BUILTIN_AUTHORED_SURFACES } from "../src/core/authored-surface";
import { renderToStaticMarkup } from "react-dom/server";

test("inert authored previews contain no nested interactive controls or event wiring", () => {
  const markup = renderToStaticMarkup(<button><PortableSurface preview frame={BUILTIN_AUTHORED_SURFACES["action-button"].frame} onEvent={() => { throw new Error("Preview executed"); }} /></button>);
  expect(markup.match(/<button/g)).toHaveLength(1);
  expect(markup).not.toContain("<input");
});
import {
  RecordingSurface,
  validateFrame,
  createElementRegistry,
  defineElement,
  elementProperties,
  type UiFrame,
} from "@loop-kit/ui";
import {
  PortableSurface,
  stationElementAdapters,
} from "../src/ui/components/workspace/portable-surface";
import {
  SemanticIcon,
  resolveIcon,
  type IconResolution,
} from "../src/ui/semantic-icons";
import { SemanticThemeContext } from "../src/ui/semantic-theme";
import {
  semanticTheme,
  semanticTokenVariables,
} from "../src/core/semantic-theme";
import { DEFAULT_THEME, parseTheme } from "../src/core/theme-assets";
import {
  shellActions,
  createActionRouter,
} from "../src/features/shell/application/actions";
import { createPaletteController } from "../src/features/shell/application/palette";
import { createStore } from "../src/features/workspace/application/store";
import { PropertyInspector } from "../src/ui/components/ui/property-inspector";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { controlledDockCommand } from "../src/core/station-control";

import { semanticProofFrame as frame } from "./fixtures/semantic-definition";

test("the actual DOM adapter and independent recording adapter consume identical validated definitions", async () => {
  const recording = new RecordingSurface();
  recording.render(frame);
  const html = renderToStaticMarkup(
    <PortableSurface frame={frame} onEvent={() => {}} />,
  );
  expect(recording.frame).toEqual(validateFrame(frame));
  for (const content of [
    "Semantic proof",
    "Run proof",
    "Station",
    "Local machine",
    'role="listbox"',
    'aria-selected="true"',
  ])
    expect(html).toContain(content);
  recording.event({
    revision: 0,
    sequence: 1,
    key: "rows",
    type: "select",
    value: "remote",
  });
  expect((await recording.nextEvent())?.value).toBe("remote");
  expect(() =>
    recording.event({
      revision: 0,
      sequence: 2,
      key: "rows",
      type: "select",
      value: "missing",
    }),
  ).toThrow();
  recording.dispose();
});
test("trusted React extension requires both a registered semantic definition and host renderer", () => {
  const badge = defineElement({
    id: "station:status/v1",
    properties: { text: { type: "string", default: "Ready" } },
    children: { max: 0 },
    events: [],
    accessibility: { labelRequired: false, role: "status" },
  });
  const registry = createElementRegistry([badge.definition]),
    frame = { revision: 0, root: badge.node("status", {}) };
  const Status = ({ node }: { node: UiFrame["root"] }) => (
    <output>{String(elementProperties(node, registry).text)}</output>
  );
  expect(() =>
    renderToStaticMarkup(
      <PortableSurface frame={frame} registry={registry} onEvent={() => {}} />,
    ),
  ).toThrow("Missing host renderer");
  expect(
    renderToStaticMarkup(
      <PortableSurface
        frame={frame}
        registry={registry}
        adapters={{ ...stationElementAdapters, [badge.definition.id]: Status }}
        onEvent={() => {}}
      />,
    ),
  ).toContain("Ready");
});
test("icons resolve explicit theme, asset and registered provider inputs with accessible semantics", () => {
  const inputs: IconResolution = {
    symbols: { Play: "data:image/svg+xml,play" },
    asset: (id, path) =>
      id === "a" && path === "run.svg" ? "data:image/svg+xml,asset" : undefined,
    providers: { test: () => "data:image/svg+xml,provider" },
  };
  expect(resolveIcon({ kind: "symbol", name: "Play" }, inputs)).toEqual({
    kind: "image",
    url: inputs.symbols.Play!,
  });
  expect(
    resolveIcon({ kind: "svg", assetId: "a", path: "run.svg" }, inputs).kind,
  ).toBe("image");
  expect(
    resolveIcon({ kind: "provider", provider: "test", name: "run" }, inputs)
      .kind,
  ).toBe("image");
  expect(
    resolveIcon({ kind: "provider", provider: "missing", name: "run" }, inputs)
      .kind,
  ).toBe("missing");
  expect(resolveIcon({ kind: "symbol", name: "Missing" }, inputs).kind).toBe(
    "missing",
  );
  expect(
    resolveIcon(
      { kind: "symbol", name: "Play" },
      { ...inputs, symbols: { Play: "https://remote" } },
    ),
  ).toEqual({ kind: "symbol", name: "Play" });
  const html = renderToStaticMarkup(
    <SemanticIcon
      icon={{
        kind: "symbol",
        name: "Play",
        role: "image",
        label: "Play",
        size: "large",
      }}
      inputs={{ ...inputs, symbols: {} }}
    />,
  );
  expect(html).toContain('aria-label="Play"');
  expect(html).not.toContain('aria-hidden="true"');
  expect(html).toContain('width="20"');
});
test("explicit light/dark/system and validated asset tokens reach the DOM adapter", () => {
  const dark = semanticTheme({ preference: "system", systemDark: true }),
    light = semanticTheme({ preference: "system", systemDark: false });
  expect(dark.mode).toBe("dark");
  expect(light.mode).toBe("light");
  expect(dark.color.text).not.toBe(light.color.text);
  const asset = parseTheme(
    JSON.stringify({
      ...DEFAULT_THEME,
      colors: { ...DEFAULT_THEME.colors, focus: "#123456" },
    }),
  );
  const tokens = semanticTheme({
    preference: "light",
    systemDark: false,
    asset,
  });
  expect(tokens.color.focus).toBe("#123456");
  expect(semanticTokenVariables(tokens)["--focus-ring"]).toBe("#123456");
  expect(
    renderToStaticMarkup(
      <SemanticThemeContext.Provider value={light}>
        <PortableSurface frame={frame} onEvent={() => {}} />
      </SemanticThemeContext.Provider>,
    ),
  ).toContain('data-theme="light"');
});
test("shell metadata is serializable, icons resolve, application routes retain denial and palette state is observable", () => {
  const store = createStore({ getItem: () => null, setItem: () => {} }),
    groups = shellActions(store.active());
  expect(JSON.parse(JSON.stringify(groups))).toEqual(groups);
  const inputs: IconResolution = {
    symbols: {},
    asset: () => undefined,
    providers: {},
  };
  for (const action of groups.flatMap((group) => group.items))
    if (action.icon)
      expect(resolveIcon(action.icon, inputs).kind).toBe("symbol");
  for (const action of groups.flatMap((group) => group.items))
    if (
      action.invocation.kind === "command" &&
      action.invocation.id === "dock.apply"
    )
      expect(
        controlledDockCommand.safeParse(action.invocation.params).success,
      ).toBe(true);
  const action = groups
    .flatMap((group) => group.items)
    .find((action) => action.id === "sidebar-visibility")!;
  const invoke = createActionRouter({
    condition: () => true,
    command: () => {
      throw new Error("permission denied");
    },
    shell: () => {
      throw new Error("wrong route");
    },
  });
  expect(() => invoke(action)).toThrow("permission denied");
  const palette = createPaletteController();
  let count = 0;
  palette.subscribe(() => count++);
  palette.dispatch({ type: "open", query: "> settings" });
  expect(palette.getSnapshot()).toEqual({ open: true, query: "> settings" });
  expect(count).toBe(1);
  palette.dispatch({ type: "close" });
  expect(palette.getSnapshot().open).toBe(false);
  palette.dispose();
});
test("property inspector resolves typed field references without serializing React values", () => {
  const html = renderToStaticMarkup(
    <PropertyInspector
      fields={[{ key: "name", label: "Name", type: "string", maxLength: 80 }]}
      value={{ name: "Station" }}
      readOnly
      onCommit={() => {
        throw new Error("read only");
      }}
    />,
  );
  expect(html).toContain('data-value-source="inspected"');
  expect(html).toContain("Station");
});
test("shared metadata/controller contracts stay React-free and migrated surfaces consume shared descriptors", async () => {
  for (const path of ["actions.ts", "action-controller.ts", "palette.ts"]) {
    const text = await readFile(
        new URL(`../src/features/shell/application/${path}`, import.meta.url),
        "utf8",
      ),
      source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        expect(node.moduleSpecifier.text).not.toMatch(/react|ui\/|composition/);
      if (ts.isTypeReferenceNode(node))
        expect(node.typeName.getText(source)).not.toMatch(
          /ReactNode|ReactElement/,
        );
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const app = await readFile(
    new URL("../src/ui/workspace-app.tsx", import.meta.url),
    "utf8",
  );
  expect(app).toContain("shellActions(workspace)");
  expect(app).toContain("onAction={invoke}");
  expect(app).toMatch(/useSyncExternalStore\(\s*palette.subscribe/);
});

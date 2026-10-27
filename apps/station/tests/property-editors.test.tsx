import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parsePropertyReference } from "../src/core/property-editors";
import {
  PropertyEditor,
  PropertyEditorsProvider,
  type PropertyEditorProps,
} from "../src/ui/components/ui/property-editor";
import {
  DEFAULT_THEME,
  parseTheme,
  themeVariables,
} from "../src/core/theme-assets";

test("reference properties preserve identity and subresources while rejecting malformed or cleared required values", () => {
  const field = { key: "source", label: "Source", type: "asset" as const };
  expect(parsePropertyReference(field, null)).toBeUndefined();
  expect(parsePropertyReference(field, { assetId: "stable-id", path: "" })).toEqual({ assetId: "stable-id", path: "" });
  expect(() => parsePropertyReference({ ...field, required: true }, undefined)).toThrow("Source is required");
  for (const value of ["stable-id", { assetId: "" }, { assetId: "id", authority: true }])
    expect(() => parsePropertyReference(field, value)).toThrow("valid Source reference");
});

test("scoped references display source labels without edit or open controls in read-only mode", () => {
  const markup = renderToStaticMarkup(<PropertyEditor field={{ key: "source", label: "Source", type: "asset" }}
    reference={{ workspaceId: "one", options: [{ assetId: "id", label: "Renamed source" }], onOpen: () => { throw new Error("Opened read-only reference"); } }}
    value={{ assetId: "id" }} readOnly onCommit={() => { throw new Error("Wrote read-only reference"); }} />);
  expect(markup).toContain("Renamed source");
  expect(markup).not.toContain("<button");
});

test("scoped editor recipes select only compatible host widgets and preserve read-only intent", () => {
  const Rating = ({ value, readOnly }: PropertyEditorProps) => (
    <output data-editor="rating" data-readonly={readOnly}>
      {String(value)} stars
    </output>
  );
  const render = (type: "number" | "text", editor: string) =>
    renderToStaticMarkup(
      <PropertyEditorsProvider
        editors={[{ id: "rating", types: ["number"], component: Rating }]}
      >
        <PropertyEditor
          field={{ key: "rating", label: "Rating", type, editor }}
          value={4}
          readOnly
          onCommit={() => {
            throw new Error("Read-only editor wrote");
          }}
        />
      </PropertyEditorsProvider>,
    );
  expect(render("number", "rating")).toContain('data-readonly="true"');
  expect(render("number", "rating")).toContain("4 stars");
  expect(render("text", "rating")).not.toContain("data-editor");
  expect(render("number", "missing")).toContain(">4</span>");
});

test("optional syntax colors round-trip while legacy themes derive tokens and reject CSS injection", () => {
  expect(
    themeVariables(parseTheme(JSON.stringify(DEFAULT_THEME)))[
      "--syntax-keyword"
    ],
  ).toBe(DEFAULT_THEME.colors.focus);
  const syntax = {
    keyword: "#112233",
    string: "#224466",
    number: "#336699",
    function: "#4499aa",
  };
  expect(
    themeVariables(parseTheme(JSON.stringify({ ...DEFAULT_THEME, syntax })))[
      "--syntax-string"
    ],
  ).toBe(syntax.string);
  expect(() =>
    parseTheme(
      JSON.stringify({
        ...DEFAULT_THEME,
        syntax: {
          ...syntax,
          keyword: "red; background: url(https://invalid.example)",
        },
      }),
    ),
  ).toThrow();
});

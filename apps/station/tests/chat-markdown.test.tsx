import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StreamingText } from "../src/ui/components/ui/streaming-text";

test("streaming Markdown formats blocks and keeps HTML, scripts and unsafe links inert", () => {
  const html = renderToStaticMarkup(
    <StreamingText
      text={
        "# Reply\n\n**bold** and `code`\n\n- item\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert) [safe](https://example.com)\n\n```html\n<img src=x onerror=alert(1)>\n```"
      }
    />,
  );
  expect(html).toContain("<strong");
  expect(html).toContain("<pre");
  expect(html).toContain("Copy code");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain('href="https://example.com"');
});
test("unfinished fences and deeply nested markup stay bounded and inert", () => {
  expect(
    renderToStaticMarkup(
      <StreamingText status="streaming" text={"```js\nconst answer = 42;"} />,
    ),
  ).toContain("const answer = 42;");
  expect(() =>
    renderToStaticMarkup(
      <StreamingText status="streaming" text={"[".repeat(8000)} />,
    ),
  ).not.toThrow();
});

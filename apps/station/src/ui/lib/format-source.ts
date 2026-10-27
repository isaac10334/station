/** Local, parser-backed formatting. Unsupported languages are explicit; source is never evaluated. */
export async function formatSource(
  source: string,
  path: string,
): Promise<string> {
  const { format } = await import("prettier/standalone");
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (["ts", "tsx", "js", "jsx", "mjs", "json"].includes(extension ?? "")) {
    const [typescript, babel, estree] = await Promise.all([
      import("prettier/plugins/typescript"),
      import("prettier/plugins/babel"),
      import("prettier/plugins/estree"),
    ]);
    return format(source, {
      parser:
        extension === "json"
          ? "json"
          : extension?.startsWith("ts")
            ? "typescript"
            : "babel",
      plugins: [typescript, babel, estree],
    });
  }
  if (["html", "svg"].includes(extension ?? "")) {
    const html = await import("prettier/plugins/html");
    return format(source, { parser: "html", plugins: [html] });
  }
  if (["css", "scss", "less"].includes(extension ?? "")) {
    const postcss = await import("prettier/plugins/postcss");
    return format(source, { parser: extension, plugins: [postcss] });
  }
  throw new Error(
    `Formatting is unavailable for .${extension ?? "unknown"} files.`,
  );
}

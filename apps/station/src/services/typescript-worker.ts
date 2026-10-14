import ts from "typescript";
let libraries: Record<string, string> = {},
  files: Record<string, string> = {},
  revision = 0;
const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  allowJs: true,
  noEmit: true,
  skipLibCheck: true,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  paths: { "@station/sdk": ["/node_modules/@station/sdk/index.d.ts"],"@station/ui":["/node_modules/@station/ui/index.d.ts"],"@station/capabilities/icons":["/node_modules/@station/capabilities/icon-names.d.ts"] },
};
const host: ts.LanguageServiceHost = {
  getCompilationSettings: () => options,
  getScriptFileNames: () =>
    Object.keys(files).filter((path) => /\.[jt]sx?$/.test(path)),
  getScriptVersion: (path) =>
    files[path] === undefined ? "0" : String(revision),
  getScriptSnapshot: (path) => {
    const source = files[path] ?? libraries[path];
    return source === undefined
      ? undefined
      : ts.ScriptSnapshot.fromString(source);
  },
  getCurrentDirectory: () => "/",
  getDefaultLibFileName: () => "/lib/lib.es2022.d.ts",
  fileExists: (path) =>
    files[path] !== undefined || libraries[path] !== undefined,
  readFile: (path) => files[path] ?? libraries[path],
  readDirectory: () => [],
};
const service = ts.createLanguageService(host);
self.onmessage = (event) => {
  const { id, op } = event.data;
  try {
    if (op === "init") {
      libraries = Object.fromEntries(
        Object.entries(event.data.resources).map(([path, source]) => [
          `/${path}`,
          source as string,
        ]),
      );
      self.postMessage({ id, value: true });
      return;
    }
    if (event.data.files) {
      files = Object.fromEntries(
        Object.entries(event.data.files).map(([path, source]) => [
          `/${path}`,
          source as string,
        ]),
      );
      revision++;
    }
    const path = `/${event.data.path}`;
    const value =
      op === "completion"
        ? (service
            .getCompletionsAtPosition(path, event.data.position, {})
            ?.entries.map((entry) => ({
              label: entry.name,
              type: entry.kind === "function" ? "function" : "variable",
            })) ?? [])
        : Object.keys(files)
            .filter((path) => /\.[jt]sx?$/.test(path))
            .flatMap((path) =>
              [
                ...service.getSyntacticDiagnostics(path),
                ...service.getSemanticDiagnostics(path),
              ].map((diagnostic) => ({
                path: path.slice(1),
                from: diagnostic.start ?? 0,
                to: (diagnostic.start ?? 0) + (diagnostic.length ?? 1),
                severity:
                  diagnostic.category === ts.DiagnosticCategory.Error
                    ? "error"
                    : "warning",
                message: ts.flattenDiagnosticMessageText(
                  diagnostic.messageText,
                  "\n",
                ),
              })),
            );
    self.postMessage({ id, value });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};

import { test, expect } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, dirname, sep } from "node:path";
import ts from "typescript";

const app = resolve(import.meta.dir, "..");
const repository = resolve(app, "../..");

async function imports(directory: string) {
  const result: { file: string; target: string }[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await imports(file)));
    else if (/\.tsx?$/.test(entry.name)) {
      const source = ts.createSourceFile(
        file,
        await readFile(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        let specifier: ts.Node | undefined;
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
          specifier = node.moduleSpecifier;
        else if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === "require"))
        )
          specifier = node.arguments[0];
        if (specifier && ts.isStringLiteralLike(specifier))
          result.push({ file, target: specifier.text });
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return result;
}
function localTarget(file: string, target: string) {
  return target.startsWith("@/")
    ? resolve(app, "src", target.slice(2))
    : target.startsWith(".")
      ? resolve(dirname(file), target)
      : undefined;
}

test("core dependencies stay headless, including nested modules, aliases and re-exports", async () => {
  for (const { file, target } of await imports(resolve(app, "src/core"))) {
    const local = localTarget(file, target);
    const forbidden = local
      ? /^(ui|services|providers|application|composition|main)([/.]|$)/.test(
          relative(resolve(app, "src"), local).split(sep).join("/"),
        ) || !local.startsWith(resolve(app, "src") + sep)
      : /^(react|react-dom|electrobun|@station\/(ui|app))($|\/)/.test(target);
    expect(forbidden, `${relative(app, file)} -> ${target}`).toBe(false);
  }
});

test("services and providers never import React UI or browser bootstrap", async () => {
  for (const directory of ["src/services", "src/providers", "src/contracts"]) {
    for (const { file, target } of await imports(resolve(app, directory))) {
      const local = localTarget(file, target);
      expect(
        local
          ? /^(ui|application|composition|main)([/.]|$)/.test(
              relative(resolve(app, "src"), local).split(sep).join("/"),
            )
          : /^(react|react-dom|@station\/ui)($|\/)/.test(target),
        `${relative(app, file)} -> ${target}`,
      ).toBe(false);
    }
  }
});

test("public packages cannot reach application internals or private UI", async () => {
  for (const name of ["sdk", "capabilities"]) {
    const directory = resolve(repository, "packages", name, "src");
    for (const { file, target } of await imports(directory)) {
      const local = localTarget(file, target);
      expect(
        local
          ? !local.startsWith(directory + sep)
          : /^(react|react-dom|electrobun|@station\/(app|ui))($|\/)/.test(
              target,
            ),
        `${relative(repository, file)} -> ${target}`,
      ).toBe(false);
    }
  }
});

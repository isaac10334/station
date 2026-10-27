/** Compiler-resolved package graph and architecture policy. Type-only edges remain edges. */
import ts from "typescript";
import {
  realpathSync,
  readdirSync,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { resolve, relative, dirname, sep } from "node:path";
import { builtinModules } from "node:module";
import { createHash } from "node:crypto";
export interface PackageRule {
  path: string;
  owner: string;
  role: string;
  allows: string[];
  sourceRoots?: string[];
  layerOverrides?: Record<string, string>;
}
export interface Policy {
  version: number;
  exceptionLimit: number;
  exceptions: {
    file: string;
    target: string;
    rule: string;
    owner: string;
    reason: string;
  }[];
  packages: Record<string, PackageRule>;
  layers: Record<string, string[]>;
}
export interface Violation {
  file: string;
  target: string;
  rule: string;
  message: string;
  publicEntrypoint?: string;
}
export interface Edge {
  file: string;
  specifier: string;
  target: string;
  from: string;
  to: string;
}
const slash = (value: string) => value.split(sep).join("/");
export function filesUnder(path: string): string[] {
  if (existsSync(path) && statSync(path).isFile())
    return /\.[cm]?tsx?$/.test(path) ? [path] : [];
  return existsSync(path)
    ? readdirSync(path, { withFileTypes: true }).flatMap((item) =>
        item.isDirectory()
          ? ![
              "node_modules",
              "dist",
              "generated",
              "target",
              "test",
              "tests",
              "fixtures",
              ".git",
            ].includes(item.name)
            ? filesUnder(resolve(path, item.name))
            : []
          : /\.[cm]?tsx?$/.test(item.name)
            ? [resolve(path, item.name)]
            : [],
      )
    : [];
}
export function inspect(root: string, policy: Policy) {
  root = realpathSync(root);
  const packages = Object.entries(policy.packages).map(([name, rule]) => ({
    name,
    ...rule,
    absolute: realpathSync(resolve(root, rule.path)),
    manifest: JSON.parse(
      readFileSync(resolve(root, rule.path, "package.json"), "utf8"),
    ),
  }));
  const owner = (path: string) => {
    const configured = packages.find(
      (pkg) => path === pkg.absolute || path.startsWith(pkg.absolute + sep),
    );
    if (configured) return configured;
    // Optional installed links can resolve outside this checkout. Attribute the
    // real target by its owning manifest, including relative/alias imports.
    for (
      let directory = dirname(path);
      dirname(directory) !== directory;
      directory = dirname(directory)
    ) {
      const manifestPath = resolve(directory, "package.json");
      if (!existsSync(manifestPath)) continue;
      const name = JSON.parse(readFileSync(manifestPath, "utf8")).name;
      if (name) return packages.find((pkg) => pkg.name === name);
    }
    return undefined;
  };
  const violations: Violation[] = [],
    edges: Edge[] = [];
  const rootManifest = resolve(root, "package.json");
  if (existsSync(rootManifest)) {
    const workspace = JSON.parse(readFileSync(rootManifest, "utf8")).workspaces;
    const patterns = Array.isArray(workspace)
      ? workspace
      : (workspace?.packages ?? []);
    for (const pattern of patterns) {
      const star = pattern.indexOf("*");
      const directory = resolve(
        root,
        star < 0 ? pattern : pattern.slice(0, star),
      );
      const candidates =
        star < 0
          ? [directory]
          : existsSync(directory)
            ? readdirSync(directory, { withFileTypes: true })
                .filter((item) => item.isDirectory())
                .map((item) => resolve(directory, item.name))
            : [];
      for (const candidate of candidates) {
        const manifest = resolve(candidate, "package.json");
        if (existsSync(manifest)) {
          const name = JSON.parse(readFileSync(manifest, "utf8")).name;
          if (!policy.packages[name])
            violations.push({
              file: slash(relative(root, manifest)),
              target: name,
              rule: "unowned-package",
              message:
                "Every workspace package requires an explicit architecture policy owner",
            });
        }
      }
    }
  }
  const add = (
    file: string,
    target: string,
    rule: string,
    message: string,
    publicEntrypoint?: string,
  ) =>
    violations.push({
      file: slash(relative(root, file)),
      target,
      rule,
      message,
      ...(publicEntrypoint ? { publicEntrypoint } : {}),
    });
  const layer = (path: string, pkg: (typeof packages)[number]) => {
    const local = slash(relative(pkg.absolute, path));
    const override = Object.entries(pkg.layerOverrides ?? {})
      .sort(([a], [b]) => b.length - a.length)
      .find(([prefix]) => local === prefix || local.startsWith(prefix + "/"));
    return (
      override?.[1] ??
      local.split("/").find((part) => part in policy.layers) ??
      pkg.role
    );
  };
  if (
    policy.exceptions.length > policy.exceptionLimit ||
    policy.exceptions.some((item) => !item.owner || !item.reason)
  )
    add(
      root,
      "policy",
      "exception-budget",
      "Exceptions require owner/reason and cannot exceed the reviewed budget",
    );
  for (const pkg of packages) {
    if (pkg.manifest.name !== pkg.name)
      add(
        pkg.absolute,
        pkg.name,
        "manifest",
        "Policy and manifest names differ",
      );
    for (const [name, version] of Object.entries({
      ...pkg.manifest.dependencies,
      ...pkg.manifest.devDependencies,
      ...pkg.manifest.optionalDependencies,
    }))
      if (
        typeof version === "string" &&
        /^(link:|file:[A-Za-z]:|file:\/)/.test(version)
      )
        add(
          resolve(pkg.absolute, "package.json"),
          name,
          "local-manifest",
          "Publishable manifests cannot depend on developer machine paths",
        );
    const configPath = ts.findConfigFile(
      pkg.absolute,
      ts.sys.fileExists,
      "tsconfig.json",
    );
    const config = configPath
      ? ts.readConfigFile(configPath, ts.sys.readFile).config
      : {};
    const options = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      pkg.absolute,
    ).options;
    const sourceFiles = [
      ...new Set(
        (pkg.sourceRoots ?? ["src"]).flatMap((sourceRoot) =>
          filesUnder(resolve(pkg.absolute, sourceRoot)),
        ),
      ),
    ];
    const program = ts.createProgram(sourceFiles, {
      ...options,
      noResolve: true,
      noLib: true,
    });
    const checker = program.getTypeChecker();
    for (const file of sourceFiles) {
      const source = program.getSourceFile(file)!;
      const check = (specifier: string) => {
        const bare =
          !specifier.startsWith(".") &&
          !specifier.startsWith("/") &&
          !/^[A-Za-z]:/.test(specifier);
        const imported = specifier.startsWith("@")
          ? specifier.split("/").slice(0, 2).join("/")
          : specifier.split("/")[0]!;
        const declared = {
          ...pkg.manifest.dependencies,
          ...pkg.manifest.peerDependencies,
          ...pkg.manifest.optionalDependencies,
        };
        const targetPackage = packages.find(
          (candidate) => candidate.name === imported,
        );
        let result = ts.resolveModuleName(specifier, file, options, ts.sys)
          .resolvedModule?.resolvedFileName;
        if (!result && targetPackage) {
          const exported =
            targetPackage.manifest.exports?.[
              specifier === imported
                ? "."
                : "./" + specifier.slice(imported.length + 1)
            ];
          const destination =
            typeof exported === "string"
              ? exported
              : (exported?.types ?? exported?.import);
          if (destination)
            result = resolve(targetPackage.absolute, destination);
        }
        const platform =
          builtinModules.includes(specifier.replace(/^node:/, "")) ||
          specifier.startsWith("bun:");
        const alias = Object.keys(options.paths ?? {}).some((pattern) => {
          const [prefix, suffix] = pattern.split("*");
          return pattern.includes("*")
            ? specifier.startsWith(prefix!) && specifier.endsWith(suffix ?? "")
            : specifier === pattern;
        });
        if (
          bare &&
          !alias &&
          !platform &&
          imported !== pkg.name &&
          !declared[imported]
        )
          add(
            file,
            specifier,
            "undeclared",
            "Declare this dependency in the importing package manifest",
            targetPackage?.name,
          );
        if (
          bare &&
          targetPackage &&
          specifier !== imported &&
          !targetPackage.manifest.exports?.[
            "./" + specifier.slice(imported.length + 1)
          ]
        )
          add(
            file,
            specifier,
            "private-import",
            "Import through a declared package export",
            targetPackage.name,
          );
        if (
          bare &&
          (specifier === "react" ||
            specifier.startsWith("react/") ||
            specifier === "react-dom" ||
            specifier.startsWith("react-dom/") ||
            specifier.startsWith("node:") ||
            specifier.startsWith("bun:") ||
            builtinModules.includes(specifier)) &&
          ["contracts", "domain", "application"].includes(layer(file, pkg))
        )
          add(
            file,
            specifier,
            "portable-layer",
            "Inward layers cannot import platform implementations",
          );
        if (platform) return;
        if (!result) {
          try {
            const asset = Bun.resolveSync(specifier, dirname(file));
            if (!/\.[cm]?[jt]sx?$/.test(asset) && existsSync(asset)) return;
          } catch {
            /* Compiler resolution below reports the source import. */
          }
        }
        if (!result && specifier.startsWith(".")) {
          const asset = resolve(dirname(file), specifier);
          if (existsSync(asset) && !/[cm]?tsx?$/.test(asset)) return;
        }
        if (!result) {
          add(
            file,
            specifier,
            "unresolved",
            "Import did not resolve using the package tsconfig and exports",
          );
          return;
        }
        const target = existsSync(result)
            ? realpathSync(result)
            : resolve(result),
          destination = owner(target);
        if (!destination) return;
        edges.push({
          file: slash(relative(root, file)),
          specifier,
          target: slash(relative(root, target)),
          from: pkg.name,
          to: destination.name,
        });
        if (destination.name !== pkg.name) {
          if (!pkg.allows.includes(destination.name))
            add(
              file,
              slash(relative(root, target)),
              "package-edge",
              `${pkg.name} may not depend on ${destination.name}`,
              destination.name,
            );
          if (!bare || alias)
            add(
              file,
              slash(relative(root, target)),
              "private-import",
              "Cross-package relative/path-alias imports bypass public exports",
              destination.name,
            );
          if (!declared[destination.name])
            add(
              file,
              destination.name,
              "undeclared",
              "Declare the resolved workspace package dependency",
              destination.name,
            );
        } else {
          const fromLayer = layer(file, pkg),
            toLayer = layer(target, pkg);
          if (
            fromLayer !== toLayer &&
            !policy.layers[fromLayer]?.includes(toLayer)
          )
            add(
              file,
              slash(relative(root, target)),
              "layer-edge",
              `${fromLayer} cannot import ${toLayer}. Move concrete wiring to composition and inject a ${fromLayer}-facing port; import only contracts, domain or permitted application entrypoints.`,
            );
        }
      };
      const visit = (node: ts.Node) => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          check(node.moduleSpecifier.text);
        if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)
        )
          check(node.argument.literal.text);
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === "require"))
        ) {
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteralLike(arg)) check(arg.text);
          else
            add(
              file,
              "dynamic import",
              "unresolved-dynamic",
              "Computed imports require an explicit reviewed exception",
            );
        }
        if (
          ts.isIdentifier(node) &&
          !checker
            .getSymbolAtLocation(node)
            ?.declarations?.some(
              (declaration) => declaration.getSourceFile() === source,
            ) &&
          !(
            (ts.isPropertySignature(node.parent) ||
              ts.isPropertyDeclaration(node.parent) ||
              ts.isPropertyAssignment(node.parent) ||
              ts.isMethodDeclaration(node.parent) ||
              ts.isMethodSignature(node.parent)) &&
            node.parent.name === node
          ) &&
          ["window", "document", "navigator", "localStorage"].includes(
            node.text,
          ) &&
          !(
            ts.isPropertyAccessExpression(node.parent) &&
            node.parent.name === node
          ) &&
          ["contracts", "domain", "application"].includes(layer(file, pkg))
        )
          add(
            file,
            node.text,
            "browser-global",
            "Inject a portable dependency port instead of browser globals",
          );
        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "globalThis" &&
          ["window", "document", "navigator", "localStorage"].includes(
            node.name.text,
          ) &&
          ["contracts", "domain", "application"].includes(layer(file, pkg))
        )
          add(
            file,
            "globalThis." + node.name.text,
            "browser-global",
            "Inject a portable dependency port instead of browser globals",
          );
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  const manifestEdges = packages.flatMap((pkg) =>
    Object.keys({
      ...pkg.manifest.dependencies,
      ...pkg.manifest.peerDependencies,
      ...pkg.manifest.optionalDependencies,
      ...pkg.manifest.devDependencies,
    })
      .filter((name) => packages.some((target) => target.name === name))
      .map((name) => ({
        from: pkg.name,
        to: name,
        file: slash(relative(root, resolve(pkg.absolute, "package.json"))),
        specifier: name,
        target: policy.packages[name]!.path,
      })),
  );
  for (const edge of manifestEdges)
    if (!policy.packages[edge.from]!.allows.includes(edge.to))
      add(
        resolve(root, edge.file),
        edge.to,
        "package-edge",
        `${edge.from} manifest may not depend on ${edge.to}`,
        edge.to,
      );
  const cycleKeys = new Set<string>();
  for (const pkg of packages) {
    const walk = (name: string, path: string[]) => {
      for (const edge of [...edges, ...manifestEdges].filter(
        (edge) => edge.from === name && edge.to !== name,
      )) {
        if (edge.to === pkg.name) {
          const cycle = [...path, name, pkg.name];
          const key = [...new Set(cycle)].sort().join("|");
          if (!cycleKeys.has(key)) {
            cycleKeys.add(key);
            add(
              resolve(root, edge.file),
              edge.to,
              "package-cycle",
              cycle.join(" -> "),
            );
          }
        } else if (!path.includes(edge.to) && edge.to !== name)
          walk(edge.to, [...path, name]);
      }
    };
    walk(pkg.name, []);
  }
  // Tarjan components retain type-only edges. Fingerprint the complete edge set:
  // an exception cannot silently authorize a new cycle inside an existing group.
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges.filter((edge) => edge.from === edge.to)) {
    if (!adjacency.has(edge.file)) adjacency.set(edge.file, new Set());
    adjacency.get(edge.file)!.add(edge.target);
  }
  const indices = new Map<string, number>(),
    low = new Map<string, number>();
  const stack: string[] = [],
    pending = new Set<string>();
  let index = 0;
  function component(file: string) {
    indices.set(file, index);
    low.set(file, index++);
    stack.push(file);
    pending.add(file);
    for (const target of adjacency.get(file) ?? []) {
      if (!indices.has(target)) {
        component(target);
        low.set(file, Math.min(low.get(file)!, low.get(target)!));
      } else if (pending.has(target))
        low.set(file, Math.min(low.get(file)!, indices.get(target)!));
    }
    if (low.get(file) !== indices.get(file)) return;
    const members: string[] = [];
    let current: string;
    do {
      current = stack.pop()!;
      pending.delete(current);
      members.push(current);
    } while (current !== file);
    if (members.length === 1 && !adjacency.get(file)?.has(file)) return;
    members.sort();
    const included = new Set(members);
    const connections = members
      .flatMap((from) =>
        [...(adjacency.get(from) ?? [])]
          .filter((to) => included.has(to))
          .map((to) => `${from} -> ${to}`),
      )
      .sort();
    const fingerprint = createHash("sha256")
      .update(connections.join("\n"))
      .digest("hex")
      .slice(0, 16);
    add(
      resolve(root, members[0]!),
      members[0] + "#cycle=" + fingerprint,
      "module-cycle",
      `Mutually dependent modules (including types): ${members.join(", ")}. Break an edge through an inward public contract.`,
    );
  }
  for (const file of adjacency.keys()) if (!indices.has(file)) component(file);
  for (const exception of policy.exceptions)
    if (
      !violations.some(
        (violation) =>
          exception.file === violation.file &&
          exception.target === violation.target &&
          exception.rule === violation.rule,
      )
    )
      violations.push({
        file: exception.file,
        target: exception.target,
        rule: "stale-exception",
        message:
          "Remove this exception: it no longer matches an active violation",
      });
  const unique = [
    ...new Map(
      violations.map((violation) => [
        violation.file + "|" + violation.target + "|" + violation.rule,
        violation,
      ]),
    ).values(),
  ];
  const active = unique.filter(
    (violation) =>
      !policy.exceptions.some(
        (exception) =>
          exception.file === violation.file &&
          exception.target === violation.target &&
          exception.rule === violation.rule,
      ),
  );
  return {
    packages: packages.map(({ absolute, manifest, ...pkg }) => ({
      ...pkg,
      realpath: absolute,
      exports: manifest.exports,
      dependencies: manifest.dependencies ?? {},
      scripts: manifest.scripts ?? {},
    })),
    edges,
    manifestEdges,
    violations: active,
    exceptionCount: policy.exceptions.length,
  };
}
/** Include reverse dependents after source edits; shared root policy changes affect every package. */
export function affectedPackages(
  packages: { name: string; path: string; allows: string[] }[],
  changed: string[],
): string[] {
  const names = new Set(
    packages
      .filter((pkg) => changed.some((file) => file.startsWith(pkg.path + "/")))
      .map((pkg) => pkg.name),
  );
  if (
    changed.some(
      (file) =>
        ["package.json", "bun.lock", "tsconfig.json"].includes(file) ||
        file.startsWith("tooling/"),
    )
  )
    for (const pkg of packages) names.add(pkg.name);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const pkg of packages)
      if (!names.has(pkg.name) && pkg.allows.some((name) => names.has(name))) {
        names.add(pkg.name);
        expanded = true;
      }
  }
  return [...names];
}

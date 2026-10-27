/** Repository operations over declared package dependencies. No package-manager state is persisted.
 * Read-only commands accept --json; failures exit 1 and invalid usage exits 2.
 * @example bun run repo affected --files packages/capabilities/src/index.ts --json
 */
import { existsSync, readFileSync, realpathSync, readdirSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { inspect, type Policy } from "./architecture";
import { root, run, localLoop, assertReproducible } from "./local-loop";
import { resolvedPackageRoot } from "./package-resolution";

const policy = JSON.parse(
  readFileSync(join(root, "tooling/architecture-policy.json"), "utf8"),
) as Policy;
type Manifest = {
  name: string;
  private?: boolean;
  exports?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
const packages = Object.entries(policy.packages).map(([name, rule]) => {
  const directory = resolve(root, rule.path);
  const manifest = JSON.parse(
    readFileSync(join(directory, "package.json"), "utf8"),
  ) as Manifest;
  return { name, ...rule, directory, manifest };
});
const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
const dependencies = (name: string) => {
  const manifest = byName.get(name)!.manifest;
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  })
    .filter((name) => byName.has(name))
    .sort();
};
/** Dependency-first order includes type/dev workspace edges and rejects manifest cycles. */
export function topological(names: string[]): string[] {
  const done = new Set<string>(),
    active = new Set<string>(),
    ordered: string[] = [];
  const visit = (name: string, trail: string[]) => {
    if (done.has(name)) return;
    if (active.has(name))
      throw new Error(
        `Manifest dependency cycle: ${[...trail, name].join(" -> ")}`,
      );
    active.add(name);
    for (const dependency of dependencies(name))
      visit(dependency, [...trail, name]);
    active.delete(name);
    done.add(name);
    ordered.push(name);
  };
  for (const name of [...names].sort()) visit(name, []);
  return ordered;
}
function packageFor(value: string) {
  const exact = byName.get(value);
  if (exact) return exact;
  const candidates = packages.filter(
    (pkg) => pkg.path === value || pkg.path.split("/").at(-1) === value,
  );
  if (candidates.length > 1)
    throw new UsageError(
      `Ambiguous package ${value}: ${candidates.map((pkg) => pkg.name).join(", ")}. Use its full name.`,
    );
  const pkg = candidates[0];
  if (!pkg)
    throw new UsageError(
      `Unknown package ${value}. Use repo graph for package names.`,
    );
  return pkg;
}
function buildDirectory(name: string) {
  // Build output may not exist yet on a clean install. Resolve the installed
  // package junction, rather than requiring its not-yet-generated entrypoint.
  if (!name.startsWith("@loop-kit/")) return byName.get(name)!.directory;
  for (const base of [root, join(root, "apps/station")]) {
    const installed = join(base, "node_modules", name);
    if (existsSync(installed)) return realpathSync(installed);
  }
  return byName.get(name)!.directory;
}
async function task(name: string, script: string) {
  if (name.startsWith("@loop-kit/")) return;
  const directory = buildDirectory(name);
  const manifest = JSON.parse(
    readFileSync(join(directory, "package.json"), "utf8"),
  ) as Manifest;
  if (manifest.scripts?.[script]) await run(["bun", "run", script], directory);
}
function git(args: string[]) {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0)
    throw new Error(
      new TextDecoder().decode(result.stderr).trim() || "Git inspection failed",
    );
  return new TextDecoder().decode(result.stdout).split("\0").filter(Boolean);
}
class UsageError extends Error {}
export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes("--json");
  const args = argv.filter((arg) => arg !== "--json");
  const command = args.shift();
  const emit = (value: unknown, readable?: string) =>
    console.log(
      json
        ? JSON.stringify(value)
        : (readable ?? JSON.stringify(value, null, 2)),
    );
  if (command === "graph") {
    if (args.length) throw new UsageError("Usage: repo graph [--json]");
    const graph = {
      packages: packages.map((pkg) => ({
        name: pkg.name,
        path: pkg.path,
        owner: pkg.owner,
        dependencies: dependencies(pkg.name),
      })),
      order: topological(packages.map((pkg) => pkg.name)),
    };
    emit(
      graph,
      graph.packages
        .map(
          (pkg) => `${pkg.name} -> ${pkg.dependencies.join(", ") || "(none)"}`,
        )
        .join("\n"),
    );
  } else if (command === "check") {
    if (args.length) throw new UsageError("Usage: repo check [--json]");
    topological(packages.map((pkg) => pkg.name));
    const report = inspect(root, policy);
    emit(
      report,
      report.violations.length
        ? report.violations
            .map(
              (item) =>
                `${item.file} -> ${item.target}: [${item.rule}] ${item.message}${item.publicEntrypoint ? `; public entrypoint: ${item.publicEntrypoint}` : ""}`,
            )
            .join("\n")
        : `Architecture passed (${report.packages.length} packages, ${report.exceptionCount} reviewed exceptions).`,
    );
    if (report.violations.length) process.exitCode = 1;
  } else if (command === "context") {
    if (args.length !== 1)
      throw new UsageError("Usage: repo context <package> [--json]");
    const pkg = packageFor(args[0]!);
    const directory = buildDirectory(pkg.name);
    const readme = join(directory, "README.md");
    const manifest = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    ) as Manifest;
    emit({
      name: pkg.name,
      path: pkg.path,
      realpath: realpathSync(directory),
      owner: pkg.owner,
      role: pkg.role,
      exports: manifest.exports ?? null,
      dependencies: dependencies(pkg.name),
      allowedPackages: pkg.allows,
      forbiddenPackages: packages
        .filter(
          (other) =>
            other.name !== pkg.name && !pkg.allows.includes(other.name),
        )
        .map((other) => other.name),
      layers: policy.layers,
      readme: existsSync(readme) ? readme : null,
      featureContexts: existsSync(join(directory, "src/features"))
        ? readdirSync(join(directory, "src/features"), { withFileTypes: true })
            .filter(item => item.isDirectory())
            .map(item => ({
              name: item.name,
              readme: existsSync(join(directory, "src/features", item.name, "README.md"))
                ? join(directory, "src/features", item.name, "README.md") : null,
              layers: readdirSync(join(directory, "src/features", item.name), { withFileTypes: true })
                .filter(layer => layer.isDirectory()).map(layer => layer.name),
            }))
        : [],
      scripts: manifest.scripts ?? {},
      tests: {
        command: manifest.scripts?.test ?? null,
        directories: ["test", "tests"].filter((name) =>
          existsSync(join(directory, name)),
        ),
        packedConsumers: "bun run check:packages",
      },
      verify: `bun run repo verify ${pkg.name}`,
      acceptance:
        "Use public exports; run focused typechecks/tests/builds. Product runtime and installed-native acceptance are separate.",
    });
  } else if (command === "affected") {
    let base: string | undefined, explicit: string[] | undefined;
    while (args.length) {
      const option = args.shift();
      if (option === "--base" && args[0] && !args[0].startsWith("--"))
        base = args.shift();
      else if (option === "--files") {
        explicit = [];
        while (args.length && !args[0]!.startsWith("--"))
          explicit.push(args.shift()!);
      } else
        throw new UsageError(
          "Usage: repo affected [--base <git-ref>] [--files <paths...>] [--json]",
        );
    }
    const files = [
      ...new Set(
        explicit ?? [
          ...git(["diff", "--name-only", "-z", base ?? "HEAD", "--"]),
          ...git(["ls-files", "--others", "--exclude-standard", "-z"]),
        ],
      ),
    ].sort();
    const globals = new Set(["package.json", "bun.lock", "AGENTS.md"]);
    const globalChange = files.some(
      (file) =>
        globals.has(file.replaceAll("\\", "/")) ||
        file.replaceAll("\\", "/").startsWith("tooling/") ||
        file.replaceAll("\\", "/").startsWith(".github/workflows/"),
    );
    const changed = new Set<string>(
      globalChange ? packages.map((pkg) => pkg.name) : [],
    );
    for (const file of files) {
      const absolute = resolve(root, file);
      const pkg = packages.find(
        (pkg) =>
          absolute === pkg.directory ||
          absolute.startsWith(pkg.directory + sep),
      );
      if (pkg) changed.add(pkg.name);
    }
    const affected = new Set(changed);
    let progress = true;
    while (progress) {
      progress = false;
      for (const pkg of packages)
        if (
          !affected.has(pkg.name) &&
          dependencies(pkg.name).some((name) => affected.has(name))
        ) {
          affected.add(pkg.name);
          progress = true;
        }
    }
    emit({
      files,
      changed: [...changed].sort(),
      affected: topological([...affected]).filter((name) => affected.has(name)),
    });
  } else if (command === "typecheck") {
    if (args.length || json) throw new UsageError("Usage: repo typecheck");
    for (const name of topological(packages.map((pkg) => pkg.name)))
      await task(name, "typecheck");
    await run([
      "bun",
      join(root, "node_modules/typescript/bin/tsc"),
      "-p",
      "tooling/tsconfig.json",
    ]);
  } else if (command === "build-packages") {
    if (args.length || json) throw new UsageError("Usage: repo build-packages");
    for (const name of topological(
      packages
        .filter((pkg) => !pkg.path.startsWith("apps/"))
        .map((pkg) => pkg.name),
    ))
      await task(name, "build");
  } else if (command === "verify") {
    if (args.length !== 1 || json)
      throw new UsageError("Usage: repo verify <package|all>");
    const selection = args[0]!;
    const report = inspect(root, policy);
    if (report.violations.length)
      throw new Error(
        `Architecture failed (${report.violations.length} violations). Run repo check.`,
      );
    if (selection === "all") {
      assertReproducible();
      await run(["bun", "run", "typecheck"]);
      await run(["bun", "run", "test"]);
      await run(["bun", "run", "build"]);
      await run(["bun", "run", "check:packages"]);
    } else {
      const pkg = packageFor(selection);
      for (const name of topological([pkg.name])) {
        await task(name, "build");
        await task(name, "typecheck");
        await task(name, "test");
      }
    }
  } else if (command === "assert-reproducible") {
    if (args.length)
      throw new UsageError("Usage: repo assert-reproducible [--json]");
    assertReproducible();
    emit(
      { reproducible: true },
      "Installed package resolution verified.",
    );
  } else if (command === "link") {
    const action = args.shift();
    if (
      !action ||
      args.length > (action === "on" ? 1 : 0) ||
      (json && action !== "status")
    )
      throw new UsageError("Usage: repo link on <checkout>|off|status|watch");
    emit(await localLoop(action, args[0]));
  } else
    throw new UsageError(
      "Usage: repo graph|check|context|affected|verify|typecheck|build-packages|assert-reproducible|link",
    );
}
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.argv.includes("--json"))
      console.log(JSON.stringify({ error: message }));
    else console.error(message);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

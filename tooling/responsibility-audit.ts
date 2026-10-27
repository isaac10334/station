/** Reproducible source census over the same compiler-resolved graph as repo check.
 * Run `bun tooling/responsibility-audit.ts` before/after a migration. No source is executed.
 */
import { readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { inspect, filesUnder, type Policy } from "./architecture";
const root = resolve(import.meta.dir, "..");
const policy = JSON.parse(readFileSync(resolve(root, "tooling/architecture-policy.json"), "utf8")) as Policy;
const graph = inspect(root, policy);
const prefix = "apps/station/src/";
const group = (path: string) => path.startsWith(prefix) ? path.slice(prefix.length).split("/")[0]! : path.split("/").slice(0, 3).join("/");
const files = filesUnder(resolve(root, "apps/station/src")).map(path => {
  const file = relative(root, path).replaceAll("\\", "/");
  const source = readFileSync(path, "utf8");
  return { file, lines: source.split("\n").length, incoming: graph.edges.filter(e => e.target === file).length,
    outgoing: graph.edges.filter(e => e.file === file).length,
    singleton: graph.edges.some(e => e.file === file && e.target === prefix + "composition.ts"),
    subscriptions: (source.match(/\.subscribe\(/g) ?? []).length,
    browserAccess: (source.match(/\b(localStorage|document|window|fetch|Worker|WebSocket)\b/g) ?? []).length };
});
const groups = [...new Set(files.map(f => group(f.file)))].sort().map(name => ({ name,
  files: files.filter(f => group(f.file) === name).length,
  lines: files.filter(f => group(f.file) === name).reduce((n, f) => n + f.lines, 0),
  dependencies: Object.fromEntries([...new Set(graph.edges.filter(e => group(e.file) === name && group(e.target) !== name).map(e => group(e.target)))].sort().map(target => [target, graph.edges.filter(e => group(e.file) === name && group(e.target) === target).length])) }));
console.log(JSON.stringify({ groups, files: files.sort((a,b) => b.incoming - a.incoming || b.lines - a.lines),
  edges: graph.edges.length, singletonConsumers: files.filter(f => f.singleton).map(f => f.file),
  exceptions: policy.exceptions, violations: graph.violations }, null, 2));

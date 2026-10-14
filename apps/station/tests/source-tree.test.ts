import { test, expect } from "bun:test";
import { sourceTree, sourceAncestors } from "../src/core/source-tree";

test("project hierarchy preserves colliding file/folder names and orders folders first", () => {
  const paths = ["src", "src/main.ts", "src/styles.css", "index.html", "wit/deps/world.wit"];
  const tree = sourceTree(paths);
  expect(tree.map(node => node.id)).toEqual(["folder:src", "folder:wit", "file:index.html", "file:src"]);
  const leaves: string[] = [];
  const visit = (nodes: typeof tree) => nodes.forEach(node => node.children ? visit(node.children) : leaves.push(node.path));
  visit(tree);
  expect(leaves.sort()).toEqual([...paths].sort());
  expect(sourceAncestors("wit/deps/world.wit")).toEqual(["folder:wit", "folder:wit/deps"]);
});

/** Serializable project hierarchy. Folder IDs cannot collide with file paths. */
export interface SourceTreeNode {
  id: string;
  label: string;
  path: string;
  children?: SourceTreeNode[];
}

/** Build a folder-first tree without modifying, dropping, or renaming project files. */
export function sourceTree(paths: readonly string[]): SourceTreeNode[] {
  const roots: SourceTreeNode[] = [], folders = new Map<string, SourceTreeNode>();
  for (const path of paths) {
    const segments = path.split("/");
    let children = roots, prefix = "";
    segments.slice(0, -1).forEach(label => {
      prefix = prefix ? `${prefix}/${label}` : label;
      let folder = folders.get(prefix);
      if (!folder) {
        folder = {id: `folder:${prefix}`, label, path: prefix, children: []};
        folders.set(prefix, folder); children.push(folder);
      }
      children = folder.children!;
    });
    children.push({id: `file:${path}`, label: segments.at(-1)!, path});
  }
  const sort = (nodes: SourceTreeNode[]) => {
    nodes.sort((a,b) => Number(!!b.children) - Number(!!a.children) || a.label.localeCompare(b.label, undefined, {numeric:true}));
    nodes.forEach(node => { if (node.children) sort(node.children); });
  };
  sort(roots); return roots;
}

export function sourceAncestors(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0,-1).map((_,i) => `folder:${parts.slice(0,i+1).join("/")}`);
}

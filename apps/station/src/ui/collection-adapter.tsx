/** DOM presentation adds trusted icons to the portable collection projection. */
import {
  collectionView,
  type CollectionSource,
  type CollectionItem,
} from "@loop-kit/ui";
import type { TreeNode } from "./components/ui/tree-view";
import { SemanticIcon } from "./semantic-icons";
export function collectionTree<T>(source: CollectionSource<T>): TreeNode[] {
  const visit = (items: readonly CollectionItem[]): TreeNode[] =>
    items.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon ? <SemanticIcon icon={item.icon} /> : undefined,
      ...(item.children ? { children: visit(item.children) } : {}),
    }));
  return visit(collectionView(source));
}

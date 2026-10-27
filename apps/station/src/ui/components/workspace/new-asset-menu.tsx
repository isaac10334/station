import type { Asset } from "../../../core/asset-state";
import { DropdownMenuItem } from "../ui/dropdown-menu";

/** Shared menu rows: context menus and the toolbar always offer the same creation paths. */
export function NewAssetMenu({
  onNew,
}: {
  onNew: (kind: Asset["kind"], scriptMode?: "javascript") => void;
}) {
  return (
    <>
      {(
        [
          ["web-content", "Web content"],
          ["component", "Rust Component"],
          ["widget-definition", "Widget definition"],
          ["data-source", "Data source"],
          ["script", "TypeScript script"],
          ["svg", "SVG image"],
          ["markdown", "Markdown document"],
          ["note", "Rich note"],
          ["decision", "Decision policy"],
          ["desk-template", "Desk template from this desk"],
          ["theme", "Theme"],
          ["package", "Package"],
        ] as const
      ).map(([kind, label]) => (
        <DropdownMenuItem key={kind} onClick={() => onNew(kind)}>
          {label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem onClick={() => onNew("script", "javascript")}>
        JavaScript calculation
      </DropdownMenuItem>
    </>
  );
}

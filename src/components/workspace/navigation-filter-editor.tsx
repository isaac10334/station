import { useId, useState } from "react";
import { Pin, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { scoreCommand } from "@/lib/command-search";
import {
  parseWorkspaceQuery,
  type WorkspaceSearchItem,
} from "@/workspace-search";
import type { NavigationFilter } from "@/navigation-filter";

/** Edits live filter preferences and provides a keyboard alternative to drag-to-pin. */
export function NavigationFilterEditor({
  items,
  filter,
  onChange,
}: {
  items: WorkspaceSearchItem[];
  filter: NavigationFilter;
  onChange: (filter: NavigationFilter) => void;
}) {
  const id = useId();
  const [pinQuery, setPinQuery] = useState("");
  // Keep nested menus in the popover's stacking context and dismissal boundary.
  const [menuContainer, setMenuContainer] = useState<HTMLDivElement | null>(null);
  const patch = (value: Partial<NavigationFilter>) =>
    onChange({ ...filter, ...value });
  const query = parseWorkspaceQuery(pinQuery);
  const candidates = items.filter(
    (item) =>
      (query.scope === "all" ||
        query.scope === "search" ||
        query.scope === item.kind) &&
      scoreCommand(item, query.text) !== null,
  );
  return (
    <div ref={setMenuContainer} className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-fg">Navigation filter</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-3">
          Matching items update automatically. Pins stay at the top.
        </p>
      </div>
      <label
        className="flex flex-col gap-1.5 text-xs font-medium text-fg-2"
        htmlFor={`${id}-query`}
      >
        Match items
        <Input
          id={`${id}-query`}
          value={filter.query}
          onChange={(event) => patch({ query: event.target.value })}
          placeholder="Name, assets:, or panels:…"
        />
      </label>
      <div
        className="flex flex-wrap gap-1.5"
        aria-label="Include in navigation"
      >
        {(["assets", "panels"] as const).map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={filter.kinds.includes(kind) ? "secondary" : "ghost"}
            aria-pressed={filter.kinds.includes(kind)}
            onClick={() =>
              patch({
                kinds: filter.kinds.includes(kind)
                  ? filter.kinds.filter((value) => value !== kind)
                  : [...filter.kinds, kind],
              })
            }
          >
            {kind === "assets" ? "Assets" : "Panels"}
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger size="sm" chevron aria-label="Navigation order">
            {filter.sort === "name" ? "By name" : "Workspace order"}
          </DropdownMenuTrigger>
          <DropdownMenuContent container={menuContainer}>
            <DropdownMenuRadioGroup
              value={filter.sort}
              onValueChange={(value) =>
                patch({ sort: value === "workspace" ? "workspace" : "name" })
              }
            >
              <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="workspace">
                Workspace order
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          size="sm"
          chevron
          aria-label="Asset type filter"
          className="self-start"
        >
          {filter.assetKinds.length === 1
            ? filter.assetKinds[0] === "component"
              ? "Components"
              : "Web content"
            : "All asset types"}
        </DropdownMenuTrigger>
        <DropdownMenuContent container={menuContainer}>
          {(
            [
              ["component", "Components"],
              ["web-content", "Web content"],
            ] as const
          ).map(([kind, label]) => (
            <DropdownMenuCheckboxItem
              key={kind}
              checked={filter.assetKinds.includes(kind)}
              onCheckedChange={(checked) =>
                patch({
                  assetKinds: checked
                    ? [...filter.assetKinds, kind]
                    : filter.assetKinds.filter((value) => value !== kind),
                })
              }
            >
              {label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {filter.excluded.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={() => patch({ excluded: [] })}
        >
          Restore {filter.excluded.length} hidden{" "}
          {filter.excluded.length === 1 ? "item" : "items"}
        </Button>
      )}
      <div className="border-t border-line pt-3">
        <label
          htmlFor={`${id}-pins`}
          className="mb-1.5 block text-xs font-medium text-fg-2"
        >
          Pin specific items
        </label>
        <Input
          id={`${id}-pins`}
          value={pinQuery}
          onChange={(event) => setPinQuery(event.target.value)}
          placeholder="Find an asset or panel…"
        />
      </div>
      <div className="max-h-56 overflow-y-auto" aria-label="Pin items">
        {candidates.map((item) => {
          const pinned = filter.pinned.includes(item.id);
          return (
            <button
              type="button"
              key={item.id}
              aria-label={`${pinned ? "Unpin" : "Pin"} ${item.label}`}
              aria-pressed={pinned}
              className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-fg-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-fg-3"
              onClick={() =>
                patch({
                  pinned: pinned
                    ? filter.pinned.filter((value) => value !== item.id)
                    : [...filter.pinned, item.id],
                  excluded: filter.excluded.filter(
                    (value) => value !== item.id,
                  ),
                })
              }
            >
              <Pin size={13} className={pinned ? "text-fg" : "text-fg-4"} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="text-[10px] text-fg-4">{item.hint}</span>
              {pinned && <Check size={12} />}
            </button>
          );
        })}
        {!candidates.length && (
          <p className="px-2 py-3 text-xs text-fg-3">No matching items.</p>
        )}
      </div>
    </div>
  );
}

import { Box, Command, PanelsTopLeft } from "lucide-react";
import {
  CommandPalette,
  type CommandGroup,
} from "@/components/ui/command-palette";
import {
  parseWorkspaceQuery,
  type WorkspaceSearchItem,
} from "@/workspace-search";

/** One palette for content and actions. The query stays editable, including its scope prefix. */
export function WorkspacePalette({
  open,
  onOpenChange,
  query,
  onQueryChange,
  items,
  actions,
  onOpen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
  items: WorkspaceSearchItem[];
  actions: CommandGroup[];
  onOpen: (item: WorkspaceSearchItem) => void;
}) {
  const parsed = parseWorkspaceQuery(query);
  const content: CommandGroup[] = (["assets", "panels"] as const)
    .filter(
      (kind) =>
        parsed.scope === "all" ||
        parsed.scope === "search" ||
        parsed.scope === kind,
    )
    .map((kind) => ({
      heading: kind === "assets" ? "Assets" : "Panels",
      items: items
        .filter((item) => item.kind === kind)
        .map((item) => ({
          ...item,
          icon:
            kind === "assets" ? <Box size={16} /> : <PanelsTopLeft size={16} />,
          onSelect: () => onOpen(item),
        })),
    }));
  const groups = [
    ...content,
    ...(parsed.scope === "all" || parsed.scope === "actions" ? actions : []),
  ];
  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      query={query}
      onQueryChange={onQueryChange}
      searchQuery={parsed.text}
      groups={groups}
      placeholder="Search assets, panels, or > actions…"
      footer="Type assets:, panels:, or >"
      tools={
        <div
          className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2"
          aria-label="Search scope"
        >
          {(
            [
              ["all", "All", <SearchGlyph key="all" />],
              ["assets", "Assets", <Box key="assets" size={13} />],
              ["panels", "Panels", <PanelsTopLeft key="panels" size={13} />],
              ["actions", "Actions", <Command key="actions" size={13} />],
            ] as const
          ).map(([scope, label, icon]) => (
            <button
              key={scope}
              type="button"
              aria-pressed={
                parsed.scope === scope ||
                (scope === "all" && parsed.scope === "search")
              }
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-fg-3 hover:bg-hover hover:text-fg aria-pressed:bg-hover aria-pressed:text-fg focus-visible:outline-2 focus-visible:outline-fg-3"
              onClick={(event) => {
                onQueryChange(
                  scope === "all"
                    ? parsed.text
                    : `${scope === "actions" ? ">" : `${scope}:`} ${parsed.text}`,
                );
                event.currentTarget
                  .closest('[role="dialog"]')
                  ?.querySelector<HTMLInputElement>("input")
                  ?.focus();
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      }
    />
  );
}

function SearchGlyph() {
  return <span aria-hidden className="size-1.5 rounded-full bg-current" />;
}

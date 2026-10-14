import { useState } from "react";
import type { Workspace } from "../../../core/model";
import { deps } from "../../../composition";
import { useDockController } from "../../docking/react";
import { IconAction } from "../ui/icon-action";
import { ActionTooltip } from "../ui/action-tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "../ui/dropdown-menu";
import { Columns, Settings, Search, Pin, Check } from "../../lib/icons";
import { WorkspaceSharing } from "./workspace-sharing";
import { Dialog, DialogTrigger } from "../ui/dialog";
import { DeskSettingsDialog } from "./desk-settings-dialog";

/** Desk switching and search stay available outside hideable workspace surfaces. */
export function DeskControls({
  workspace,
  onSearch,
}: {
  workspace: Workspace;
  onSearch: (query?: string) => void;
}) {
  const { command } = useDockController();
  const desk = deps.store.desk();
  const [open, setOpen] = useState(false);
  const openAsset = (id: string) => {
    command({ type: "openAsset", assetId: id });
    setOpen(false);
  };
  const create = (kind: "theme" | "package") =>
    openAsset(
      deps.store.createDataAsset(
        kind,
        kind === "theme" ? "My theme" : "My package",
      ),
    );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div
        className="station-desk-controls"
        aria-label="Desk toolbar"
        style={{
          left: desk.toolbar?.anchor.endsWith("right")
            ? "auto"
            : desk.toolbar?.anchor.endsWith("center")
              ? "50%"
              : (desk.toolbar?.inset ?? 8),
          right: desk.toolbar?.anchor.endsWith("right")
            ? desk.toolbar.inset
            : "auto",
          bottom: desk.toolbar?.anchor.startsWith("top")
            ? "auto"
            : (desk.toolbar?.inset ?? 8),
          top: desk.toolbar?.anchor.startsWith("top")
            ? desk.toolbar.inset
            : "auto",
          transform: desk.toolbar?.anchor.endsWith("center")
            ? "translateX(-50%)"
            : undefined,
        }}
      >
        <DropdownMenu>
          <ActionTooltip label="Switch desk">
            <DropdownMenuTrigger
              variant="ghost"
              size="sm"
              chevron
              aria-label="Switch desk"
            >
              <Columns />
              <span className="max-w-32 truncate">{desk.name}</span>
            </DropdownMenuTrigger>
          </ActionTooltip>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Desks</DropdownMenuLabel>
              {workspace.desks.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  icon={item.id === desk.id ? <Check /> : <Columns />}
                  onClick={() => deps.store.selectDesk(item.id)}
                >
                  {item.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <ActionTooltip label="Configure desk">
          <DialogTrigger
            render={
              <button
                type="button"
                aria-label="Configure desk"
                className="station-icon-action inline-grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-fg-3"
              />
            }
          >
            <Settings />
          </DialogTrigger>
        </ActionTooltip>
        <IconAction
          label="Search workspace"
          className="size-8 border-transparent bg-transparent"
          onClick={() => onSearch()}
        >
          <Search />
        </IconAction>
        <WorkspaceSharing />
        <DropdownMenu>
          <ActionTooltip label="Toolbar placement">
            <DropdownMenuTrigger
              iconOnly
              variant="ghost"
              size="sm"
              aria-label="Toolbar placement"
            >
              <Pin />
            </DropdownMenuTrigger>
          </ActionTooltip>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Anchor toolbar</DropdownMenuLabel>
              {(
                [
                  "bottom-left",
                  "bottom-center",
                  "bottom-right",
                  "top-left",
                  "top-center",
                  "top-right",
                ] as const
              ).map((anchor) => (
                <DropdownMenuItem
                  key={anchor}
                  icon={
                    (desk.toolbar?.anchor ?? "bottom-left") === anchor ? (
                      <Check />
                    ) : (
                      <Pin />
                    )
                  }
                  onClick={() =>
                    deps.store.patchDesk({
                      toolbar: { anchor, inset: desk.toolbar?.inset ?? 8 },
                    })
                  }
                >
                  {anchor.replace("-", " ")}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Inset</DropdownMenuLabel>
              {[8, 16, 24].map((inset) => (
                <DropdownMenuItem
                  key={inset}
                  onClick={() =>
                    deps.store.patchDesk({
                      toolbar: {
                        anchor: desk.toolbar?.anchor ?? "bottom-left",
                        inset,
                      },
                    })
                  }
                >
                  {inset}px
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <DeskSettingsDialog
          workspace={workspace}
          onClose={() => setOpen(false)}
          onCreate={create}
          onOpenAsset={openAsset}
          onSearch={() => {
            setOpen(false);
            onSearch("> ");
          }}
        />
      )}
    </Dialog>
  );
}

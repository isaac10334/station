import { useId, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";

/** Shared hierarchy for settings content; controls own their labels and mutations. */
export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="text-sm! font-medium! leading-5! tracking-tight text-fg">
            {title}
          </h2>
          {description && (
            <p className="text-xs leading-5 text-fg-2">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SettingsRow({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-5 max-sm:flex-col max-sm:gap-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-[13px] font-medium text-fg">{title}</h3>
        <p className="max-w-[44ch] text-xs leading-5 text-fg-2">
          {description}
        </p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A nested confirmation keeps destructive settings separate from routine changes. */
export function SettingsConfirmation({
  open,
  onOpenChange,
  title,
  description,
  action,
  onConfirm,
  destructive = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader className="pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

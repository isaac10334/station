import { useState } from "react";
import { AI_GRANTS } from "../../../features/ai/application/tools";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Shield } from "../../lib/icons";

/** Stages a batch of session grants; dismissing never applies the selection. */
export function ChatGrantsDialog({
  grants,
  onApply,
}: {
  grants: ReadonlySet<string>;
  onApply: (grants: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Set(grants));
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setSelected(new Set(grants));
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" aria-label="Chat tools">
            <Shield />
            <span>{grants.size}</span>
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chat tools</DialogTitle>
          <DialogDescription>
            Choose capabilities for this widget session. Messages and approved
            tool results go to your selected model. Applying changes stops work
            and starts a fresh chat.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <fieldset className="space-y-4 py-2">
            <legend className="sr-only">Widget capability grants</legend>
            {AI_GRANTS.map((grant) => (
              <label key={grant.id} className="flex items-start gap-3">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={selected.has(grant.id)}
                  onChange={(e) =>
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (e.target.checked) next.add(grant.id);
                      else next.delete(grant.id);
                      return next;
                    })
                  }
                />
                <span>
                  <span className="block font-medium">{grant.name}</span>
                  <span className="block text-xs text-fg-3">
                    {grant.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onApply(new Set());
              setOpen(false);
            }}
          >
            Revoke all
          </Button>
          <Button
            onClick={() => {
              onApply(selected);
              setOpen(false);
            }}
          >
            Apply grants
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

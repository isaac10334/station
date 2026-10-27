import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { SettledInput } from "./settled-input";
import { cn } from "../../lib/utils";

/** Click/Enter to edit; shared draft validation, IME and Escape behavior belongs to SettledInput. */
export function InlineEdit({
  label,
  value,
  onCommit,
  validate,
  className,
  readOnly = false,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => unknown;
  validate: (value: string) => string | undefined;
  className?: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className={cn("inline-edit min-w-0", className)}>
      {editing ? (
        <div
          ref={(element) => element?.querySelector("input")?.focus()}
          onKeyDownCapture={(event) => {
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              setEditing(false);
              requestAnimationFrame(() => trigger.current?.focus());
            }
          }}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget) &&
              (event.target as HTMLInputElement).value === value
            )
              setEditing(false);
          }}
        >
          <SettledInput
            inputClassName="inline-edit-input"
            label={label}
            value={value}
            validate={validate}
            onCommit={async (next) => {
              await onCommit(next);
              setEditing(false);
              requestAnimationFrame(() => trigger.current?.focus());
            }}
          />
        </div>
      ) : readOnly ? (
        <span>{value}</span>
      ) : (
        <button
          ref={trigger}
          type="button"
          aria-label={`Edit ${label}`}
          className="inline-edit-trigger group inline-flex max-w-full items-center gap-2 rounded px-1 text-left text-inherit hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus-ring"
          onClick={() => setEditing(true)}
        >
          <span className="break-words">{value || label}</span>
          <Pencil
            aria-hidden
            size={14}
            className="shrink-0 text-fg-3 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100"
          />
        </button>
      )}
    </div>
  );
}

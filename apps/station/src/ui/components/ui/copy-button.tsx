import { useState } from "react";
import { Button } from "./button";

/** Copies inert source text. Clipboard failure stays visible and can be retried. */
export function CopyButton({
  value,
  label = "Copy",
  iconOnly: _iconOnly,
  variant: _variant,
  size: _size,
}: {
  value: string;
  label?: string;
  iconOnly?: boolean;
  variant?: string;
  size?: string;
}) {
  const [state, setState] = useState({ value: "", status: "" });
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState({ value, status: "Copied" });
        } catch {
          setState({ value, status: "Copy failed — retry" });
        }
      }}
    >
      {state.value === value && state.status ? state.status : label}
    </Button>
  );
}

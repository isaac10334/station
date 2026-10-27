import { SettledInput } from "../ui/settled-input";

/** A keyboard-editable color and native swatch share one validated saved value. */
export function ShellBackgroundControl({
  value,
  disabled,
  onChange,
}: {
  value?: string;
  disabled?: boolean;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        <span className="text-xs text-fg-3">
          Background color {value ? "" : "· From theme"}
        </span>
        <SettledInput
          label="Background color"
          value={value ?? ""}
          disabled={disabled}
          validate={(color) =>
            !color.trim() || /^#[0-9a-fA-F]{6}$/.test(color)
              ? undefined
              : "Use a six-digit hex color, or clear to inherit the theme"
          }
          onCommit={onChange}
        />
      </div>
      <span
        className="relative size-8 shrink-0 rounded border border-line"
        style={{ background: value || "var(--page)" }}
      >
        <input
          type="color"
          aria-label="Choose background color"
          className="absolute inset-0 size-full cursor-pointer opacity-0 focus-visible:opacity-100"
          value={value || "#000000"}
          disabled={disabled}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      </span>
    </div>
  );
}

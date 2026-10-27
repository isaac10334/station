import { numberError, SettledInput } from "../ui/settled-input";

/** Spacing/radius keep decimal drafts local until blur or Enter. */
export function ThemeNumberField({
  label,
  value,
  min,
  max,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-xs text-fg-2">
      <span className="capitalize">{label}</span>
      <SettledInput
        disabled={disabled}
        label={label}
        value={String(value)}
        numeric={{ min, max }}
        validate={(text) => numberError(text, min, max)}
        onCommit={(text) => onCommit(Number(text))}
      />
    </label>
  );
}

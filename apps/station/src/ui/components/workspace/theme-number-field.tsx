import { useId, useState } from "react";
import { Input } from "../ui/input";

/** Keep intermediate typing local; only a valid, settled value changes theme source. */
export function ThemeNumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const commit = () => {
    if (draft === null) return;
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next) || next < min || next > max) {
      setError(`Use a number from ${min} to ${max}.`);
      return;
    }
    onCommit(next);
    setDraft(null);
    setError("");
  };
  return (
    <label className="flex flex-col gap-2 text-xs text-fg-2">
      <span id={`${id}-label`} className="capitalize">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={draft ?? value}
        aria-invalid={!!error}
        aria-labelledby={`${id}-label`}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          setError("");
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDraft(null);
            setError("");
          }
        }}
      />
      {error && (
        <span id={`${id}-error`} role="status" className="text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

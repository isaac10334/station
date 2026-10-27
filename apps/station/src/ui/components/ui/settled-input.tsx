import { useId, useRef, useState } from "react";
import { Input } from "./input";

/** Text survives external source changes and IME. Blur/Enter validate and commit;
 * Escape restores current source. Failed commits retain the draft and error.
 */
export function SettledInput({
  label,
  value,
  onCommit,
  validate,
  numeric,
  disabled,
  className,
  inputClassName,
  multiline = false,
  trim = true,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => unknown;
  validate: (value: string) => string | undefined;
  numeric?: { min: number; max: number };
  disabled?: boolean;
  className?: string;
  /** Consumer presentation, including typography-preserving inline editing. */
  inputClassName?: string;
  multiline?: boolean;
  /** Names trim by default; documents and data cells preserve authored whitespace. */
  trim?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const composing = useRef(false);
  const commit = async (next = draft) => {
    if (next === null || composing.current || disabled || pending.current) return;
    // Merely focusing a field must not write an older value over external edits.
    if (next === baseline.current) {
      setDraft(null);
      setError("");
      return;
    }
    try {
      const problem = validate(next);
      if (problem) {
        setError(problem);
        return;
      }
      const committed = trim ? next.trim() : next;
      const result = onCommit(committed);
      if (result instanceof Promise) {
        pending.current = true; setSaving(true);
        await result;
      }
      baseline.current = committed;
      setDraft(null);
      setError("");
    } catch (error) {
      setError(String(error));
    } finally {
      pending.current = false; setSaving(false);
    }
  };
  const baseline = useRef(value);
  const Control = multiline ? "textarea" : Input;
  return (
    <div className={className} aria-busy={saving}>
      <Control
        className={[multiline ? "min-h-20 w-full resize-y rounded-md border border-line-2 bg-frame px-2 py-2 text-xs text-fg outline-none focus-visible:border-fg-3 aria-invalid:border-danger" : "aria-invalid:border-danger", inputClassName].filter(Boolean).join(" ")}
        aria-label={label}
        value={draft ?? value}
        disabled={disabled || saving}
        inputMode={numeric ? "decimal" : "text"}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onFocus={() => {
          baseline.current = value;
          setDraft((current) => current ?? value);
        }}
        onChange={(e) => {
          if (draft === null) baseline.current = value;
          setDraft(e.target.value);
          setError("");
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onBlur={() => commit()}
        onKeyDown={(e) => {
          if (
            composing.current ||
            e.nativeEvent.isComposing ||
            e.keyCode === 229
          )
            return;
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            baseline.current = value;
            setDraft(value);
            setError("");
          } else if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.stopPropagation();
            commit();
          } else if (
            numeric &&
            (e.key === "ArrowUp" || e.key === "ArrowDown")
          ) {
            e.preventDefault();
            const text = draft ?? value;
            const problem = validate(text);
            if (problem) {
              setError(problem);
              return;
            }
            const next = Math.min(
              numeric.max,
              Math.max(
                numeric.min,
                Number(text) +
                  (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1),
              ),
            );
            setDraft(String(next));
            setError("");
          }
        }}
      />
      {error && (
        <p
          id={`${id}-error`}
          role="status"
          className="mt-1 text-xs text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Decimal input excludes empty strings and Number's hexadecimal coercion. */
export function numberError(text: string, min: number, max: number) {
  return !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text.trim()) ||
    !Number.isFinite(Number(text)) ||
    Number(text) < min ||
    Number(text) > max
    ? `Use a number from ${min} to ${max}, then press Enter or leave the field.`
    : undefined;
}

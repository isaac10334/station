import { assetReferenceSchema, type AssetReference } from "./asset-references";

/** Serializable field intent. Editor names select trusted renderers; they never
 * load code or confer permission. Commands must validate committed values again. */
export type PropertyField = {
  key: string;
  label: string;
  type:
    "text" | "number" | "boolean" | "select" | "json" | "markdown" | "asset";
  editor?: string;
  description?: string;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
  options?: readonly string[];
  readOnly?: boolean;
};

/** Validate reference shape without resolving identity or granting access. The
 * consumer supplies compatibility choices and revalidates its authorized commit.
 * Null/undefined mean unassigned; required references cannot be cleared. */
export function parsePropertyReference(field: PropertyField, value: unknown): AssetReference | undefined {
  if (value === null || value === undefined) {
    if (field.required) throw new Error(`${field.label} is required.`);
    return undefined;
  }
  const result = assetReferenceSchema.safeParse(value);
  if (!result.success) throw new Error(`Choose a valid ${field.label} reference.`);
  return result.data;
}

/** Parse once for display widgets and inspectors, without Number's empty/hex coercion. */
export function parsePropertyText(field: PropertyField, text: string): unknown {
  if (field.required && !text.trim())
    throw new Error(`${field.label} is required.`);
  if (text.length > (field.maxLength ?? 8192))
    throw new Error(`${field.label} is too long.`);
  if (field.type === "json") return JSON.parse(text);
  if (field.type === "number") {
    if (!text.trim() && !field.required) return null;
    if (
      !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) ||
      !Number.isFinite(Number(text))
    )
      throw new Error("Enter a finite number.");
    return Number(text);
  }
  return text;
}

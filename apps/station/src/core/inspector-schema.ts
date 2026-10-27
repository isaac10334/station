/** Serializable starting point for schema-driven inspectors. New field kinds can
 * be added without serializing React components or callbacks into workspace data.
 */
import type { PropertyDescriptor } from "@loop-kit/ui";
/** Portable references plus Station's field validation intent, reusable by another renderer. */
export function inspectorDescription(
  fields: readonly InspectorField[],
  source = "inspected",
  readOnly = false,
): readonly (PropertyDescriptor & { readonly field: InspectorField })[] {
  return fields.map((field) => ({
    id: field.key,
    label: field.label,
    element: "input",
    reference: { source, key: field.key },
    readOnly: readOnly || field.readOnly,
    field,
  }));
}
export type InspectorField = {
  key: string;
  label: string;
  type: "string";
  editor?: string;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
  readOnly?: boolean;
};
export const ASSET_METADATA_FIELDS: readonly InspectorField[] = [
  {
    key: "name",
    label: "Title",
    type: "string",
    required: true,
    maxLength: 200,
  },
  {
    key: "description",
    label: "Description",
    type: "string",
    editor: "markdown",
    multiline: true,
    maxLength: 4000,
  },
];
export function validateInspectorField(
  field: InspectorField,
  value: unknown,
): string | undefined {
  if (typeof value !== "string") return `${field.label} must be text.`;
  if (field.required && !value.trim()) return `${field.label} is required.`;
  if (field.maxLength && value.length > field.maxLength)
    return `${field.label} must be ${field.maxLength} characters or fewer.`;
}
export function parseAssetMetadataPatch(value: unknown): {
  name?: string;
  description?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected asset metadata fields.");
  const patch: Record<string, string> = {};
  for (const [key, text] of Object.entries(value)) {
    const field = ASSET_METADATA_FIELDS.find((item) => item.key === key);
    if (!field) throw new Error(`Unknown asset metadata field: ${key}`);
    const error = validateInspectorField(field, text);
    if (error) throw new Error(error);
    patch[key] = (text as string).trim();
  }
  return patch;
}

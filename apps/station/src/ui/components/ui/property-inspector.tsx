import type { InspectorField } from "../../../core/inspector-schema";
import {
  validateInspectorField,
  inspectorDescription,
} from "../../../core/inspector-schema";
import { PropertyEditor } from "./property-editor";
import { readReference } from "@loop-kit/ui";

/** Small schema-driven form. The caller owns validation at the command boundary,
 * persistence and serialization; drafts never mutate the inspected object.
 */
export function PropertyInspector({
  fields,
  value,
  readOnly = false,
  onCommit,
}: {
  fields: readonly InspectorField[];
  value: Readonly<Record<string, unknown>>;
  readOnly?: boolean;
  onCommit: (key: string, value: string) => void;
}) {
  const descriptors = inspectorDescription(fields, "inspected", readOnly);
  const sources = {
    inspected: Object.fromEntries(
      fields.map((field) => [field.key, String(value[field.key] ?? "")]),
    ),
  };
  return (
    <div className="space-y-4">
      {descriptors.map((descriptor) => {
        const field = descriptor.field;
        return (
          <div
            key={descriptor.id}
            data-property-id={descriptor.id}
            data-value-source={descriptor.reference.source}
            className="block space-y-1.5 text-xs"
          >
            <span className="block font-medium text-fg-3">{field.label}</span>
            <PropertyEditor
              field={{ ...field, type: field.editor === "markdown" ? "markdown" : "text" }}
              value={readReference(descriptor.reference, sources)}
              readOnly={descriptor.readOnly}
              onCommit={(next) => {
                const text = String(next).trim();
                const error = validateInspectorField(field, text);
                if (error) throw new Error(error);
                onCommit(descriptor.reference.key, text);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

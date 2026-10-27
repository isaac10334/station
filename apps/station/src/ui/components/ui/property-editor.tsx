import {
  createContext,
  useContext,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  parsePropertyText,
  parsePropertyReference,
  type PropertyField,
} from "../../../core/property-editors";
import { SettledInput } from "./settled-input";
import { NativeSelect } from "./native-select";
import { CodeInput } from "./code-input";
import { Button } from "./button";
import { MorphingEditor } from "./morphing-editor";
import { RichTextEditor } from "./rich-text-editor";
import { AssetReferencePicker, type AssetReferenceEditorContext } from "./asset-reference-picker";

export type PropertyEditorProps = {
  field: PropertyField;
  value: unknown;
  readOnly?: boolean;
  onCommit: (value: unknown) => void | Promise<void>;
  /** Host-supplied choices and actions; never part of the serializable field. */
  reference?: AssetReferenceEditorContext;
};
type EditorRegistration = {
  id: string;
  types: readonly PropertyField["type"][];
  component: ComponentType<PropertyEditorProps>;
};
const Editors = createContext<readonly EditorRegistration[]>([]);
/** Scoped trusted UI registration. Persist only editor IDs in descriptors, never
 * React values or authority. Incompatible/missing editors fall back to the type.
 * @example <PropertyEditorsProvider editors={[{id:'rating',types:['number'],component:Rating}]}>{children}</PropertyEditorsProvider>
 */
export function PropertyEditorsProvider({
  editors,
  children,
}: {
  editors: readonly EditorRegistration[];
  children: ReactNode;
}) {
  return <Editors.Provider value={editors}>{children}</Editors.Provider>;
}

/** Display and editing resolve through the same type contract in tables/settings. */
export function PropertyEditor(props: PropertyEditorProps) {
  const editors = useContext(Editors),
    { field, value, onCommit } = props;
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const immediate = async (value: unknown) => {
    setSaving(true);
    setError("");
    try {
      await onCommit(value);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const readOnly = props.readOnly || field.readOnly;
  const custom = editors.find(
    (editor) => editor.id === field.editor && editor.types.includes(field.type),
  );
  if (custom) return <custom.component {...props} readOnly={readOnly} />;
  if (field.type === "asset" && props.reference)
    return <ReferenceProperty {...props} readOnly={readOnly} />;
  if (field.type === "asset") {
    const reference =
      value && typeof value === "object" && "assetId" in value
        ? String(value.assetId)
        : "None";
    return (
      <div className="space-y-1 text-xs">
        <code className="break-all text-fg-2">{reference}</code>
        {!readOnly && (
          <p className="text-fg-3">
            Choose a compatible reference editor for this field.
          </p>
        )}
      </div>
    );
  }
  if (field.type === "json")
    return <JsonProperty {...props} readOnly={readOnly} />;
  if (field.type === "markdown") return <MarkdownProperty {...props} readOnly={readOnly} />;
  if (readOnly)
    return (
      <span className="block whitespace-pre-wrap break-words text-sm text-fg-2">
        {field.type === "boolean"
          ? value
            ? "Yes"
            : "No"
          : String(value ?? "") || "—"}
      </span>
    );
  if (field.type === "boolean" || field.type === "select")
    return (
      <div aria-busy={saving}>
        {field.type === "boolean" ? (
          <input
            className="size-4 accent-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            type="checkbox"
            disabled={saving}
            aria-label={field.label}
            checked={value === true}
            onChange={(e) => void immediate(e.target.checked)}
          />
        ) : (
          <NativeSelect
            disabled={saving}
            aria-label={field.label}
            value={String(value ?? "")}
            onChange={(e) => void immediate(e.target.value)}
          >
            <option value="">Unassigned</option>
            {[...new Set([...(field.options ?? []), String(value ?? "")])]
              .filter(Boolean)
              .map((option) => (
                <option key={option}>{option}</option>
              ))}
          </NativeSelect>
        )}
        {error && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <SettledInput
      label={field.label}
      value={String(value ?? "")}
      multiline={field.multiline}
      trim={false}
      validate={(text) => {
        try {
          parsePropertyText(field, text);
        } catch (error) {
          return String((error as Error).message);
        }
      }}
      onCommit={(text) => onCommit(parsePropertyText(field, text))}
    />
  );
}

function ReferenceProperty({ field, value, onCommit, readOnly, reference }: PropertyEditorProps) {
  let parsed: ReturnType<typeof parsePropertyReference>, invalid = "";
  try { parsed = parsePropertyReference({ ...field, required: false }, value); }
  catch (reason) { invalid = (reason as Error).message; }
  if (!reference) return null;
  if (readOnly && invalid) return <p role="alert" className="text-xs text-danger">{invalid}</p>;
  if (readOnly) {
    const option = reference.options.find(option => option.assetId === parsed?.assetId && option.path === parsed?.path);
    return <span className="block break-words text-sm text-fg-2">{option?.label ?? (parsed ? `Missing: ${parsed.assetId}` : "Unassigned")}</span>;
  }
  return <div className="min-w-0"><AssetReferencePicker {...reference} label={field.label} value={parsed} clearable={!field.required}
    onChange={async next => { await onCommit(parsePropertyReference(field, next)); }} />
    {invalid && <p role="alert" className="mt-1 text-xs text-danger">{invalid}</p>}
  </div>;
}

function MarkdownProperty({ field, value, onCommit, readOnly }: PropertyEditorProps) {
  const current = useRef(value); current.current = value;
  const [dirty, setDirty] = useState(false);
  return <MorphingEditor label={field.label} preview={String(value ?? "").replace(/[#*_`>\[\]]/g, "")} kind="Markdown" dirty={dirty}><RichTextEditor onDirtyChange={setDirty} contained readOnly={readOnly} label={field.label} source={String(value ?? "")} format="markdown" maxLength={field.maxLength ?? 8192} allowCreateAsset onCommit={async (text, expected) => {
    if (String(current.current ?? "") !== expected) throw new Error("This property changed. Reload before saving your draft.");
    await onCommit(parsePropertyText(field, text));
  }} /></MorphingEditor>;
}

function JsonProperty({
  field,
  value,
  readOnly,
  onCommit,
}: PropertyEditorProps) {
  const stored = JSON.stringify(value ?? null, null, 2),
    [draft, setDraft] = useState<string | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const baseline = useRef(stored);
  return (
    <MorphingEditor dirty={draft !== null && draft !== stored} label={field.label} kind="JSON" preview={JSON.stringify(value ?? null)}><div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-48 flex-1 overflow-hidden rounded-xl border border-line">
        <CodeInput
          label={field.label}
          value={readOnly ? stored : (draft ?? stored)}
          readOnly={readOnly || saving}
          onChange={(text) => {
            if (draft === null) baseline.current = stored;
            setDraft(text);
            setError("");
          }}
        />
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            aria-busy={saving}
            disabled={saving || draft === null || draft === stored}
            onClick={async () => {
              setSaving(true);
              try {
                if (stored !== baseline.current)
                  throw new Error(
                    "Source changed while editing. Copy your draft, then Reset to load the current value.",
                  );
                await onCommit(
                  parsePropertyText(
                    { ...field, maxLength: field.maxLength ?? 262144 },
                    draft ?? stored,
                  ),
                );
                setDraft(null);
                setError("");
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Apply changes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={saving || draft === null}
            onClick={() => {
              setDraft(null);
              setError("");
            }}
          >
            Reset
          </Button>
          <span className="ml-auto text-xs text-fg-3" role="status">
            {saving ? "Saving…" : draft === null ? "Saved" : "Unsaved draft"}
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div></MorphingEditor>
  );
}

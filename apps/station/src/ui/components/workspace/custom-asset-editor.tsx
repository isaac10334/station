import { useState, useSyncExternalStore } from "react";
import type { DataAsset } from "../../../core/asset-state";
import { portableSchema } from "../../../core/portable-schema";
import { deps } from "../../../composition";
import { controlOperation } from "../../lib/control-operation";
import { Button } from "../ui/button";
import { PropertyEditor } from "../ui/property-editor";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { EditorWorkspace, useEditorOwner } from "./editor-workspace";

/** Activated type schemas select the same field widgets as records/settings.
 * Host commands repeat schema checks; source recovery stays available without a type. */
export function CustomAssetEditor({
  asset,
  ownerId,
  source = false,
}: {
  asset: DataAsset;
  ownerId: string;
  source?: boolean;
}) {
  useSyncExternalStore(deps.programs.subscribe, deps.programs.version);
  const session = useEditorOwner(asset, ownerId),
    [error, setError] = useState(""),
    [recover, setRecover] = useState(false),
    [mode, setMode] = useState("form");
  let type = "Unavailable custom type",
    content: unknown,
    schema: ReturnType<typeof portableSchema> | undefined;
  try {
    type = JSON.parse(asset.files["extension.json"] ?? "{}").type ?? type;
    content = JSON.parse(asset.files["content.json"] ?? "null");
  } catch {}
  const active = deps.programs
    .contributions()
    .find((item) => item.assetType?.id === type);
  try {
    if (active?.assetType) schema = portableSchema(active.assetType.schema);
  } catch {}
  if (source || recover)
    return <EditorWorkspace session={session} ownerId={ownerId} />;
  const save = async (value: unknown) => {
    try {
      await controlOperation("assets.custom.update", {
        assetId: asset.id,
        expectedAssetRevision: asset.revision,
        content: value,
      });
      setError("");
    } catch (reason) {
      setError(String(reason));
      throw reason;
    }
  };
  const object =
    content && typeof content === "object" && !Array.isArray(content)
      ? (content as Record<string, unknown>)
      : undefined;
  const form = !!(schema?.type === "object" && schema.properties && object);
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="mr-auto text-sm">{asset.name}</strong>
        <Button size="sm" variant="ghost" onClick={() => setRecover(true)}>
          Recovery source editor
        </Button>
      </div>
      <p className="text-xs text-fg-3">
        {type}
        {!active
          ? " · Type unavailable. Enable its extension to edit; source remains intact."
          : " · Validated against the active type schema"}
      </p>
      {form && (
        <ToggleGroup
          required
          size="sm"
          className="self-start"
          aria-label="Document presentation"
          value={[mode]}
          onValueChange={([value]) => setMode(value)}
        >
          <ToggleGroupItem value="form">Properties</ToggleGroupItem>
          <ToggleGroupItem value="json">JSON</ToggleGroupItem>
        </ToggleGroup>
      )}
      {form && mode === "form" ? (
        <div className="space-y-4">
          {Object.entries(schema!.properties!).map(([key, field]) => (
            <div key={key} className="space-y-1.5">
              <p className="text-xs font-medium text-fg-3">
                {key}
                {schema?.required?.includes(key) ? " *" : ""}
              </p>
              <PropertyEditor
                field={{
                  key,
                  label: key,
                  type: field.enum?.every((value) => typeof value === "string")
                    ? "select"
                    : field.type === "boolean"
                      ? "boolean"
                      : field.type === "number" || field.type === "integer"
                        ? "number"
                        : field.type === "string"
                          ? "text"
                          : "json",
                  options: field.enum?.filter(
                    (value): value is string => typeof value === "string",
                  ),
                  required: schema?.required?.includes(key),
                }}
                value={object![key]}
                readOnly={!active}
                onCommit={(value) => save({ ...object, [key]: value })}
              />
              {field.description && (
                <p className="text-xs text-fg-3">{field.description}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <PropertyEditor
          field={{
            key: "content",
            label: "Document data",
            type: "json",
            maxLength: 16384,
          }}
          value={content}
          readOnly={!active}
          onCommit={save}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

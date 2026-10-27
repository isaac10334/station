import { useState, useSyncExternalStore } from "react";
import { deps } from "../../../composition";
import { controlOperation } from "../../lib/control-operation";
import { Button } from "../ui/button";
import { PropertyEditor } from "../ui/property-editor";
/** Host-rendered extension fields cannot replace privileged settings or grant access. */
export function ExtensionSettings() {
  useSyncExternalStore(deps.store.subscribe, deps.store.get);
  useSyncExternalStore(deps.programs.subscribe, deps.programs.version);
  const [error, setError] = useState("");
  const run = (method: string, params: unknown) =>
    void controlOperation(method, params).catch((reason) =>
      setError(String(reason)),
    );
  return (
    <section className="space-y-4" aria-label="Extension settings">
      <h3 className="text-sm font-medium">Extension settings</h3>
      <p className="text-xs text-fg-3">
        Rows belong to the named activated instance. Rendering these fields
        grants no capabilities.
      </p>
      {deps.programs
        .contributions()
        .filter((item) => item.fields.length || item.assetType)
        .map((item) => (
          <fieldset
            key={item.instanceId}
            className="space-y-3 rounded border border-line p-3"
          >
            <legend className="px-1 text-xs font-medium">{item.title}</legend>
            <p className="break-all text-xs text-fg-3">{item.instanceId}</p>
            {item.fields.map((field) => {
              const value =
                item.configuration[field.key] ??
                field.value ??
                (field.type === "toggle" ? false : "");
              const configure = (value: unknown) => {
                const instance = deps.store
                  .active()
                  .programming!.instances.find(
                    (value) => value.id === item.instanceId,
                  )!;
                return controlOperation("programs.configure", {
                  instanceId: item.instanceId,
                  expectedInstanceRevision: instance.revision,
                  configuration: {
                    ...instance.configuration,
                    [field.key]: value,
                  },
                }).then(() => {
                  setError("");
                });
              };
              return field.type === "action" ? (
                <Button
                  key={field.key}
                  size="sm"
                  onClick={() =>
                    run("programs.action", {
                      instanceId: item.instanceId,
                      method: field.key,
                      input: null,
                    })
                  }
                >
                  {field.label}
                </Button>
              ) : (
                <div key={field.key} className="space-y-1.5 text-xs">
                  <p className="font-medium text-fg-3">{field.label}</p>
                  <PropertyEditor
                    field={{
                      key: field.key,
                      label: field.label,
                      type: field.type === "toggle" ? "boolean" : "text",
                    }}
                    value={value}
                    onCommit={configure}
                  />
                </div>
              );
            })}
            {item.assetType && (
              <div className="space-y-2">
                <p className="text-xs">Asset type: {item.assetType.id}</p>
                <Button
                  size="sm"
                  onClick={() =>
                    run("programs.createAsset", {
                      instanceId: item.instanceId,
                      name: item.title + " document",
                    })
                  }
                >
                  Create document
                </Button>
              </div>
            )}
          </fieldset>
        ))}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

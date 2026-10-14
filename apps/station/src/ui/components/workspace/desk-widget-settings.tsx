import { useState } from "react";
import type { Workspace } from "../../../core/model";
import { deps } from "../../../composition";
import { widgetDefinitions } from "../../widget-catalog";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { SettingsSection } from "./settings-section";

/** Controls menu visibility only; hiding a definition leaves its mounted instances intact. */
export function DeskWidgetSettings({
  workspace,
  onNotice,
}: {
  workspace: Workspace;
  onNotice: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const desk = deps.store.desk();
  const definitions = widgetDefinitions(workspace.assets, workspace).filter(
    (item) => item.create,
  );
  const visible = definitions.filter((item) =>
    item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <SettingsSection
      title="Widget menu"
      description="Choose what appears in Add widgets on this desk. Existing widgets stay in place."
    >
      <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">
        Find widgets
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name…"
        />
      </label>
      {(
        [
          ["builtin", "Built-in widgets"],
          ["authored-asset", "Asset widgets and editors"],
          ["package", "Installed widgets"],
        ] as const
      ).map(([provider, title]) => {
        const items = visible.filter((item) => item.provider === provider);
        if (!items.length) return null;
        return (
          <section
            key={provider}
            className="flex flex-col gap-1"
            aria-label={title}
          >
            <h3 className="pb-1 text-xs font-medium text-fg-2">{title}</h3>
            {items.map((item) => (
              <Switch
                key={item.id}
                label={item.title}
                size="sm"
                className="min-h-11 items-center border-b border-line/60 py-3 last:border-0"
                checked={!desk.hiddenDefinitions.includes(item.id)}
                onCheckedChange={(checked) => {
                  deps.store.patchDesk({
                    hiddenDefinitions: checked
                      ? desk.hiddenDefinitions.filter((id) => id !== item.id)
                      : [...desk.hiddenDefinitions, item.id],
                  });
                  onNotice(
                    `${item.title} ${checked ? "shown in" : "hidden from"} Add widgets.`,
                  );
                }}
              />
            ))}
          </section>
        );
      })}
      {!visible.length && (
        <p className="py-8 text-center text-sm text-fg-2">
          No widgets match “{query}”.
        </p>
      )}
    </SettingsSection>
  );
}

import { ScriptBindingProperty } from "./script-binding-property";
import { patchOwnerFiles } from "../../lib/owner-commands";
import { BUILTIN_AUTHORED_SURFACES } from "../../../core/authored-surface";
import { AuthoredSurfaceView } from "./authored-surface";
import { controlOperation } from "../../lib/control-operation";
import type { ScriptOutput } from "../../../contracts/script-runtime";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "../ui/dialog";
import { actionTargetCommands } from "../../../core/widget-action-targets";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Layers,
  Search,
  Eye,
  PanelLeft,
  Play,
  Table,
  Code,
} from "lucide-react";
import {
  actionButtonSchema,
  actionButtonName,
} from "../../../core/action-buttons";
import { type Panel } from "../../../core/docking";
import { deps } from "../../../composition";
import { svgIconUrl } from "../../../services/svg-icons";
import { useDockController } from "../../docking/react";
import { Button } from "../ui/button";
import { SettledInput } from "../ui/settled-input";
import { NativeSelect } from "../ui/native-select";
import { AssetReferencePicker } from "./asset-reference-picker";
const icons = { Plus, Layers, Search, Eye, PanelLeft, Play, Table, Code };
export function RuntimeActionButton({
  panel,
  compact = false,
}: {
  panel: Panel;
  compact?: boolean;
}) {
  const { layout, command, focusPanel, openCatalog } = useDockController(),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [confirmationOpen, setConfirmationOpen] = useState(false),
    [result, setResult] = useState("");
  const controller = useRef<AbortController | null>(null);
  const configKey = JSON.stringify(panel.actionButton);
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setResult("");
    setError("");
    setConfirmationOpen(false);
    return () => controller.current?.abort();
  }, [panel.id, configKey]);
  const config = actionButtonSchema.parse(panel.actionButton ?? {}),
    Icon = icons[config.icon];
  let iconUrl: string | undefined;
  try {
    if (config.iconAsset)
      iconUrl = svgIconUrl(
        deps.store
          .active()
          .assets.find((a) => a.id === config.iconAsset!.assetId)?.files?.[
          config.iconAsset.path
        ] ?? "",
      );
  } catch {}
  const graphic = iconUrl ? (
    <span
      className="size-4 bg-current"
      style={{ mask: `url("${iconUrl}") center/contain no-repeat` }}
    />
  ) : (
    <Icon size={15} />
  );
  const act = async () => {
    setConfirmationOpen(false);
    setError("");
    setResult("");
    const call = new AbortController();
    controller.current?.abort();
    controller.current = call;
    try {
      if (config.action === "assets.open") {
        if (!config.assetId) throw new Error("Choose an asset in settings");
        const result = command({ type: "openAsset", assetId: config.assetId });
        if (!result.ok) throw new Error(result.reason);
        return;
      }
      if (config.action === "scripts.run") {
        if (!config.assetId) throw new Error("Choose a script in settings");
        setBusy(true);
        const output = await controlOperation<ScriptOutput>(
          "scripts.run",
          { assetId: config.assetId, input: JSON.parse(config.inputJson) },
          call.signal,
        );
        if (!call.signal.aborted) setResult(JSON.stringify(output.value));
        return;
      }
      if (config.action === "widgets.add") {
        openCatalog({ surface: "main", intent: "tab" });
        return;
      }
      const target = config.targetId && layout.panels[config.targetId];
      if (!target)
        throw new Error("Choose an existing target widget in settings");
      if (config.action === "panel.focus") {
        focusPanel(target.id);
        return;
      }
      for (const action of actionTargetCommands(
        layout,
        target.id,
        config.action === "panel.toggle",
      )) {
        const result = command(action);
        if (!result.ok) throw new Error(result.reason);
      }
      setError("");
    } catch (e) {
      if (!call.signal.aborted) setError(String(e));
    } finally {
      if (controller.current === call) setBusy(false);
    }
  };
  const name = actionButtonName(config, panel.displayName);
  const tooltip =
    error || result || (config.tooltip === undefined ? name : config.tooltip);
  return (
    <span className={`inline-flex min-w-0 flex-col ${config.fullWidth && !compact ? "w-full" : ""}`}>
      <AuthoredSurfaceView surface={panel.surface ?? BUILTIN_AUTHORED_SURFACES["action-button"]}
        inputs={{ name, label: busy && config.label ? "Running�" : config.label, busy, error: compact ? "" : error, result: compact ? "" : result }}
        buttonAppearance={{ variant: compact ? "ghost" : config.variant, fullWidth: config.fullWidth, graphic, tooltip }}
        actions={{ activate: () => { if (config.confirmation) setConfirmationOpen(true); else void act(); } }} />
      {compact && (error || result) && <span role={error ? "alert" : "status"} className="sr-only">{error || result}</span>}
      <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-fg-2">{config.confirmation}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmationOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void act()}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
export function ActionButtonSettings({ panel }: { panel: Panel }) {
  const { layout, command, panelTitle } = useDockController(),
    config = actionButtonSchema.parse(panel.actionButton ?? {});
  const patch = (value: object) =>
    command({
      type: "configureActionButton",
      panelId: panel.id,
      config: actionButtonSchema.parse({
        ...actionButtonSchema.parse(
          deps.store.active().dock.panels[panel.id]?.actionButton ?? {},
        ),
        ...value,
      }),
    });
  const workspace = deps.store.active();
  const iconOptions = workspace.assets.flatMap((a) =>
    Object.keys(a.files ?? {})
      .filter((p) => p.endsWith(".svg"))
      .map((path) => ({ assetId: a.id, path, label: `${a.name} / ${path}` })),
  );
  return (
    <div className="space-y-3">
      <label className="block text-xs">
        Appearance
        <NativeSelect
          aria-label="Action appearance"
          value={config.variant}
          onChange={(e) => patch({ variant: e.target.value })}
        >
          {["default", "secondary", "outline", "ghost"].map((value) => (
            <option key={value} value={value}>
              {value === "default" ? "Primary" : value}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={config.fullWidth}
          onChange={(e) => patch({ fullWidth: e.target.checked })}
        />
        Fill widget width
      </label>
      <label className="block text-xs">
        Confirm before running
        <SettledInput
          label="Action confirmation"
          value={config.confirmation ?? ""}
          validate={(v) =>
            v.length > 300 ? "Use at most 300 characters" : undefined
          }
          onCommit={(confirmation) => patch({ confirmation })}
        />
      </label>
      {["assets.open", "scripts.run"].includes(config.action) && (
        <>
          <label className="block text-xs">
            {config.action === "scripts.run" ? "Script" : "Asset"}
            <NativeSelect
              aria-label="Action asset"
              value={config.assetId ?? ""}
              onChange={(e) => patch({ assetId: e.target.value || undefined })}
            >
              <option value="">Choose asset…</option>
              {workspace.assets
                .filter(
                  (asset) =>
                    config.action !== "scripts.run" ||
                    (asset.kind === "script" && !asset.files?.["program.json"]),
                )
                .map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
            </NativeSelect>
          </label>
          {config.action === "scripts.run" && <ScriptBindingProperty key={config.assetId ?? "unassigned"} workspaceId={workspace.id} assets={workspace.assets} assetId={config.assetId} inputJson={config.inputJson}
            onReference={assetId => patch({ assetId })} onInput={inputJson => patch({ inputJson })}
            onOpen={assetId => command({ type: "openAsset", assetId })}
            onCreate={name => deps.control.execute({ method: "asset.create", params: { name, kind: "script", files: { "main.js": "return { value: input };" } } }).result.id}
            onFork={assetId => deps.control.execute({ method: "asset.fork", params: { assetId, name: "Action script variant" } }).result.id}
            onPatch={(assetId, source, expected) => { const current = deps.store.active().assets.find(asset => asset.id === assetId); if (current?.files?.["main.js"] !== expected) throw new Error("Source changed. Copy your draft, then Reload source."); patchOwnerFiles(assetId, { "main.js": source }); }} />}

        </>
      )}
      <label className="block text-xs">
        Label
        <SettledInput
          label="Action label"
          value={config.label}
          validate={(v) =>
            v.trim().length <= 80 ? undefined : "Use 1–80 characters"
          }
          onCommit={(label) => patch({ label })}
        />
      </label>
      <p className="text-xs text-fg-3">
        Leave the label empty for an icon-only button.
      </p>
      <label className="block text-xs">
        Tooltip
        <SettledInput
          label="Action tooltip"
          value={config.tooltip ?? ""}
          validate={(v) =>
            v.trim().length <= 240 ? undefined : "Use at most 240 characters"
          }
          onCommit={(tooltip) => patch({ tooltip })}
        />
      </label>
      <label className="block text-xs">
        Icon
        <NativeSelect
          aria-label="Action icon"
          value={config.icon}
          onChange={(e) => patch({ icon: e.target.value })}
        >
          {Object.keys(icons).map((id) => (
            <option key={id}>{id}</option>
          ))}
        </NativeSelect>
      </label>
      <AssetReferencePicker
        label="action icon"
        workspaceId={workspace.id}
        options={iconOptions}
        value={config.iconAsset}
        onChange={(iconAsset) => { const result = patch({ iconAsset }); if (!result.ok) throw new Error(result.reason); }}
      />
      <label className="block text-xs">
        Command
        <NativeSelect
          aria-label="Action command"
          value={config.action}
          onChange={(e) => patch({ action: e.target.value })}
        >
          {Object.entries({
            "panel.activate": "Open target tab",
            "panel.toggle": "Toggle target dock or window",
            "panel.focus": "Focus target widget",
            "widgets.add": "Add a widget",
            "assets.open": "Open an asset",
            "scripts.run": "Run a JSON script",
          }).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </label>
      {["panel.activate", "panel.toggle", "panel.focus"].includes(
        config.action,
      ) && (
        <label className="block text-xs">
          Target instance
          <NativeSelect
            aria-label="Action target instance"
            value={config.targetId ?? ""}
            onChange={(e) => patch({ targetId: e.target.value || undefined })}
          >
            <option value="">Choose widget…</option>
            {Object.values(layout.panels)
              .filter((p) => p.id !== panel.id && p.id !== layout.rootId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {panelTitle(p)} · {p.id.slice(-6)}
                </option>
              ))}
          </NativeSelect>
        </label>
      )}
      <p className="text-xs text-fg-3">
        Drag this widget into the main toolbar to place it there. Right-click it
        there to configure it.
      </p>
    </div>
  );
}

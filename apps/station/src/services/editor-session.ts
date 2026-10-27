import { parseDeskTemplate } from "../core/desk-templates";
import { parseWidgetRecipe } from "../core/widget-definitions";
import type { Asset } from "../core/asset-state";
import { assetFiles } from "../core/source-project";
import { WorkerClient } from "./worker-client";
import { buildWebProject, type WebBuild } from "./web-build";
import { parseTheme } from "../core/theme-assets";
import { parseManifest } from "../core/package-assets";
import { EditorState } from "@codemirror/state";
import { dataDocumentSchema } from "../core/data-sources";

const scriptPrefix = "function __stationScript(input) {\nconst row = input;\n";

export interface Problem {
  path: string;
  from: number;
  to: number;
  severity: "error" | "warning";
  message: string;
}
/** One editor owner's presentation/session state; source writes stay in the workspace store. */
export class EditorSession {
  /** Trusted host adapter for non-asset drafts. Consumers still own validation and writes.
   * The adapter never enters persisted state or a guest SDK.
   */
  sourceAdapter?: { editable: boolean; patch: (patch: Record<string, string | null>) => void };
  version = 0;
  private controller = new AbortController();
  asset: Asset;
  selected: string;
  tabs: string[];
  problems: Problem[] = [];
  error = "";
  busy = false;
  preview: WebBuild | null = null;
  previewRun = 0;
  readonly documents = new Map<
    string,
    { state: EditorState; scroll: number }
  >();
  private listeners = new Set<() => void>();
  private worker?: WorkerClient;
  private disposed = false;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(asset: Asset) {
    this.asset = asset;
    this.selected = Object.keys(assetFiles(asset))[0] ?? "";
    this.tabs = this.selected ? [this.selected] : [];
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  publish() {
    if (!this.disposed) {
      this.version++;
      this.listeners.forEach((listener) => listener());
    }
  }
  select(path: string) {
    if (assetFiles(this.asset)[path] === undefined)
      throw new Error("File not found");
    this.selected = path;
    if (!this.tabs.includes(path)) this.tabs = [...this.tabs, path];
    this.publish();
  }
  close(path: string) {
    this.tabs = this.tabs.filter((item) => item !== path);
    if (this.selected === path) this.selected = this.tabs[0] ?? "";
    this.publish();
  }
  update(asset: Asset) {
    const changed = asset.revision !== this.asset.revision;
    this.asset = asset;
    const files = assetFiles(asset);
    this.tabs = this.tabs.filter((path) => files[path] !== undefined);
    if (files[this.selected] === undefined)
      this.selected = this.tabs[0] ?? Object.keys(files)[0] ?? "";
    if (this.selected && !this.tabs.includes(this.selected))
      this.tabs.push(this.selected);
    if (changed) {
      this.generation++;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.diagnose(), 250);
    }
    this.publish();
  }
  private async language() {
    if (!this.worker) {
      const tools = await import("../generated/web-tools");
      if (this.disposed) throw new Error("Editor closed");
      this.worker = new WorkerClient(tools.languageWorker);
      await this.worker.request({ op: "init", resources: tools.resources });
      if(this.asset.kind==='script'&&assetFiles(this.asset)['program.json']) {
        const {resources}=await import('../generated/program-resources');
        await this.worker.request({op:'init',resources:{...tools.resources,...resources,'node_modules/@station/sdk/index.d.ts':`import {createGuestSdk} from '@loop-kit/scripting'; declare const sdk: ReturnType<typeof createGuestSdk>; export const ui: typeof sdk.ui; export const invoke: typeof sdk.invoke; export const subscribe: typeof sdk.subscribe; export const configuration:Readonly<Record<string,string|boolean>>; declare global { namespace JSX { interface IntrinsicElements { [name:string]: any } } }`},program:true});
      }
    }
    return this.worker;
  }
  async diagnose() {
    if (this.asset.kind === "data-source") {
      try { dataDocumentSchema.parse(JSON.parse(assetFiles(this.asset)["data.json"] ?? "")); this.problems = []; }
      catch (error) { this.problems = [{path:"data.json",from:0,to:1,severity:"error",message:String(error)}]; }
      this.publish(); return;
    }
    if (this.asset.kind === "theme" || this.asset.kind === "package" || this.asset.kind === "widget-definition" || this.asset.kind === "desk-template") {
      const path = this.asset.kind === "desk-template" ? "desk.json" : this.asset.kind === "theme" ? "theme.json" : this.asset.kind === "widget-definition" ? "widget.json" : "station.json";
      try {
        (this.asset.kind === "desk-template" ? parseDeskTemplate : this.asset.kind === "theme" ? parseTheme : this.asset.kind === "widget-definition" ? parseWidgetRecipe : parseManifest)(
          assetFiles(this.asset)[path]!,
        );
        this.problems = [];
      } catch (error) {
        this.problems = [
          { path, from: 0, to: 1, severity: "error", message: String(error) },
        ];
      }
      this.publish();
      return;
    }
    if (
      !Object.keys(assetFiles(this.asset)).some((path) =>
        /\.[jt]sx?$/.test(path),
      )
    )
      return;
    const generation = this.generation;
    try {
      const worker = await this.language();
      const problems = await worker.request<Problem[]>({
        op: "diagnostics",
        files: this.languageFiles(),
      });
      if (generation === this.generation && !this.disposed) {
        this.problems = this.asset.kind === "script"&&!assetFiles(this.asset)['program.json'] ? problems.map(p => ({...p,from:Math.max(0,p.from-scriptPrefix.length),to:Math.max(1,p.to-scriptPrefix.length)})) : problems;
        this.publish();
      }
    } catch (error) {
      if (!this.disposed) {
        this.error = String(error);
        this.publish();
      }
    }
  }
  private languageFiles() {
    const files=assetFiles(this.asset);
    return this.asset.kind === "script"&&!files['program.json'] ? {...files,"main.js":`${scriptPrefix}${files["main.js"] ?? ""}\n}`} : files;
  }
  async complete(path: string, position: number) {
    return (await this.language()).request<{ label: string; type: string }[]>({
      op: "completion",
      path,
      position: position + (this.asset.kind === "script"&&!assetFiles(this.asset)['program.json'] ? scriptPrefix.length : 0),
      files: this.languageFiles(),
    });
  }
  async run() {
    if (this.busy || this.asset.kind !== "web-content") return;
    const asset = this.asset;
    this.busy = true;
    this.error = "";
    this.publish();
    try {
      const build = await buildWebProject(
        { ...asset, files: assetFiles(asset) },
        "index.html",
        this.controller.signal,
      );
      if (
        this.asset.instanceId !== build.instanceId ||
        this.asset.revision !== build.revision ||
        this.disposed
      )
        throw new Error("Source changed during build; run again");
      this.preview = build;
      this.previewRun++;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.publish();
    }
  }
  dispose() {
    this.disposed = true;
    this.controller.abort();
    clearTimeout(this.timer);
    this.worker?.dispose();
    this.listeners.clear();
    this.documents.clear();
  }
}
/** Registry membership binds child panes to their owner, never to a guest-supplied asset ID. */
export const editorSessions = new Map<string, EditorSession>();
const registryListeners = new Set<() => void>();
let registryVersion = 0;
export const editorSessionRegistry = {
  subscribe(listener: () => void) {
    registryListeners.add(listener);
    return () => {
      registryListeners.delete(listener);
    };
  },
  snapshot: () => registryVersion,
};
/** Register only committed owners; speculative React renders never acquire resources. */
export function registerEditorSession(ownerId: string, session: EditorSession) {
  editorSessions.set(ownerId, session);
  registryVersion++;
  registryListeners.forEach((listener) => listener());
  return () => {
    if (editorSessions.get(ownerId) === session) {
      editorSessions.delete(ownerId);
      registryVersion++;
      registryListeners.forEach((listener) => listener());
    }
  };
}

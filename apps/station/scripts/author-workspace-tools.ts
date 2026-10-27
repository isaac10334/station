/** Dogfood Station through a real MCP subprocess. Source is authored as assets;
 * no privileged built-in renderer or direct store access participates in this proof.
 * Usage: bun .../author-workspace-tools.ts <paired-credential.json>
 */
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { join } from "node:path";
const credential = process.argv[2];
if (!credential) throw new Error("Explicit paired credential path required");
const client = new Client({
  name: "codex-station-authoring",
  version: "1.0.0",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    join(import.meta.dir, "station-control.ts"),
    "--mcp",
    "--connect",
    credential,
  ],
  stderr: "inherit",
});
await client.connect(transport);
const call = async (
  method: string,
  params = {},
  mutation = false,
): Promise<any> => {
  const version = mutation ? (await call("state.inspect")).version : undefined;
  const reply = await client.callTool({
    name: `station_${method.replaceAll(".", "_")}`,
    arguments: {
      params,
      ...(version ? { version } : {}),
      requestId: crypto.randomUUID(),
    },
  });
  if (reply.isError) throw new Error(JSON.stringify(reply.content));
  return reply.structuredContent;
};
const wait = async (operationId: string) => {
  for (let i = 0; i < 300; i++) {
    const { result } = await call("operations.inspect", { operationId });
    if (result.status === "succeeded") return result.result;
    if (result.status !== "running")
      throw new Error(JSON.stringify(result.error));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Operation ${operationId} still running; inspect before retrying`,
  );
};
const style =
  "body{font:14px var(--station-font,system-ui);margin:0;padding:16px;color:var(--station-fg);background:var(--station-frame)}h2{margin:0 0 12px;font-size:16px}button,input,textarea{font:inherit;color:inherit;background:transparent;border:1px solid var(--station-line-2,#555);border-radius:6px;padding:8px}button{cursor:pointer}button:hover{background:var(--station-selected,#333)}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--station-focus-ring,#aaa)}label{display:grid;gap:6px;margin:12px 0}input,textarea{min-width:0}#items{display:grid;gap:6px}#items button{text-align:left}#status{font-size:12px;opacity:.7}";
const files = (code: string) => ({
  "index.html":
    '<link rel="stylesheet" href="styles.css"><div id="app"></div><script type="module" src="src/main.ts"></script>',
  "styles.css": style,
  "src/main.ts": code,
});
const listSource = `import {connect} from "@station/sdk";
const station=await connect();
const catalog=await station.acquire<{list():Promise<{id:string;name:string;kind:string}[]>}>({id:"station:assets/catalog",version:"1.0.0"});
document.querySelector("#app")!.innerHTML='<h2>Workspace tools</h2><p id="status">Only assets authorized for this task.</p><div id="items"></div><button id="refresh">Refresh assets</button>';
async function render(){ const items=document.querySelector("#items")!; items.replaceChildren(); for(const asset of await catalog.value.list()){const button=document.createElement("button");button.textContent=asset.name;button.onclick=()=>{void station.state("selection").set(asset.id)};items.append(button)}}
document.querySelector("#refresh")!.addEventListener("click",()=>{void render()}); await render();`;
const editorSource = `import {connect,assetMetadata,type AssetMetadata} from "@station/sdk";
const station=await connect();const handle=await station.acquire<AssetMetadata>(assetMetadata);
document.querySelector("#app")!.innerHTML='<h2>Metadata inspector</h2><form id="inspect"><label>Asset ID<input id="asset" aria-label="Inspected asset ID"></label><button type="button">Inspect asset</button></form><form id="edit"><label>Title<input id="title" aria-label="Runtime asset title"></label><label>Description<textarea id="description" aria-label="Runtime asset description" rows="3"></textarea></label><button type="button">Save metadata</button></form><p id="status" role="status">Select an authorized asset.</p>';
const field=(id:string)=>document.getElementById(id) as HTMLInputElement;const status=document.getElementById("status")!;let selected="",version:any;
async function load(id:string){try{const result=await handle.value.get(id); selected=id;field("asset").value=id;field("title").value=result.name;field("description").value=result.description;version=result.version;status.textContent="Authorized metadata · source access is separate."}catch(error){selected="";status.textContent=String(error)}}
station.state("selection").subscribe(id=>{if(typeof id==="string")void load(id)});
document.getElementById("inspect")!.querySelector("button")!.addEventListener("click",event=>{event.preventDefault();void load(field("asset").value)});
document.getElementById("edit")!.querySelector("button")!.addEventListener("click",async event=>{event.preventDefault();if(!selected)return;try{await handle.value.patch(selected,{name:field("title").value,description:field("description").value},version);await load(selected);status.textContent="Metadata saved through Station policy."}catch(error){status.textContent=String(error)}});`;
try {
  const commands = await call("commands.list");
  const target = (
    await call(
      "asset.create",
      {
        name: "Workspace tools editable note",
        kind: "web-content",
        files: { "index.html": "<p>Authored through Station commands</p>" },
      },
      true,
    )
  ).result;
  const list = (
    await call(
      "asset.create",
      {
        name: "Workspace tools asset list",
        kind: "web-content",
        files: files(listSource),
      },
      true,
    )
  ).result;
  const editor = (
    await call(
      "asset.create",
      {
        name: "Workspace tools metadata editor",
        kind: "web-content",
        files: files(editorSource),
      },
      true,
    )
  ).result;
  const manifest = {
    version: 1,
    id: `workspace-tools-${crypto.randomUUID().slice(0, 8)}`,
    name: "Runtime workspace tools",
    contributions: [
      {
        id: "workspace-tools",
        title: "Workspace tools",
        role: "widget",
        assetId: list.id,
        capabilities: ["station:assets/catalog"],
        channels: ["selection"],
        slots: [
          {
            id: "inspector",
            definitions: ["metadata-editor"],
            initial: ["metadata-editor"],
          },
        ],
        layout: {
          axis: "horizontal",
          ratio: 0.45,
          first: { slot: "body" },
          second: { slot: "inspector" },
        },
      },
      {
        id: "metadata-editor",
        title: "Metadata inspector",
        role: "widget",
        assetId: editor.id,
        creation: "contextual",
        capabilities: ["station:assets/metadata"],
        channels: ["selection"],
      },
    ],
  };
  const pkg = (
    await call(
      "asset.create",
      {
        name: "Workspace tools package",
        kind: "package",
        files: { "station.json": JSON.stringify(manifest, null, 2) },
      },
      true,
    )
  ).result;
  const prepared = await wait(
    (await call("package.prepare", { assetId: pkg.id }, true)).result
      .operationId,
  );
  await call(
    "package.install",
    {
      preparationId: prepared.preparationId,
      grants: {
        "workspace-tools": ["station:assets/catalog"],
        "metadata-editor": ["station:assets/metadata"],
      },
    },
    true,
  );
  const placement = await call(
    "package.place",
    {
      definitionId: `${manifest.id}/workspace-tools`,
      target: { surface: "dashboard", intent: "append" },
    },
    true,
  );
  await call(
    "asset.metadata",
    {
      assetId: target.id,
      patch: {
        description: "Edited using a real MCP client after installation.",
      },
    },
    true,
  );
  const fork = (
    await call(
      "asset.fork",
      { assetId: editor.id, name: "Forked metadata inspector" },
      true,
    )
  ).result;
  const installations = (await call("packages.list")).result;
  const denied = await client.callTool({
    name: "station_asset_read",
    arguments: { params: { assetId: "greeting" } },
  });
  if (!denied.isError)
    throw new Error("Unauthorized source read unexpectedly succeeded");
  console.log(
    JSON.stringify(
      {
        packageId: manifest.id,
        packageAssetId: pkg.id,
        targetAssetId: target.id,
        listAssetId: list.id,
        editorAssetId: editor.id,
        forkAssetId: fork.id,
        panelId: placement.result.panelId,
        deniedUnauthorizedRead: true,
        discoveredCommands: commands.result.length,
        sourceRevisions: prepared.revisions,
        installedBuilds: installations.find((i: any) => i.id === manifest.id),
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}

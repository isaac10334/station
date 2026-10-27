/** Stored authoring/snapshots and instance wiring. Runtime handles never enter these records. */
import { z } from "zod";
import { validSourcePath } from "./source-project";
const programPath = (path:string) => validSourcePath(path) && !['node_modules','dependencies','externals'].includes(path.split('/')[0]!);
export const bindingSchema = z.object({ alias:z.string().regex(/^[a-z][\w-]{0,63}$/), serviceId:z.string().min(1).max(160), operations:z.array(z.string().max(80)).max(32), resources:z.array(z.string().max(160)).max(128), contracts:z.record(z.string().max(80),z.string().max(32768)).optional() }).strict();
export const draftSchema = z.object({
  version:z.literal(1).default(1), title:z.string().min(1).max(120).default("Program"),
  role:z.enum(["action","widget","service","settings","asset-type"]).default("widget"),
  entry:z.string().max(160).refine(programPath).default("main.tsx"), files:z.record(z.string().refine(programPath),z.string()).refine(files=>Object.keys(files).length<=64 && JSON.stringify(files).length<=262144,"Source exceeds file or size limit"),
  dependencies:z.array(z.string().max(160)).max(16).default([]),
  input:z.json().refine(value=>JSON.stringify(value).length<=16384,'Input exceeds 16 KiB').default(null), compact:z.boolean().default(false),
  defaults:z.record(z.string().regex(/^[\w-]{1,80}$/),z.union([z.string().max(4096),z.boolean()])).refine(value=>Object.keys(value).length<=32).default({}),
  inputSchema:z.json().optional(),outputSchema:z.json().optional(),
  methods:z.array(z.object({name:z.string().regex(/^[a-z][\w-]{0,79}$/),input:z.json(),output:z.json(),effects:z.array(z.object({operation:z.string().max(80),resource:z.string().max(160).optional()}).strict()).max(16).default([]),subscription:z.boolean().optional()}).strict()).max(32).default([]),
  fields:z.array(z.object({key:z.string().regex(/^[\w-]{1,80}$/),label:z.string().max(120),type:z.enum(["text","toggle","action"]),value:z.union([z.string(),z.boolean()]).optional()}).strict()).max(32).default([]),
  assetType:z.object({id:z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/),schema:z.json(),starter:z.json(),editors:z.array(z.string()).max(8).default([])}).strict().optional(),
}).strict();
export type ProgramDraft = z.infer<typeof draftSchema>;
export type ServiceBinding = z.infer<typeof bindingSchema>;
export type ProgramSnapshot = {id:string;definitionId?:string;revision:number;sourceSha256:string;dependenciesSha256:string;engineSha256:string;code:string;draft:ProgramDraft;createdAt:number};
export type ProgramInstance = {id:string;revision:number;kind:"widget"|"service"|"action";title:string;definitionId?:string;installationId?:string;surfaceAccess?:boolean;disabled?:boolean;draft:ProgramDraft;snapshotId?:string;bindings:ServiceBinding[];startup:boolean;taskId?:string;configuration:Record<string,string|boolean>};
export type ProgrammingState = {instances:ProgramInstance[];snapshots:ProgramSnapshot[]};
export const emptyProgramming = ():ProgrammingState=>({instances:[],snapshots:[]});
export function defaultDraft(title="Portable widget"):ProgramDraft {
  return draftSchema.parse({title,files:{"main.tsx":`import { ui } from '@station/sdk';\nexport default async function(input: unknown) {\n  let count = 0;\n  const render = () => ui.render(ui.h('column', {key:'root'},\n    ui.h('text', {key:'count', text:'Count: ' + count}),\n    ui.h('button', {key:'increment', label:'Increment', text:'Increment', onActivate: async () => { count++; await render(); }})));\n  await render();\n  return ui;\n}\n`}});
}
export function parseProgramAsset(files:Record<string,string>):ProgramDraft {
  if (files['widget.json']) {
    const recipe=JSON.parse(files['widget.json']);
    if(recipe.widget!=='program')throw new Error('Choose a programmable widget definition');
    return draftSchema.parse(recipe.defaults?.programDraft);
  }
  const metadata = JSON.parse(files["program.json"] ?? "{}");
  return draftSchema.parse({...metadata,files:Object.fromEntries(Object.entries(files).filter(([path])=>path!=="program.json"))});
}
/** Detect portable source in either a script asset or a reusable widget recipe. */
export function hasProgramSource(asset:{kind:string;files?:Record<string,string>}):boolean {
 if(asset.kind==='script')return !!asset.files?.['program.json'];
 if(asset.kind!=='widget-definition')return false;
 try{return JSON.parse(asset.files?.['widget.json']??'{}').widget==='program';}catch{return false;}
}
/** Portable extraction deliberately omits instance bindings, startup, task IDs and handles. */
export function programFiles(draft:ProgramDraft):Record<string,string> {
  const {files,...metadata}=draftSchema.parse(draft);
  return {...files,"program.json":JSON.stringify(metadata,null,2)};
}

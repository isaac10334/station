/** Real paired MCP authoring: no store, owner dispatch, or model-evaluation shortcut. */
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { join } from 'node:path';
import { draftSchema,programFiles } from '../src/core/programs';
const credential=process.argv[2];if(!credential)throw new Error('Explicit paired acceptance credential required');
const client=new Client({name:'station-programmable-cockpit',version:'1.0.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[join(import.meta.dir,'station-control.ts'),'--mcp','--connect',credential],stderr:'inherit'}));
let commands:any[]=[];let calls=0;
async function call(method:string,params:unknown={},mutation=false):Promise<any>{if(commands.length&&!commands.some(item=>item.method===method))throw new Error('Operation not granted: '+method);const version=mutation?(await call('state.inspect')).version:undefined;const response=await client.callTool({name:'station_'+method.replaceAll('.','_'),arguments:{params,...(version?{version}:{}),requestId:crypto.randomUUID()}});calls++;if(response.isError)throw new Error(method+": "+JSON.stringify(response.content));return response.structuredContent;}
async function run(method:string,params:unknown){if(method==='programs.wire')params={startup:false,surfaceAccess:(params as any).instanceId!==ids.shared,...params as object};const response=await call(method,params,true);if(!response.result.operationId)return response.result;for(let i=0;i<300;i++){const {result}=await call('operations.inspect',{operationId:response.result.operationId});if(result.status==='succeeded')return result.result;if(result.status!=='running')throw new Error(JSON.stringify(result.error));await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Inspect unfinished operation '+response.result.operationId);}
const draft=(title:string,role:string,source:string,extra:object={})=>draftSchema.parse({title,role,entry:'main.tsx',files:{'main.tsx':source},...extra});
const prefix='cockpit-'+Date.now().toString(36),ids:Record<string,string>={};
try{
 commands=(await call('commands.list')).result;
 // Inspect the exact schemas supplied by the connected renderer before mutations.
 await Bun.write(join(import.meta.dir,'../../../.desktop-test/cockpit-command-schemas.json'),JSON.stringify(commands.filter(item=>item.method.startsWith('programs.')||['dock.apply','asset.create','package.prepare','package.install','navigation.configure'].includes(item.method)),null,2));
 const workspace=(await call('state.inspect')).result.workspace;
 ids.testAsset=(await run('asset.create',{kind:'data-source',name:'Cockpit metadata test'})).id;
 ids.shared=prefix+'-shared';
 const shared=draft('Cockpit shared service','service',`import {invoke} from '@station/sdk';
export default async function(){let queries=0;return {methods:{query:async()=>({queries:++queries,assets:await invoke('catalog',null),activity:await invoke('activity',null)})}};}`,{methods:[{name:'query',input:{},output:{type:'object'},effects:[{operation:'metadata.read'},{operation:'activity.read'}]}]});
 await run('programs.create',{instanceId:ids.shared,kind:'service',draft:shared});
 await run('programs.wire',{instanceId:ids.shared,expectedInstanceRevision:0,bindings:[{alias:'catalog',serviceId:'builtin:assets',operations:['query'],resources:[ids.testAsset]},{alias:'activity',serviceId:'builtin:activity',operations:['query'],resources:[workspace.id]}]});
 await run('programs.apply',{instanceId:ids.shared});await run('programs.start',{instanceId:ids.shared});
 const source=`import {ui,invoke} from '@station/sdk';
export default async function(){
 const render=async()=>{const result:any=await invoke('shared',{operation:'query',input:null});await ui.render(<column key="root"><text key="heading" text="Workspace cockpit"/><row key="metrics"><metric key="assets" label="Workspace assets" text={String(result.activity.assets)}/><metric key="queries" label="Shared service queries" text={String(result.queries)}/></row><list key="catalog" label="Scoped assets">{result.assets.map((asset:any)=><text key={asset.id} text={asset.name}/>)}</list><button key="refresh" label="Refresh cockpit" text="Refresh" onActivate={render}/></column>);};await render();return ui;}`;
 const declarative=`import {ui,invoke} from '@station/sdk';
export default async function(){const render=async()=>{const result:any=await invoke('shared',{operation:'query',input:null});const description={key:'dashboard',type:'column',children:[{key:'title',type:'text',text:'Data-generated dashboard'},{key:'count',type:'metric',label:'Shared query number',text:String(result.queries)},{key:'refresh-data',type:'button',label:'Refresh generated dashboard',text:'Refresh data',onActivate:render}]};await ui.render(description as any);};await render();return ui;}`;
 for(const [name,code]of [['coded',source],['declarative',declarative]]){const id=ids[name!]=prefix+'-'+name;await run('dock.apply',{type:'createWidget',id,widget:'program',target:{surface:'dashboard',intent:'append',index:0}});await run('dock.apply',{type:'configurePanel',panelId:id,displayName:name==='coded'?'Portable JSX cockpit':'Declarative cockpit'});await run('programs.create',{instanceId:id,kind:'widget',draft:draft(name!,'widget',code!)});await run('programs.wire',{instanceId:id,expectedInstanceRevision:0,bindings:[{alias:'shared',serviceId:ids.shared,operations:['query'],resources:[ids.testAsset,workspace.id]}]});await run('programs.apply',{instanceId:id});await run('programs.start',{instanceId:id});}
 ids.toolbar=prefix+'-toolbar';
 const toolbar=draft('Selected asset details','widget',`import {ui,invoke} from '@station/sdk';
export default async function(){let asset:any;const render=async()=>{const selection:any=await invoke('selection',null),assets:any=await invoke('catalog',null);asset=assets.find((value:any)=>value.id===selection.assetId);await ui.render(<popover key="details" icon="Info" label="Selected asset details" onActivate={render}><text key="title" text={asset?.name??'Select an authorized asset in Navigation'}/><text key="description" text={asset?.description??''}/><button key="edit" label="Edit authorized test asset metadata" text="Mark test asset reviewed" disabled={!asset} onActivate={async()=>{await invoke('edit',{assetId:asset.id,expectedRevision:asset.revision,expectedMetadataRevision:asset.metadataRevision,description:'Reviewed through the portable toolbar script'});await render();}}/></popover>);};await render();return ui;}`,{compact:true});
 await run('dock.apply',{type:'createWidget',id:ids.toolbar,widget:'program',target:{surface:'dashboard',intent:'append'}});
 await run('programs.create',{instanceId:ids.toolbar,kind:'widget',draft:toolbar});
 await run('programs.wire',{instanceId:ids.toolbar,expectedInstanceRevision:0,bindings:[{alias:'selection',serviceId:'builtin:selection',operations:['get'],resources:['workspace-navigation']},{alias:'catalog',serviceId:'builtin:assets',operations:['query'],resources:[ids.testAsset]},{alias:'edit',serviceId:'builtin:metadata',operations:['update'],resources:[ids.testAsset]}]});
 await run('programs.apply',{instanceId:ids.toolbar});await run('programs.start',{instanceId:ids.toolbar});
 await run('navigation.configure',{panelId:'workspace-navigation',selectedAssetId:ids.testAsset,presentation:'compact'});
 await run('dock.apply',{type:'move',panelId:ids.toolbar,target:{surface:'toolbar',intent:'append'}});
 ids.definition=(await run('programs.saveDefinition',{instanceId:ids.coded,name:'Portable cockpit definition'})).assetId;
 const definition=(await call('asset.read',{assetId:ids.definition})).result;if(JSON.stringify(definition.files).includes('"bindings"'))throw new Error('Definition exported bindings');
 // A package groups the exact same portable definitions and activation machinery.
 const settings=draft('Cockpit preferences','settings',`export default async function(){return {methods:{}};}`,{fields:[{key:'caption',label:'Cockpit caption',type:'text',value:'Workspace cockpit'},{key:'showActivity',label:'Show activity',type:'toggle',value:true}]});
 const custom=draft('Cockpit note','asset-type',`export default async function(){return {methods:{}};}`,{assetType:{id:'cockpit:note',schema:{type:'object',properties:{title:{type:'string'},complete:{type:'boolean'}},required:['title','complete'],additionalProperties:false},starter:{title:'Authored note',complete:false},editors:[]}});
 const members=[];for(const [name,definition]of [['settings',settings],['note',custom]]){const asset=await run('asset.create',{kind:'script',name:'Cockpit '+name,files:programFiles(definition as any)});ids[name as string]=asset.id;members.push({id:name,title:(definition as any).title,role:(definition as any).role,assetId:asset.id,entry:'main.tsx'});}
 ids.package=(await run('asset.create',{kind:'package',name:'Cockpit portable extensions',files:{'station.json':JSON.stringify({version:1,id:prefix,name:'Cockpit portable extensions',contributions:members})}})).id;
 const preparation=await run('package.prepare',{assetId:ids.package});await run('package.install',{preparationId:preparation.preparationId,grants:{}});
 for(const name of ['settings','note']){const instanceId=ids[name+'Instance']=prefix+'-'+name;await run('programs.fromDefinition',{instanceId,definitionId:prefix+'/'+name});}
 ids.customDocument=(await run('programs.createAsset',{instanceId:ids.noteInstance,name:'Cockpit custom note'})).assetId;
 let denied=false;try{await call('asset.read',{assetId:'greeting'});}catch{denied=true;}if(!denied)throw new Error('Unauthorized source read succeeded');
 const receipt={at:new Date().toISOString(),ids,calls,deniedUnrelatedSource:true,programs:(await call('programs.inspect')).result,renderingAcceptance:'Verify actual portable surfaces and toolbar popover in the paired browser'};
 await Bun.write(join(import.meta.dir,'../../../.desktop-test/programmable-cockpit-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await client.close();}

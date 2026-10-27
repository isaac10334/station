/** Fixed native acceptance fixture. Requires the private native bootstrap and an
 * explicitly opted-in managed acceptance launch. All writes use task operations.
 */
import type { createStationControl } from '../features/commands/application/runtime';
import { draftSchema } from '../core/programs';
import { engineResources } from './program-engine';
import { rootDesktopCredential } from './root-credential';
export async function verifyNativePrograms(control:ReturnType<typeof createStationControl>){
 const token=await rootDesktopCredential();if(!token||location.origin!=='http://127.0.0.1:43158')return;
 const report={passed:false,rendered:false,interactive:false,deniedSource:false,serviceStopped:false,engineSha256:'',error:''};
 const context=control.issueTask({name:'Fixed installed programmability acceptance',workspaceId:control.inspect().workspace.id,scope:{operations:['state.inspect','asset.read','dock.apply','programs.create','programs.wire','programs.apply','programs.start','programs.stop','operations.inspect'],create:true,surfaces:['dashboard','main'],capabilities:['station:programs/execute','station:services/read','station:ui/compose'],readableAssets:[],editableAssets:[],componentImports:[],cloudBuild:false}});
 const run=async(method:string,params:unknown={})=>{const response=control.executeFor(context,{method,params,version:control.version()});if(!response.result?.operationId)return response.result;for(let index=0;index<300;index++){const operation=control.executeFor(context,{method:'operations.inspect',params:{operationId:response.result.operationId}}).result;if(operation.status==='succeeded')return operation.result;if(operation.status!=='running')throw new Error(operation.error?.message??'Operation failed');await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Native operation timed out');};
 const until=async(read:()=>boolean)=>{for(let index=0;index<200;index++){if(read())return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Native portable rendering timed out');};
 const prefix='native-program-'+crypto.randomUUID(),serviceId=prefix+'-service',widgetId=prefix+'-widget';
 try{
  report.engineSha256=(await engineResources()).manifest.sha256;
  await run('programs.create',{instanceId:serviceId,kind:'service',draft:draftSchema.parse({role:'service',title:'Installed shared counter',files:{'main.tsx':`export default async function(){let count=0;return {methods:{query:async()=>({count:++count})}};}`},methods:[{name:'query',input:{},output:{type:'object'},effects:[]}]})});
  await run('programs.apply',{instanceId:serviceId});await run('programs.start',{instanceId:serviceId});
  await run('dock.apply',{type:'createWidget',widget:'program',id:widgetId,target:{surface:'dashboard',intent:'append',index:0}});
  await run('dock.apply',{type:'configurePanel',panelId:widgetId,displayName:'Installed portable UI acceptance'});
  await run('dock.apply',{type:'activate',panelId:'workspace-home'});
  await run('programs.create',{instanceId:widgetId,kind:'widget',draft:draftSchema.parse({title:'Installed portable UI acceptance',files:{'main.tsx':`import {ui,invoke} from '@station/sdk';export default async function(){const render=async()=>{const value:any=await invoke('counter',null);await ui.render(ui.h('column',{key:'root'},ui.h('text',{key:'count',text:'Native shared count: '+value.count}),ui.h('button',{key:'increment',label:'Increment installed portable counter',text:'Increment installed counter',onActivate:render})));};await render();return ui;}`}})});
  await run('programs.wire',{instanceId:widgetId,expectedInstanceRevision:0,bindings:[{alias:'counter',serviceId:serviceId,operations:['query'],resources:[]}],surfaceAccess:true});
  await run('programs.apply',{instanceId:widgetId});await run('programs.start',{instanceId:widgetId});
  const panel=()=>document.querySelector(`[id="widget-instance:${widgetId}"]`);
  await until(()=>!!panel()?.textContent?.includes('Native shared count: 1'));panel()?.scrollIntoView({block:'center'});await until(()=>{const target=panel(),bounds=target?.getBoundingClientRect();return !!target&&!!bounds&&bounds.width>0&&bounds.height>0&&bounds.top<innerHeight&&bounds.bottom>0&&getComputedStyle(target).visibility!=='hidden';});report.rendered=true;
  const button=panel()?.querySelector<HTMLButtonElement>('button[aria-label="Increment installed portable counter"]');if(!button)throw new Error('Native interaction control missing');button.click();
  await until(()=>!!panel()?.textContent?.includes('Native shared count: 2'));report.interactive=true;
  try{await run('asset.read',{assetId:'greeting'});}catch{report.deniedSource=true;}
  await run('programs.stop',{instanceId:serviceId});await until(()=>!panel()?.textContent?.includes('Native shared count: 2'));report.serviceStopped=true;
  report.passed=report.rendered&&report.interactive&&report.deniedSource&&report.serviceStopped;
 }catch(error){report.error=String(error).slice(0,2048);}
 await fetch('/api/desktop/programs-acceptance',{method:'POST',headers:{'Content-Type':'application/json','x-station-app':token},body:JSON.stringify(report)});
}

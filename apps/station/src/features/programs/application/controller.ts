/** Workspace-owned instance/activation/lifecycle service. UI and agent commands share it. */
import { RecordingSurface, type UiEvent } from "@loop-kit/ui";
import type { Store } from "../../workspace/application/store";
import { bindingSchema, draftSchema, defaultDraft, emptyProgramming, parseProgramAsset, programFiles, type ProgramDraft, type ProgramInstance, type ProgramSnapshot, type ServiceBinding } from "../../../core/programs";
import { sha256, sourceSha256 } from "../../../core/build-contract";
import { hostCallSchema, type HostCall } from "../contracts/engine";
import type { ProgramHost, ProgramSession, ProgramRuntimePorts, NamedServices } from "./ports";
import { portableSchema, validatePortableValue } from "../../../core/portable-schema";
import { installedDefinitions } from '../../../core/contribution-catalog';
import { z } from 'zod';
import { panelSurface } from '../../../core/docking';
const metadataWrite=z.object({assetId:z.string().max(160),expectedRevision:z.number().int().nonnegative(),expectedMetadataRevision:z.number().int().nonnegative(),name:z.string().trim().min(1).max(120).optional(),description:z.string().max(2000).optional()}).strict();

type InvocationAuthority={resources:Set<string>;effects:Set<string>};
type Running = {workspaceId:string;id:string;authority?:InvocationAuthority;session?:ProgramSession;controller:AbortController;status:"starting"|"running"|"stopped"|"failed";error:string;surface?:RecordingSurface;key:string;version:number;output?:unknown;consumer?:string};
const builtinOperations:Record<string,string[]>={"builtin:assets":["query"],"builtin:activity":["query"],"builtin:selection":["get"],"builtin:metadata":["update"]};
/** One workspace program owner. The caller injects compilation, execution and
 * named-service adapters. dispose cancels every running instance and subscription;
 * moving a widget only changes DockLayout, never this controller's identity.
 * @example createPrograms(store, { open, resources, prepare }, namedServices)
 */
export function createPrograms(store:Store,ports:ProgramRuntimePorts,services:NamedServices) {
  const running=new Map<string,Running>(),listeners=new Set<()=>void>();let version=0,disposed=false;
  const key=(workspaceId:string,id:string)=>`${workspaceId}/${id}`;
  const publish=()=>{version++;listeners.forEach(listener=>listener());};
  const state=()=>store.active().programming ?? emptyProgramming();
  const instance=(id:string)=>state().instances.find(item=>item.id===id) ?? (()=>{throw new Error('Program instance unavailable');})();
  const snapshot=(item:ProgramInstance)=>state().snapshots.find(value=>value.id===item.snapshotId) ?? (()=>{throw new Error('Apply a valid snapshot before starting');})();
  const identity=(item:ProgramInstance)=>JSON.stringify([item.snapshotId,item.bindings,item.configuration,item.surfaceAccess]);
  const available=(item:ProgramInstance)=>!item.disabled&&(!item.installationId||installedDefinitions(store.active()).some(def=>def.id===item.definitionId&&def.installation.installationId===item.installationId));
  const save=(item:ProgramInstance)=>store.setProgramming({...state(),instances:[...state().instances.filter(value=>value.id!==item.id),item]});
  function stop(id:string,workspaceId=store.active().id,reason='Stopped') {
    const active=running.get(key(workspaceId,id));if(!active)return;
    services.remove(key(workspaceId,id));
    if(active.status==='stopped')return;active.controller.abort();active.session?.stop(reason);active.surface?.dispose();active.surface=undefined;active.status='stopped';active.error=reason;active.version++;publish();
    const workspace=store.get().workspaces.find(value=>value.id===workspaceId);for(const consumer of workspace?.programming?.instances??[])if(consumer.bindings.some(binding=>binding.serviceId===id))stop(consumer.id,workspaceId,'Bound service stopped');
  }
  function validateBindings(bindings:ServiceBinding[],item:ProgramInstance) {
    if(new Set(bindings.map(binding=>binding.alias)).size!==bindings.length)throw new Error('Binding aliases must be unique');
    for(const raw of bindings){const binding=bindingSchema.parse(raw);if(binding.serviceId===item.id)throw new Error('A service cannot bind itself');
      const target=state().instances.find(value=>value.id===binding.serviceId&&value.kind==='service');
      const operations=builtinOperations[binding.serviceId] ?? (target?snapshot(target).draft.methods.map(method=>method.name):undefined);
      if(!operations||binding.operations.some(operation=>!operations.includes(operation)))throw new Error('Service operation is unavailable');
      for(const resource of binding.resources)if(!store.active().assets.some(asset=>asset.id===resource)&&!store.active().dock.panels[resource]&&resource!==store.active().id)throw new Error('Binding resource is unavailable');
    }
    const visit=(id:string,path:Set<string>)=>{if(path.has(id)||path.size>=8)throw new Error('Service binding cycle or depth limit');const next=new Set(path).add(id);const target=id===item.id?{...item,bindings}:state().instances.find(value=>value.id===id);target?.bindings.forEach(binding=>{if(state().instances.some(value=>value.id===binding.serviceId))visit(binding.serviceId,next);});};visit(item.id,new Set());
  }
  function create(id:string,kind:ProgramInstance['kind'],draft?:ProgramDraft,definitionId?:string,taskId?:string) {
    if(state().instances.some(item=>item.id===id))return instance(id);
    const initial=draftSchema.parse(draft ?? defaultDraft());const item:ProgramInstance={id,kind,title:initial.title,revision:0,draft:initial,definitionId,bindings:[],startup:false,taskId,configuration:{...Object.fromEntries(initial.fields.filter(field=>field.value!==undefined&&field.type!=='action').map(field=>[field.key,field.value!])),...initial.defaults}};save(item);return item;
  }
  async function activate(id:string,signal?:AbortSignal) {
    const item=structuredClone(instance(id)),workspace=store.active(),sourceRevision=item.revision;
    if(workspace.dock.panels[id]&&panelSurface(workspace.dock,id)==='toolbar'&&!item.draft.compact)throw new Error('Move out of the toolbar before removing compact presentation');
    const record=await ports.prepare(item.draft,workspace.assets,item.definitionId,sourceRevision,signal);
    signal?.throwIfAborted();if(store.active().id!==workspace.id||instance(id).revision!==sourceRevision)throw new Error('Draft changed during activation');const current=state();
    const restart=running.get(key(workspace.id,id))?.status==='running';stop(id);
    store.setProgramming({instances:current.instances.map(value=>value.id===id?{...value,snapshotId:record.id,revision:value.revision+1}:value),snapshots:[...current.snapshots,record]});
    if(workspace.dock.panels[id]?.kind==='widget')store.dispatchDock({type:'configureProgram',panelId:id,compact:record.draft.compact});
    if(restart)await start(id,signal);
    return {snapshotId:record.id,sourceSha256:record.sourceSha256};
  }
  async function invoke(owner:ProgramInstance,alias:string,input:unknown,stack:string[],signal:AbortSignal):Promise<unknown> {
    signal.throwIfAborted();const current=instance(owner.id);if(identity(current)!==identity(owner))throw new Error('Program authority changed');
    const binding=current.bindings.find(binding=>binding.alias===alias);if(!binding)throw new Error(`Binding denied: ${alias}`);
    const operation=(input&&typeof input==='object'&&'operation'in input)?String((input as any).operation):binding.operations.length===1?binding.operations[0]:'';
    if(!binding.operations.includes(operation!))throw new Error('Operation denied');
    const value=(input&&typeof input==='object'&&'input'in input)?(input as any).input:input;
    const workspace=store.active();
    const caller=running.get(key(workspace.id,owner.id)),authority=caller?.authority;
    const operationEffect=binding.serviceId==='builtin:metadata'?'metadata.write':binding.serviceId==='builtin:assets'?'metadata.read':binding.serviceId==='builtin:activity'?'activity.read':binding.serviceId==='builtin:selection'?'selection.read':'service.invoke';
    if(owner.kind==='service'&&caller?.status==='running'&&!authority)throw new Error('Service effect is outside an authorized invocation');
    if(authority&&(!authority.effects.has(operationEffect)||binding.resources.some(resource=>!authority.resources.has(resource))))throw new Error('Service method effect exceeds caller authority');
    if(binding.serviceId==='builtin:assets')return workspace.assets.filter(asset=>binding.resources.includes(asset.id)).map(({id,name,kind,revision,description,metadataRevision})=>({id,name,kind,revision,description,metadataRevision:metadataRevision??0}));
    if(binding.serviceId==='builtin:activity'){if(!binding.resources.includes(workspace.id))throw new Error('Workspace activity denied');return {assets:workspace.assets.length,widgets:Object.keys(workspace.dock.panels).length,services:state().instances.filter(value=>value.kind==='service').map(item=>({id:item.id,title:item.title,status:running.get(key(workspace.id,item.id))?.status??'stopped'}))};}
    if(binding.serviceId==='builtin:selection'){const panel=binding.resources.map(id=>workspace.dock.panels[id]).find(panel=>panel&&(panel.kind==='navigation'||panel.kind==='widget'&&panel.widget==='navigation'));if(!panel)throw new Error('Navigation selection denied');return {assetId:panel.navigation?.selectedAssetId??null};}
    if(binding.serviceId==='builtin:metadata'){
      if(!value||typeof value!=='object'||typeof value.assetId!=='string'||!binding.resources.includes(value.assetId))throw new Error('Metadata resource denied');
      const patch=metadataWrite.parse(value),asset=workspace.assets.find(asset=>asset.id===patch.assetId);if(!asset||asset.revision!==patch.expectedRevision||(asset.metadataRevision??0)!==patch.expectedMetadataRevision)throw new Error('Metadata revision conflict');
      store.patchAssetMetadata(patch.assetId,{...(patch.name===undefined?{}:{name:patch.name}),...(patch.description===undefined?{}:{description:patch.description})});return {id:asset.id,revision:asset.revision,metadataRevision:(asset.metadataRevision??0)+1};
    }
    const target=instance(binding.serviceId);if(target.kind!=='service'||stack.includes(target.id)||stack.length>=8)throw new Error('Service cycle or depth limit');
    const active=running.get(key(workspace.id,target.id));if(!active?.session||active.status!=='running')throw new Error('Service stopped');
    // Shared state may cache prior reads. Require coverage of all service resources
    // before sharing that state with a caller; never borrow the service's authority.
    if(target.bindings.some(needed=>needed.resources.some(resource=>!binding.resources.includes(resource))))throw new Error('Caller lacks service resource authority');
    const method=snapshot(target).draft.methods.find(method=>method.name===operation);if(!method)throw new Error('Service method unavailable');
    if(binding.contracts?.[operation!]!==JSON.stringify(method))throw new Error('Service contract changed; review this binding again');
    validatePortableValue(method.input,value);
    for(const effect of method.effects){if(effect.resource&&!binding.resources.includes(effect.resource))throw new Error('Service effect resource denied');if(authority&&!authority.effects.has(effect.operation))throw new Error('Nested service effect denied');}
    return services.call(key(workspace.id,target.id),async()=>{signal.throwIfAborted();if(identity(instance(owner.id))!==identity(owner))throw new Error('Caller authority changed');if(active.authority)throw new Error('Service is busy');active.authority={resources:new Set(binding.resources),effects:new Set(method.effects.map(effect=>effect.operation))};try{const result=await active.session!.request({op:'dispatch',input:JSON.stringify({method:operation,input:value})});signal.throwIfAborted();if(active.status!=='running')throw new Error('Service stopped');return validatePortableValue(method.output,JSON.parse(result));}finally{active.authority=undefined;}},signal);
  }
  function makeHost(owner:ProgramInstance,active:Running,workspaceId:string,stack:string[]):ProgramHost {
    let next=0,closed=false;const resources=new Map<number,{kind:'surface'|'subscription';surface?:RecordingSurface;binding?:string;input?:unknown;pending?:ReturnType<typeof setTimeout>;cancel?:()=>void;controller?:AbortController}>();
    const check=()=>{active.controller.signal.throwIfAborted();if(closed||store.active().id!==workspaceId)throw new Error('Workspace changed');if(identity(instance(owner.id))!==identity(owner))throw new Error('Program authority changed');};
    const dispose=(id:number)=>{const resource=resources.get(id);if(!resource)return;resource.controller?.abort();resource.cancel?.();if(resource.pending)clearTimeout(resource.pending);resource.surface?.dispose();resources.delete(id);};
    return {profile:owner.kind==='widget'&&owner.surfaceAccess?'portable-ui':undefined,async call(raw:HostCall){check();const call=hostCallSchema.parse(raw);if(++active.version>10000)throw new Error('Host call budget exceeded');
      if(call.op==='invoke')return JSON.stringify(await invoke(owner,call.binding,JSON.parse(call.input),stack,active.controller.signal));
      if(call.op==='open'){if(owner.kind!=='widget'||!owner.surfaceAccess)throw new Error('Surface access denied');if(resources.size>=8)throw new Error('Resource limit');const id=++next;const surface=new RecordingSurface();resources.set(id,{kind:'surface',surface});active.surface=surface;publish();return id;}
      if(call.op==='subscribe'){if(!owner.bindings.some(binding=>binding.alias===call.binding))throw new Error('Subscription binding denied');if(resources.size>=8)throw new Error('Resource limit');const id=++next;resources.set(id,{kind:'subscription',binding:call.binding,input:JSON.parse(call.input),controller:new AbortController()});return id;}
      const resource=resources.get(call.resource);if(!resource)throw new Error('Resource disposed');
      if(call.op==='cancel'||call.op==='dispose'){dispose(call.resource);return null;}
      if(call.op==='render'){if(!resource.surface)throw new Error('Wrong resource type');resource.surface.render(JSON.parse(call.document));publish();return null;}
      if(call.op==='next-event'){if(!resource.surface)throw new Error('Wrong resource type');return await resource.surface.nextEvent().then(event=>event?JSON.stringify(event):null);}
      if(call.op==='next'){if(!resource.binding)throw new Error('Wrong resource type');const result=await new Promise<string|null>((resolve,reject)=>{const cancel=()=>resolve(null);resource.cancel=cancel;resource.pending=setTimeout(()=>{resource.pending=undefined;void invoke(owner,resource.binding!,resource.input,stack,resource.controller!.signal).then(value=>{check();if(!resources.has(call.resource))return resolve(null);resolve(JSON.stringify(value));}).catch(reject);},250);});check();return result;}
      throw new Error('Operation unavailable');
    },close(){if(closed)return;closed=true;for(const id of resources.keys())dispose(id);}};
  }
  async function start(id:string,signal?:AbortSignal) {
    const item=structuredClone(instance(id)),workspaceId=store.active().id,record=snapshot(item);if(!available(item))throw new Error('Instance needs renewed activation authority');validateBindings(item.bindings,item);
    if(item.installationId&&!installedDefinitions(store.active()).some(def=>def.id===item.definitionId&&def.installation.installationId===item.installationId))throw new Error('Installation disabled or updated; explicitly update this instance');
    if(item.taskId&&signal===undefined)throw new Error('Task-owned instances require renewed authority');
    stop(id);const active:Running={workspaceId,id,controller:new AbortController(),status:'starting',error:'',key:identity(item),version:0};running.set(key(workspaceId,id),active);publish();
    const abort=()=>stop(id,workspaceId,'Cancelled');signal?.addEventListener('abort',abort,{once:true});
    try{const engine=await ports.resources();if(engine.manifest.sha256!==record.engineSha256)throw new Error('Engine changed; Apply to review a new snapshot');
      active.session=await ports.open(makeHost(item,active,workspaceId,[id]),active.controller.signal,publish);
      if(record.draft.inputSchema!==undefined)validatePortableValue(record.draft.inputSchema,record.draft.input);
      const source=`globalThis.__stationConfiguration=${JSON.stringify(item.configuration)};${record.code}`;
      if(item.kind==='action'){const output=JSON.parse(await active.session.request({op:'evaluate',source,input:JSON.stringify(record.draft.input)}));active.output=record.draft.outputSchema===undefined?output:validatePortableValue(record.draft.outputSchema,output);active.session.stop();active.status='stopped';}
      else {await active.session.request({op:'start',source,input:JSON.stringify(record.draft.input)});active.status='running';}
      if(item.kind==='service'&&active.status==='running')services.register(key(workspaceId,id),()=>{active.controller.signal.throwIfAborted();if(active.status!=='running'||identity(instance(id))!==active.key||!available(instance(id)))throw new Error('Service no longer available');});
      publish();return {status:active.status,output:active.output??null};
    }catch(error){active.status='failed';active.error=String(error);active.controller.abort();active.session?.stop();publish();throw error;}finally{signal?.removeEventListener('abort',abort);}
  }
  async function event(id:string,event:UiEvent){const active=running.get(key(store.active().id,id));if(!active?.surface||!active.session||active.status!=='running')throw new Error('Widget stopped');active.surface.event(event);try{await active.session.request({op:'dispatch',input:'null'});publish();}catch(error){if(active.session.stats.stopped)stop(id,store.active().id,String(error));throw error;}}
  const unsubscribe=store.subscribe(()=>{for(const active of running.values()){const {workspaceId,id}=active;const workspace=store.get().workspaces.find(workspace=>workspace.id===workspaceId);const current=workspace?.programming?.instances.find(item=>item.id===id);if(!current||identity(current)!==active.key||(workspaceId===store.active().id&&!available(current))||(current.kind!=='service'&&(store.active().id!==workspaceId||!workspace?.dock.panels[id])))stop(id,workspaceId,'Instance replaced or closed');}publish();});
  queueMicrotask(()=>{if(!disposed)for(const item of state().instances)if(item.startup&&!item.taskId&&item.kind==='service')void start(item.id).catch(()=>{});});
  return {subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},version:()=>version,
    inspect:()=>state().instances.map(item=>({id:item.id,title:item.title,kind:item.kind,revision:item.revision,snapshotId:item.snapshotId??null,startup:item.startup,bindings:structuredClone(item.bindings),surfaceAccess:item.surfaceAccess??false,status:running.get(key(store.active().id,item.id))?.status??'stopped',error:running.get(key(store.active().id,item.id))?.error??''})),
    frame:(id:string)=>running.get(key(store.active().id,id))?.surface?.frame,
    logs:(id:string)=>running.get(key(store.active().id,id))?.session?.logs??[],
    output:(id:string)=>running.get(key(store.active().id,id))?.output,
    create,activate,start,stop,event,attachHost:services.attach,
    updateCustom(assetId:string,revision:number,content:unknown){const asset=store.active().assets.find(asset=>asset.id===assetId);if(asset?.kind!=='custom'||asset.revision!==revision)throw new Error('Custom document revision conflict');const type=JSON.parse(asset.files['extension.json']??'{}').type;const definition=state().instances.filter(available).map(item=>state().snapshots.find(record=>record.id===item.snapshotId)?.draft.assetType).find(value=>value?.id===type);if(!definition)throw new Error('Custom asset type unavailable; recover source instead');store.patchFiles(assetId,revision,{'content.json':JSON.stringify(validatePortableValue(definition.schema,content),null,2)});return {assetId,revision:revision+1};},
    fromInstallation(id:string,definitionId:string,kind:ProgramInstance['kind'],taskId?:string){const definition=installedDefinitions(store.active()).find(item=>item.id===definitionId),record=definition?.installation.programs?.[definition.contribution.id];if(!definition||!record)throw new Error('Portable definition unavailable');if(taskId&&definition.installation.authorizationTaskId&&definition.installation.authorizationTaskId!==taskId)throw new Error('Package belongs to another task');const previous=state().instances.find(item=>item.id===id);if(taskId&&previous&&previous.taskId!==taskId)throw new Error('Instance belongs to another principal');const item:ProgramInstance={id,kind,title:definition.contribution.title,revision:(previous?.revision??-1)+1,definitionId,installationId:definition.installation.installationId,draft:structuredClone(record.draft),snapshotId:record.id,bindings:previous?.bindings??[],startup:false,taskId,configuration:previous?.configuration??structuredClone(record.draft.defaults??{}),surfaceAccess:previous?.surfaceAccess??false};stop(id);store.setProgramming({instances:[...state().instances.filter(value=>value.id!==id),item],snapshots:[...state().snapshots.filter(value=>value.id!==record.id),structuredClone(record)]});return {instanceId:id,snapshotId:record.id};},
    contributions:()=>state().instances.filter(available).flatMap(item=>{const record=state().snapshots.find(record=>record.id===item.snapshotId);return record?[{instanceId:item.id,title:item.title,role:record.draft.role,fields:record.draft.fields,assetType:record.draft.assetType,configuration:structuredClone(item.configuration)}]:[];}),
    async action(id:string,method:string,input:unknown,signal?:AbortSignal){const item=instance(id),record=snapshot(item),descriptor=record.draft.methods.find(value=>value.name===method);if(!descriptor)throw new Error('Undeclared settings action');validatePortableValue(descriptor.input,input);const active=running.get(key(store.active().id,id));if(!active?.session||active.status!=='running')throw new Error('Start this instance before invoking an action');if(active.authority)throw new Error('Service is busy');active.authority={resources:new Set(item.bindings.flatMap(binding=>binding.resources)),effects:new Set(descriptor.effects.map(effect=>effect.operation))};try{const result=await active.session.request({op:'dispatch',input:JSON.stringify({method,input})});signal?.throwIfAborted();if(active.status!=='running')throw new Error('Instance stopped');return validatePortableValue(descriptor.output,JSON.parse(result));}finally{active.authority=undefined;}},
    createCustom(id:string,name:string){const item=instance(id),type=snapshot(item).draft.assetType;if(!available(item)||!type)throw new Error('Custom asset type is unavailable');const assetId=store.createDataAsset('custom',name),asset=store.active().assets.find(asset=>asset.id===assetId)!;store.patchFiles(assetId,asset.revision,{'station.json':null,'extension.json':JSON.stringify({version:1,type:type.id,definitionId:item.definitionId??null,editors:type.editors}),'content.json':JSON.stringify(validatePortableValue(type.schema,type.starter),null,2)});return {assetId,type:type.id};},
    update(id:string,revision:number,draft:ProgramDraft){const item=instance(id);if(item.revision!==revision)throw new Error('Instance revision conflict');save({...item,revision:revision+1,title:draft.title,draft:draftSchema.parse(draft)});},
    wire(id:string,revision:number,bindings:ServiceBinding[],startup=false,surfaceAccess=false,authorizationTaskId?:string){const item=instance(id);if(item.revision!==revision)throw new Error('Instance revision conflict');validateBindings(bindings,item);
      // Pin the contract inspected by the shared wire operation. Never trust stamps supplied by a caller.
      const reviewed=bindings.map(({contracts:ignored,...binding})=>{const target=state().instances.find(value=>value.id===binding.serviceId);return {...binding,...(target?{contracts:Object.fromEntries(snapshot(target).draft.methods.filter(method=>binding.operations.includes(method.name)).map(method=>[method.name,JSON.stringify(method)]))}:{})};});
      save({...item,revision:revision+1,disabled:false,taskId:authorizationTaskId,bindings:structuredClone(reviewed),surfaceAccess:item.kind==='widget'&&surfaceAccess,startup:!item.taskId&&item.kind==='service'&&startup});},
    configure(id:string,revision:number,configuration:ProgramInstance['configuration']){const item=instance(id);if(!available(item))throw new Error('Contribution unavailable');if(item.revision!==revision)throw new Error('Instance revision conflict');if(Object.entries(configuration).some(([key,value])=>!snapshot(item).draft.fields.some(field=>field.key===key&&field.type!=='action'&&typeof value===(field.type==='toggle'?'boolean':'string'))))throw new Error('Unknown setting or invalid field value');save({...item,revision:item.revision+1,configuration});},
    fromAsset(id:string,assetId:string,kind:ProgramInstance['kind'],taskId?:string){const asset=store.active().assets.find(asset=>asset.id===assetId);if(!asset?.files)throw new Error('Definition source unavailable');return create(id,kind,parseProgramAsset(asset.files),assetId,taskId);},
    saveDefinition(id:string,name:string){const item=instance(id),widget=item.draft.role==='widget',assetId=widget?store.createWidgetDefinition(name):store.createDataAsset('script',name);const asset=store.active().assets.find(asset=>asset.id===assetId)!;store.patchFiles(assetId,asset.revision,widget?{'widget.json':JSON.stringify({version:1,widget:'program',title:name,description:'Portable TypeScript definition',defaults:{programDraft:{...item.draft,defaults:item.configuration}}})}:programFiles({...item.draft,defaults:item.configuration}));return {assetId};},
    revokeTask(taskId:string){for(const item of state().instances)if(item.taskId===taskId){stop(item.id);save({...item,bindings:[],surfaceAccess:false,startup:false,disabled:true});}},
    dispose(){disposed=true;unsubscribe();for(const active of running.values())stop(active.id,active.workspaceId);services.dispose();listeners.clear();},
  };
}
export type Programs=ReturnType<typeof createPrograms>;

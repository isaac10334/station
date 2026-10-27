import { serviceRegistry } from "../src/features/programs/infrastructure/named-services";
import { test,expect } from 'bun:test';
import { createHost } from '@loop-kit/host';
import { createStore } from "../src/features/workspace/application/store";
import { createPrograms } from '../src/features/programs/application/controller';
import { defaultDraft,draftSchema,type ProgramSnapshot } from '../src/core/programs';
import { createStationControl } from '../src/features/commands/application/runtime';
import { taskScopeSchema } from '@station/protocol';
import type { ProgramHost } from '../src/providers/scripting/session';
import { RecordingSurface } from '@loop-kit/ui';
const hash='a'.repeat(64);
test('service contract changes require reviewed rewiring and caller contract stamps are ignored',async()=>{
 const s=setup();try{
  await s.create('shared');await s.programs.start('shared');
  const consumer=await s.create('consumer','widget');
  s.programs.wire(consumer.id,consumer.revision,[{alias:'shared',serviceId:'shared',operations:['query'],resources:[],contracts:{query:'forged'}}]);
  await s.programs.start(consumer.id);
  expect(await s.hosts[1]!.call({op:'invoke',binding:'shared',input:'null'})).toContain('count');
  const service=s.store.active().programming!.instances.find(value=>value.id==='shared')!;
  s.programs.update(service.id,service.revision,draftSchema.parse({...service.draft,methods:[{name:'query',input:{},output:{},effects:[{operation:'metadata.write'}]}]}));
  await s.programs.activate(service.id);await s.programs.start(consumer.id);
  await expect(s.hosts.at(-1)!.call({op:'invoke',binding:'shared',input:'null'})).rejects.toThrow('contract changed');
 }finally{await s.dispose();}
});
test('subscription disposal cancels pending delivery and definition extraction preserves only configuration',async()=>{
 const s=setup();try{
  const item=await s.create('settings');
  s.programs.update(item.id,item.revision,draftSchema.parse({...item.draft,fields:[{key:'caption',label:'Caption',type:'text'}]}));
  await s.programs.activate(item.id);
  let current=s.store.active().programming!.instances.find(value=>value.id===item.id)!;
  s.programs.configure(item.id,current.revision,{caption:'Reusable configuration'});
  const definition=s.programs.saveDefinition(item.id,'Reusable settings');
  const asset=s.store.active().assets.find(value=>value.id===definition.assetId)!;
  expect(JSON.parse(asset.files!['program.json']!).defaults).toEqual({caption:'Reusable configuration'});
  expect(asset.files!['program.json']).not.toContain('bindings');
  const consumer=await s.create('consumer','widget');
  s.programs.wire(consumer.id,consumer.revision,[{alias:'assets',serviceId:'builtin:assets',operations:['query'],resources:[]}]);
  await s.programs.start(consumer.id);
  const host=s.hosts[0]!,resource=await host.call({op:'subscribe',binding:'assets',input:'null'}) as number;
  const pending=host.call({op:'next',resource});await host.call({op:'cancel',resource});
  expect(await pending).toBe(null);
  await expect(host.call({op:'next',resource})).rejects.toThrow('disposed');
 }finally{await s.dispose();}
});
test('disabled custom type contributions preserve documents and reject creation/configuration',async()=>{
 const s=setup();try{
  const item=await s.create('notes');
  const draft=draftSchema.parse({...item.draft,role:'asset-type',fields:[{key:'visible',label:'Visible',type:'toggle'}],assetType:{id:'test:note',schema:{type:'object',properties:{text:{type:'string'}},required:['text']},starter:{text:'Saved'},editors:[]}});
  s.programs.update(item.id,item.revision,draft);await s.programs.activate(item.id);
  const created=s.programs.createCustom(item.id,'Custom document');
  expect(s.store.active().assets.find(asset=>asset.id===created.assetId)?.kind).toBe('custom');
  const state=s.store.active().programming!;
  s.store.setProgramming({...state,instances:state.instances.map(value=>({...value,disabled:true}))});
  expect(()=>s.programs.createCustom(item.id,'Denied')).toThrow('unavailable');
  expect(()=>s.programs.configure(item.id,0,{visible:true})).toThrow('unavailable');
  expect(()=>s.programs.updateCustom(created.assetId,1,{text:'Changed'})).toThrow('unavailable');
  expect(s.store.active().assets.find(asset=>asset.id===created.assetId)?.files?.['content.json']).toContain('Saved');
 }finally{await s.dispose();}
});
function setup(){const memory=new Map<string,string>(),store=createStore({getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,value);}}),hosts:ProgramHost[]=[];let fail=false,count=0;
 const programs=createPrograms(store,{resources:async()=>({manifest:{sha256:hash}} as any),prepare:async(draft,_,definitionId,revision)=>{if(fail)throw new Error('Invalid draft');return {id:crypto.randomUUID(),definitionId,revision,sourceSha256:hash,dependenciesSha256:hash,engineSha256:hash,code:'compiled',draft,createdAt:Date.now()} as ProgramSnapshot;},open:async host=>{hosts.push(host);let closed=false;return {get stats(){return {stopped:closed,pending:0};},stop(){closed=true;host.close();},async request(request){if(closed)throw new Error('Stopped');if(request.op==='dispatch')return JSON.stringify({count:++count});return 'null';}};}},serviceRegistry());const host=createHost();programs.attachHost(host);
 const control=createStationControl(store,{programs});const call=(method:string,params:unknown={})=>control.execute({method,params,version:control.version()}).result;
 const create=async(id:string,kind:'service'|'widget'|'action'='service')=>{if(kind==='widget')store.dispatchDock({type:'createWidget',widget:'program',id,target:{surface:'dashboard',intent:'append'}});const draft=defaultDraft(id);draft.role=kind;draft.methods=[{name:'query',input:{},output:{},effects:[]}];programs.create(id,kind,draft);await programs.activate(id);return store.active().programming!.instances.find(value=>value.id===id)!;};
 return {store,programs,hosts,control,call,create,setFailure:()=>{fail=true;},async dispose(){control.dispose();programs.dispose();await host.dispose();}};
}
test('programs deny unwired calls, unapproved resources, source reads and surface use',async()=>{const s=setup();try{await s.create('service');await s.programs.start('service');const host=s.hosts[0]!;await expect(host.call({op:'invoke',binding:'missing',input:'null'})).rejects.toThrow('Binding denied');await expect(host.call({op:'open'})).rejects.toThrow('Surface access');const item=s.store.active().programming!.instances[0]!;expect(()=>s.programs.wire(item.id,item.revision,[{alias:'source',serviceId:'builtin:assets',operations:['read'],resources:['greeting']}])).toThrow('operation');await s.create('widget','widget');const widget=s.store.active().programming!.instances.find(value=>value.id==='widget')!;s.programs.wire('widget',widget.revision,[{alias:'metadata',serviceId:'builtin:metadata',operations:['update'],resources:[]}]);await s.programs.start('widget');await expect(s.hosts[1]!.call({op:'invoke',binding:'metadata',input:JSON.stringify({assetId:'greeting',expectedRevision:0,name:'Denied'})})).rejects.toThrow('resource denied');}finally{await s.dispose();}});
test('multiple widget consumers share a named service and stopping invalidates retained handles',async()=>{const s=setup();try{await s.create('shared');await s.programs.start('shared');for(const id of ['one','two']){const item=await s.create(id,'widget');s.programs.wire(id,item.revision,[{alias:'shared',serviceId:'shared',operations:['query'],resources:[]}]);await s.programs.start(id);}expect(JSON.parse(await s.hosts[1]!.call({op:'invoke',binding:'shared',input:'null'}) as string)).toEqual({count:1});expect(JSON.parse(await s.hosts[2]!.call({op:'invoke',binding:'shared',input:'null'}) as string)).toEqual({count:2});s.programs.stop('shared');await expect(s.hosts[1]!.call({op:'invoke',binding:'shared',input:'null'})).rejects.toThrow();expect(s.programs.inspect().filter(value=>value.status==='running')).toHaveLength(0);}finally{await s.dispose();}});
test('invalid drafts retain activation; extraction excludes bindings and startup; cycles fail',async()=>{const s=setup();try{const first=await s.create('first');await s.create('second');s.programs.wire('first',first.revision,[{alias:'next',serviceId:'second',operations:['query'],resources:[]}]);const second=s.store.active().programming!.instances.find(value=>value.id==='second')!;expect(()=>s.programs.wire('second',second.revision,[{alias:'next',serviceId:'first',operations:['query'],resources:[]}])).toThrow('cycle');const before=s.store.active().programming!.instances.find(value=>value.id==='first')!.snapshotId;s.setFailure();await expect(s.programs.activate('first')).rejects.toThrow();expect(s.store.active().programming!.instances.find(value=>value.id==='first')!.snapshotId).toBe(before);const result=s.programs.saveDefinition('first','Reusable');const files=s.store.active().assets.find(value=>value.id===result.assetId)!.files!;expect(JSON.stringify(files)).not.toContain('bindings');expect(JSON.stringify(files)).not.toContain('startup');}finally{await s.dispose();}});
test('task programs require separate capability, placement, metadata write and instance ownership',async()=>{const s=setup();try{await s.create('owner');const scope=taskScopeSchema.parse({operations:['programs.create','programs.wire','programs.stop'],create:true,capabilities:['station:programs/execute','station:services/read'],surfaces:['dashboard']});const context=s.control.issueTask({name:'Denied',workspaceId:s.store.active().id,scope});const call=(method:string,params:unknown)=>s.control.executeFor(context,{method,params,version:s.control.version()});expect(()=>call('programs.stop',{instanceId:'owner'})).toThrow('another principal');call('programs.create',{instanceId:'task',kind:'service',draft:defaultDraft()});expect(()=>call('programs.wire',{instanceId:'task',expectedInstanceRevision:0,bindings:[{alias:'edit',serviceId:'builtin:metadata',operations:['update'],resources:['greeting']}]})).toThrow();expect(()=>call('programs.create',{instanceId:'workspace-navigation',kind:'widget',draft:defaultDraft()})).toThrow('destination');}finally{await s.dispose();}});
test('reserved virtual paths and malformed/stale UI events are rejected',()=>{expect(()=>draftSchema.parse({...defaultDraft(),files:{'node_modules/spoof.ts':''}})).toThrow();const surface=new RecordingSurface();surface.render({revision:0,root:{key:'list',type:'list',children:[{key:'one',type:'text',text:'One'}]}});expect(()=>surface.event({revision:0,sequence:1,key:'list',type:'select',value:'absent'})).toThrow('selection');expect(()=>surface.event({revision:0,sequence:1,key:'list',type:'unexpected'} as any)).toThrow();surface.event({revision:0,sequence:1,key:'list',type:'select',value:'one'});expect(()=>surface.event({revision:0,sequence:1,key:'list',type:'select',value:'one'})).toThrow('Stale');});

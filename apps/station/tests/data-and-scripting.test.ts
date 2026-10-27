import { expect, test } from "bun:test";
import { createStore } from "../src/features/workspace/application/store";
import { createStationControl } from "../src/features/commands/application/runtime";
import { evaluateQuickJS } from "../src/services/quickjs-engine";
import { createScriptExecution } from "../src/services/script-execution";
import { taskScopeSchema } from "@station/protocol";
import { scriptEvaluator } from "../src/contracts/script-runtime";
import { ociImage } from "../server/component-compiler-oci";
import { selectComponentCompiler } from "../server/component-compilers";
import { buildComponent } from "../server/component-build";
import { actionTargetCommands } from "../src/core/widget-action-targets";

const setup = () => {
  const memory = new Map<string,string>();
  const store = createStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,v);}});
  const control = createStationControl(store,{evaluateScript:evaluateQuickJS});
  const call = (method:string,params:object={}) => control.execute({method,params,version:control.version()}).result;
  const done = async (operation:any) => {
    for(let i=0;i<200;i++) { const status=call("operations.inspect",{operationId:operation.operationId}); if(status.status==="succeeded")return status.result; if(status.status==="failed"||status.status==="cancelled")throw new Error(JSON.stringify(status.error??status)); await new Promise(r=>setTimeout(r,5)); }
    throw new Error("Operation did not finish");
  };
  return {store,control,call,done};
};

test("QuickJS has no ambient IO, fresh globals, bounded CPU/memory/output and explicit JSON", async () => {
  expect((await evaluateQuickJS({code:'return [typeof fetch, typeof process, typeof window, typeof Worker]',input:null})).value).toEqual(["undefined","undefined","undefined","undefined"]);
  await evaluateQuickJS({code:'globalThis.secret = 42; console.log("hello"); return input * 2',input:4});
  expect((await evaluateQuickJS({code:'return typeof secret',input:null})).value).toBe("undefined");
  await expect(evaluateQuickJS({code:'while(true){}',input:null})).rejects.toThrow();
  await expect(evaluateQuickJS({code:'return "x".repeat(70000)',input:null})).rejects.toThrow("64 KB");
  await expect(evaluateQuickJS({code:'return new Array(50000000).fill(1)',input:null})).rejects.toThrow();
  await expect(evaluateQuickJS({code:'return Promise.resolve(1)',input:null})).rejects.toThrow("synchronous");
  const controller=new AbortController(); controller.abort();
  await expect(evaluateQuickJS({code:'return 1',input:null},controller.signal)).rejects.toThrow();
  expect((await evaluateQuickJS({code:'for(let i=0;i<50;i++)console.log(i);return 2',input:null})).logs).toHaveLength(20);
});

test("independent queries share one revision-checked source; formulas calculate without persistence", async () => {
  const {store,control,call,done}=setup();
  try {
    const source=call("asset.create",{name:"Shared records",kind:"data-source"});
    const before=store.active().assets.find(a=>a.id===source.id)!.files!["data.json"];
    const filtered=await done(call("data.query",{assetId:source.id,view:{search:"First"}}));
    const sorted=await done(call("data.query",{assetId:source.id,view:{sortBy:"amount",descending:true,presentation:"board"}}));
    expect(filtered.records).toHaveLength(1); expect(sorted.records[0].values.amount).toBe(7);
    expect(store.active().assets.find(a=>a.id===source.id)!.files!["data.json"]).toBe(before);
    call("data.mutate",{assetId:source.id,expectedAssetRevision:source.revision,column:{id:"double",label:"Double",type:"formula",formula:"row.amount * 2"}});
    const computed=await done(call("data.query",{assetId:source.id}));
    expect(computed.records[0].values.double).toBe(8);
    call("data.mutate",{assetId:source.id,expectedAssetRevision:computed.revision,record:{...computed.records[0],values:{...computed.records[0].values,amount:10}}});
    expect((await done(call("data.query",{assetId:source.id}))).records.find((r:any)=>r.id==="record-1").values.double).toBe(20);
    expect(store.active().assets.find(a=>a.id===source.id)!.files!["data.json"]).not.toContain('"double":');
    expect(()=>call("data.mutate",{assetId:source.id,expectedAssetRevision:computed.revision,removeId:"record-1"})).toThrow();
  } finally {control.dispose();}
});

test("tasks must separately hold source, mutation and script authority; catalog filters resources", async () => {
  const {store,control,call,done}=setup();
  try {
    const source=call("asset.create",{name:"Scoped records",kind:"data-source"});
    call("data.mutate",{assetId:source.id,expectedAssetRevision:source.revision,column:{id:"calc",label:"Calculated",type:"formula",formula:"1"}});
    const make=(capabilities:string[]=[])=>control.issueTask({name:"Data reader",workspaceId:store.active().id,scope:taskScopeSchema.parse({operations:["data.query","data.mutate","scripts.run","operations.inspect"],readableAssets:[source.id],capabilities})});
    const denied=make();
    expect(()=>control.executeFor(denied,{method:"data.query",params:{assetId:source.id}})).toThrow();
    const allowed=make([scriptEvaluator.id]);
    const operation=control.executeFor(allowed,{method:"data.query",params:{assetId:source.id}}).result;
    expect((await done(operation)).records[0].values.calc).toBe(1);
    expect(()=>control.executeFor(allowed,{method:"data.mutate",version:control.version(),params:{assetId:source.id,expectedAssetRevision:1,removeId:"record-1"}})).toThrow();
    const script=call("asset.create",{name:"Private script",kind:"script"});
    expect(()=>control.executeFor(allowed,{method:"scripts.run",params:{assetId:script.id,input:null},version:control.version()})).toThrow();
    const current=store.active().assets.find(a=>a.id===source.id)!;
    call("asset.files.patch",{assetId:source.id,expectedAssetRevision:current.revision,patch:{"data.json":JSON.stringify({version:1,provider:"station.assets",columns:[],records:[]})}});
    const visible=await done(control.executeFor(denied,{method:"data.query",params:{assetId:source.id}}).result);
    expect(visible.records.map((r:any)=>r.id)).toEqual([source.id]);
    expect(()=>call("data.mutate",{assetId:source.id,expectedAssetRevision:visible.revision,removeId:source.id})).toThrow("read-only");
  } finally {control.dispose();}
});

test("script service disposes and compiler selection never falls back to ambient host execution", async () => {
  const scripts=createScriptExecution();
  expect((await scripts.evaluate({code:'return input + 1',input:2})).value).toBe(3);
  scripts.dispose(); await expect(scripts.evaluate({code:'return 1',input:null})).rejects.toThrow("disposed");
  expect(()=>selectComponentCompiler("host-cargo")).toThrow("Unknown");
  expect(()=>ociImage("image:latest")).toThrow("immutable");
  expect(ociImage(`station/compiler@sha256:${"a".repeat(64)}`)).toContain("@sha256:");
});

test("compiler bytes pass the common verifier before any artifact is published", async () => {
  const {store,control}=setup();
  try {
    const asset=store.active().assets.find(a=>a.kind==="component")!;
    const source={id:asset.id,revision:asset.revision,files:asset.files!};
    const paths={artifactDir:".station-cloud/rejected-build",translator:"must-not-be-read",sandboxConfig:"unused"};
    await expect(buildComponent(source,paths,undefined,{id:"oci-container",compile:async()=>({bytes:new Uint8Array([0,97,115,109,1,0,0,0]),toolchain:"untrusted",environmentId:"fixture"})})).rejects.toThrow("not a WebAssembly Component");
    expect(await Bun.file(`${paths.artifactDir}/anything.wasm`).exists()).toBe(false);
  } finally {control.dispose();}
});

test("script operation cancellation and source revisions discard late results", async () => {
  const memory=new Map<string,string>(); const store=createStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,v);}});
  let resolve!: (value:any)=>void;
  const control=createStationControl(store,{evaluateScript:()=>new Promise(r=>{resolve=r;})});
  const call=(method:string,params:object={})=>control.execute({method,params,version:control.version()}).result;
  try {
    const asset=call("asset.create",{name:"Revision checks",kind:"script",files:{"main.js":"return 1"}});
    const op=call("scripts.run",{assetId:asset.id,input:null});
    call("asset.files.patch",{assetId:asset.id,expectedAssetRevision:0,patch:{"main.js":"return 3"}});
    resolve({value:1,logs:[],elapsedMs:1,engine:"quickjs-wasm"}); await new Promise(r=>setTimeout(r,0));
    expect(call("operations.inspect",{operationId:op.operationId}).status).toBe("failed");
    const cancelled=call("scripts.run",{assetId:asset.id,input:null});
    call("operations.cancel",{operationId:cancelled.operationId});
    resolve({value:2,logs:[],elapsedMs:1,engine:"quickjs-wasm"}); await new Promise(r=>setTimeout(r,0));
    const status=call("operations.inspect",{operationId:cancelled.operationId}); expect(status.status).toBe("cancelled"); expect(status.result).toBeUndefined();
  } finally {control.dispose();}
});

test("data-view creation checks linked source authority; runtime actions reveal existing ownership", () => {
  const {store,control,call}=setup();
  try {
    const source=call("asset.create",{name:"Protected source",kind:"data-source"});
    const task=control.issueTask({name:"Layout only",workspaceId:store.active().id,scope:taskScopeSchema.parse({operations:["dock.apply"],surfaces:["main"]})});
    expect(()=>control.executeFor(task,{method:"dock.apply",version:control.version(),params:{type:"createWidget",widget:"data-view",target:{surface:"main",intent:"tab"},defaults:{dataView:{sourceId:source.id}}}})).toThrow();
    const layout=store.active().dock;
    const target=Object.values(layout.panels).find(p=>p.kind==="widget"&&p.widget==="data-view")!;
    expect(actionTargetCommands(layout,target.id,false).some(c=>c.type==="activate"&&c.panelId===target.id)).toBe(true);
    expect(()=>actionTargetCommands(layout,"missing-instance",false)).toThrow("no longer");
    expect(actionTargetCommands(layout,"workspace-home",true).some(c=>c.type==="visibility"&&c.hidden)).toBe(false);
  } finally {control.dispose();}
});


test("scripted data sources require calculation access and capability, validate results and stay read only", async () => {
  const {store,control,call,done}=setup();
  try {
    const script=call("asset.create",{name:"Data calculation",kind:"script",files:{"main.js":"return {columns: input.columns, records: input.records.map(r => ({...r, values:{...r.values, amount:r.values.amount * 3}}))};"}});
    const source=call("asset.create",{name:"Computed source",kind:"data-source"});
    const document=JSON.parse(store.active().assets.find(a=>a.id===source.id)!.files!["data.json"]!);
    call("asset.files.patch",{assetId:source.id,expectedAssetRevision:0,patch:{"data.json":JSON.stringify({...document,provider:"script",scriptId:script.id})}});
    const task=(readableAssets:string[],capabilities:string[])=>control.issueTask({name:"Data computation",workspaceId:store.active().id,scope:taskScopeSchema.parse({operations:["data.query","operations.inspect"],readableAssets,capabilities})});
    expect(()=>control.executeFor(task([source.id],[scriptEvaluator.id]),{method:"data.query",params:{assetId:source.id}})).toThrow();
    expect(()=>control.executeFor(task([source.id,script.id],[]),{method:"data.query",params:{assetId:source.id}})).toThrow();
    const allowed=task([source.id,script.id],[scriptEvaluator.id]);
    const result=await done(control.executeFor(allowed,{method:"data.query",params:{assetId:source.id,view:{sortBy:"amount",descending:true}}}).result);
    expect(result.readOnly).toBe(true);expect(result.records[0].values.amount).toBe(21);
    expect(JSON.parse(store.active().assets.find(a=>a.id===source.id)!.files!["data.json"]!).records[0].values.amount).toBe(4);
    expect(()=>call("data.mutate",{assetId:source.id,expectedAssetRevision:1,removeId:"record-1"})).toThrow("read-only");
    call("asset.files.patch",{assetId:script.id,expectedAssetRevision:0,patch:{"main.js":"return {columns:[],records:[{id:'x',values:{extra:'invalid'}}]}"}});
    await expect(done(call("data.query",{assetId:source.id}))).rejects.toThrow();
  } finally {control.dispose();}
});

test("provider calculation revisions and cancellation discard late output", async () => {
  const memory=new Map<string,string>(); const store=createStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,v);}});
  let resolve!: (value:any)=>void;
  const control=createStationControl(store,{evaluateScript:()=>new Promise(r=>{resolve=r;})});
  const call=(method:string,params:object={})=>control.execute({method,params,version:control.version()}).result;
  try {
    const script=call("asset.create",{name:"Provider",kind:"script",files:{"main.js":"return input"}});
    const source=call("asset.create",{name:"Source",kind:"data-source",files:{"data.json":JSON.stringify({version:1,provider:"script",scriptId:script.id,columns:[],records:[]})}});
    const operation=call("data.query",{assetId:source.id});
    call("asset.files.patch",{assetId:script.id,expectedAssetRevision:0,patch:{"main.js":"return {columns:[],records:[]}"}});
    resolve({value:{columns:[],records:[]},logs:[],elapsedMs:1,engine:"quickjs-wasm"});await new Promise(r=>setTimeout(r,0));
    expect(call("operations.inspect",{operationId:operation.operationId}).status).toBe("failed");
    const cancelled=call("data.query",{assetId:source.id});call("operations.cancel",{operationId:cancelled.operationId});
    resolve({value:{columns:[],records:[]},logs:[],elapsedMs:1,engine:"quickjs-wasm"});await new Promise(r=>setTimeout(r,0));
    expect(call("operations.inspect",{operationId:cancelled.operationId}).status).toBe("cancelled");
  } finally {control.dispose();}
});

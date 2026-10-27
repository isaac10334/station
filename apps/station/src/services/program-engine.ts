/** Fixed, bounded Component worker. Engine identity and imports are rechecked inside it. */
import { EngineSession, type ProgramHost } from "../providers/scripting/session";
import { manifestSchema, type EngineManifest } from "../features/programs/contracts/engine";
let resources:Promise<{bytes:Uint8Array<ArrayBuffer>;shim:Uint8Array<ArrayBuffer>;manifest:EngineManifest}> | undefined;
export async function engineResources() {
  return resources ??= (async()=>{
    const response=await fetch('/api/scripting/manifest.json',{cache:'no-store'});if(!response.ok)throw new Error(await response.text());
    const manifest=manifestSchema.parse(await response.json());
    const [bytes,shim]=await Promise.all(['/api/scripting/engine.wasm','/api/component/translator.wasm'].map(async path=>{const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error('Runtime resource unavailable');return new Uint8Array(await response.arrayBuffer());}));
    return {bytes:bytes!,shim:shim!,manifest};
  })().catch(error=>{resources=undefined;throw error;});
}
export async function openProgramEngine(host:ProgramHost, signal?:AbortSignal,onLog?:()=>void) {
  const [tools,assets]=await Promise.all([import('../generated/program-tools'),engineResources()]);signal?.throwIfAborted();
  const manifest=host.profile==='portable-ui'?manifestSchema.parse(await fetch('/api/scripting/portable-ui.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Portable UI profile unavailable');return response.json();})):assets.manifest;
  if(manifest.sha256!==assets.manifest.sha256||manifest.importsSha256!==assets.manifest.importsSha256)throw new Error('Execution profiles disagree on engine identity');
  const url=URL.createObjectURL(new Blob([tools.runtimeWorker],{type:'text/javascript'}));const worker=new Worker(url,{type:'module'});
  const session=new EngineSession({send:value=>worker.postMessage(value),listen:listener=>worker.addEventListener('message',event=>listener(event.data)),onError:listener=>worker.addEventListener('error',event=>listener(new Error(event.message))),terminate:()=>{worker.terminate();URL.revokeObjectURL(url);}},host,onLog);
  const abort=()=>session.stop('Execution cancelled');signal?.addEventListener('abort',abort,{once:true});
  try {await session.request({op:'init',...assets,manifest},10000);signal?.throwIfAborted();return session;}catch(error){session.stop();throw error;}finally{signal?.removeEventListener('abort',abort);}
}

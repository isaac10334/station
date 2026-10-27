import { createScopedBinding } from "../../runtime/application/binding";
import { defineCapability } from '@loop-kit/capabilities';
import type { Host,ProviderRegistration } from '@loop-kit/host';
type Invocation={execute():Promise<unknown>};
const serviceInvocation=defineCapability<{call(request:Invocation):Promise<unknown>}>({id:'station:services/invoke',version:'1.0.0',methods:[{name:'call',input:{type:'object'},output:{},effects:[{operation:'service.invoke'}]}]});
/** Named host leases share the running instance, never create another guest.
 * Opaque invocation objects are made only after Station's caller/resource checks.
 * Direct/retained JS acquisition conveys no guest authority.
 */
export function serviceRegistry(){
 let host:Host|undefined;const registrations=new Map<string,ProviderRegistration>(),authorized=new WeakSet<object>();
 return {
  attach(value:Host){host=value;host.define(serviceInvocation,{name:'Explicit service invocation',description:'Named instances. Policy-checked invocation objects are required; acquiring this contract grants no authority.'});},
  register(id:string,check:()=>void){if(!host)return;this.remove(id);const registration=host.provide(serviceInvocation,{create:({signal})=>({async call(request){signal.throwIfAborted();check();if(!authorized.has(request))throw new Error('Service invocation authority denied');authorized.delete(request);const result=await request.execute();signal.throwIfAborted();check();return result;}})},{serviceId:id,name:id,lifetime:"shared"});registrations.set(id,registration);},
  remove(id:string){const old=registrations.get(id);registrations.delete(id);void old?.unregister().catch(()=>{});},
  async call(id:string,execute:()=>Promise<unknown>,signal:AbortSignal){if(!host)throw new Error('Service lifecycle host unavailable');const scope=host.scope({name:'Program consumer '+id}),abort=()=>void scope.revoke();signal.addEventListener('abort',abort,{once:true});try{signal.throwIfAborted();const handle=await createScopedBinding(scope,serviceInvocation,{kind:"named",serviceId:id},host).acquire();signal.throwIfAborted();const request={execute};authorized.add(request);try{return await handle.value.call(request);}finally{authorized.delete(request);}}finally{signal.removeEventListener('abort',abort);await scope.revoke();}},
  dispose(){for(const id of registrations.keys())this.remove(id);},
 };
}
